#!/usr/bin/env python3
"""Claude Code Statusline - Pattern 5 Fine Bar + TrueColor Gradient (school-starter v1.17.0〜)

Claude Code v2.1.80+ rate_limits 対応のステータスライン。
チャット欄下部にモデル名・コンテキスト使用率・5h/7d ウィンドウ使用率 + reset 時刻 + ブランチ + 行差分を 2 行で表示する。

出典: 逆瀬川氏 (@gyakuse) 「Claude Code の使用率がステータスラインに表示できるようになったので表示用のスクリプトを作った話」Pattern 5
記事URL: https://nyosegawa.com/posts/claude-code-statusline-rate-limits/

Line 1: Model | ctx bar | +added/-removed | branch
Line 2: 5h bar + reset 時刻 | 7d bar + reset 時刻

v1.16.x までは Pattern 1 (Minimal Dots・1 行表示) を同梱していたが、5h / 7d リミット reset 時刻が表示されないため
「いつ復旧するか分からない」問題が発生していた。v1.17.0 で Pattern 5 (Fine Bar + reset 時刻) に昇格。

他のパターン (Sparkline / Ring Meter / Braille Dots) を試したい受講生は、記事URLとPattern番号を Claude Code に渡すと
自動で差し替えてくれる:
    https://nyosegawa.com/posts/claude-code-statusline-rate-limits/ これを入れたい. Pattern X
"""
import json, sys, subprocess, os
from datetime import datetime, timezone, timedelta

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

data = json.load(sys.stdin)

# ---------- ANSI ----------
R = '\033[0m'
DIM = '\033[2m'
BOLD = '\033[1m'
BLOCKS = ' ▏▎▍▌▋▊▉█'
JST = timezone(timedelta(hours=9))


def gradient(pct):
    """Green -> Yellow -> Red TrueColor gradient"""
    pct = min(max(pct, 0), 100)
    if pct < 50:
        r = int(pct * 5.1)
        return f'\033[38;2;{r};200;80m'
    else:
        g = int(200 - (pct - 50) * 4)
        return f'\033[38;2;255;{max(g, 0)};60m'


def bar(pct, width=10):
    """Fine-grained progress bar with 1/8 precision"""
    pct = min(max(pct, 0), 100)
    filled = pct * width / 100
    full = int(filled)
    frac = int((filled - full) * 8)
    b = '█' * full
    if full < width:
        b += BLOCKS[frac]
        b += '░' * (width - full - 1)
    return b


def fmt(label, pct):
    p = round(pct)
    return f'{DIM}{label}{R} {gradient(pct)}{bar(pct)} {p}%{R}'


def format_reset(ts):
    """Format Unix timestamp to JST reset time"""
    if not ts:
        return ''
    try:
        dt = datetime.fromtimestamp(ts, tz=JST)
        now = datetime.now(tz=JST)
        if dt.date() == now.date():
            return f'{DIM}reset {dt.strftime("%-H:%M")}{R}'
        else:
            return f'{DIM}reset {dt.strftime("%-m/%-d %-H:%M")}{R}'
    except Exception:
        return ''


# ---------- Parse ----------
model = data.get('model', {}).get('display_name', 'Claude')
ctx_pct = data.get('context_window', {}).get('used_percentage', 0) or 0

# Git
cwd = data.get('cwd', '')
git_branch = ''
if cwd and os.path.isdir(cwd):
    try:
        git_branch = subprocess.check_output(
            ['git', '-C', cwd, '--no-optional-locks', 'rev-parse', '--abbrev-ref', 'HEAD'],
            stderr=subprocess.DEVNULL, text=True
        ).strip()
    except Exception:
        pass

lines_added = data.get('cost', {}).get('total_lines_added', 0) or 0
lines_removed = data.get('cost', {}).get('total_lines_removed', 0) or 0

# Rate limits (v2.1.80+)
rl = data.get('rate_limits', {})
five = rl.get('five_hour', {})
seven = rl.get('seven_day', {})
five_pct = five.get('used_percentage')
seven_pct = seven.get('used_percentage')
five_reset = five.get('resets_at')
seven_reset = seven.get('resets_at')

# ---------- Line 1: Model | ctx | diff | branch ----------
SEP = f' {DIM}|{R} '
parts1 = [f'{BOLD}{model}{R}', fmt('ctx', ctx_pct)]

if lines_added > 0 or lines_removed > 0:
    parts1.append(f'\033[38;2;151;201;195m+{lines_added}/-{lines_removed}{R}')

if git_branch:
    parts1.append(f'{DIM}{git_branch}{R}')

line1 = SEP.join(parts1)

# ---------- Line 2: 5h | 7d ----------
parts2 = []

if five_pct is not None:
    s = fmt('5h', five_pct)
    rst = format_reset(five_reset)
    if rst:
        s += f' {rst}'
    parts2.append(s)

if seven_pct is not None:
    s = fmt('7d', seven_pct)
    rst = format_reset(seven_reset)
    if rst:
        s += f' {rst}'
    parts2.append(s)

line2 = SEP.join(parts2) if parts2 else ''

# ---------- Output ----------
print(line1)
if line2:
    print(line2, end='')
