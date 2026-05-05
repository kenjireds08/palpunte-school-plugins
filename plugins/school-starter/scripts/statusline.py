#!/usr/bin/env python3
"""Pattern 1: Minimal Dots - colored circles with numbers only

Claude Code v2.1.80+ rate_limits 対応のステータスライン。
チャット欄下部にモデル名・コンテキスト使用率・5時間/7日ウィンドウ使用率を表示する。

出典: 逆瀬川氏 (@gyakuse) 「Claude Codeの使用率がステータスラインに表示できるようになったので表示用のスクリプトを作った話」
記事URL: https://nyosegawa.com/posts/claude-code-statusline-rate-limits/

このスクリプトは school-starter プラグインがフォールバック用に同梱する Pattern 1 (Minimal)。
他のパターン (Sparkline / Ring Meter / Fine Bar / Braille Dots) を試したい受講生は、
記事URLとPattern番号をClaude Codeに渡すと自動で差し替えてくれる:
    https://nyosegawa.com/posts/claude-code-statusline-rate-limits/ これを入れたい. Pattern5
"""
import json, sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

data = json.load(sys.stdin)

R = '\033[0m'
DIM = '\033[2m'
BOLD = '\033[1m'

def gradient(pct):
    if pct < 50:
        r = int(pct * 5.1)
        return f'\033[38;2;{r};200;80m'
    else:
        g = int(200 - (pct - 50) * 4)
        return f'\033[38;2;255;{max(g, 0)};60m'

def dot(pct):
    p = round(pct)
    return f'{gradient(pct)}●{R} {BOLD}{p}%{R}'

model = data.get('model', {}).get('display_name', 'Claude')
parts = [f'{BOLD}{model}{R}']

ctx = data.get('context_window', {}).get('used_percentage')
if ctx is not None:
    parts.append(f'ctx {dot(ctx)}')

five = data.get('rate_limits', {}).get('five_hour', {}).get('used_percentage')
if five is not None:
    parts.append(f'5h {dot(five)}')

week = data.get('rate_limits', {}).get('seven_day', {}).get('used_percentage')
if week is not None:
    parts.append(f'7d {dot(week)}')

print(f'  {DIM}·{R}  '.join(parts), end='')
