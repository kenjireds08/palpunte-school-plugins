#!/usr/bin/env node
/**
 * Claude Code Statusline - Pattern 5 Fine Bar + TrueColor Gradient (school-starter v1.21.0〜)
 *
 * Claude Code v2.1.80+ rate_limits 対応のステータスライン。
 * チャット欄下部にモデル名・コンテキスト使用率・5h/7d ウィンドウ使用率 + reset 時刻 + ブランチ + 行差分を 2 行で表示する。
 *
 * 出典: 逆瀬川氏 (@gyakuse) 「Claude Code の使用率がステータスラインに表示できるようになったので表示用のスクリプトを作った話」Pattern 5
 * 記事URL: https://nyosegawa.com/posts/claude-code-statusline-rate-limits/
 *
 * Line 1: Model | ctx bar | +added/-removed | branch
 * Line 2: 5h bar + reset 時刻 | 7d bar + reset 時刻
 *
 * v1.20.x までは Python 製 (statusline.py) だったが、新品 Windows は本物の Python が未インストール
 * (Microsoft Store のダミー stub のみ) のため受講生がステータスラインを表示できない問題が頻発した。
 * v1.21.0 で Node.js 製に移行 (Node は第1回で全受講生が導入するため追加インストール不要)。
 * あわせて reset 時刻フォーマットを OS 非依存にし、Windows でも reset 時刻が表示されるよう修正。
 *
 * 他のパターン (Sparkline / Ring Meter / Braille Dots) を試したい受講生は、記事URLとPattern番号を Claude Code に渡すと
 * 自動で差し替えてくれる:
 *     https://nyosegawa.com/posts/claude-code-statusline-rate-limits/ これを入れたい. Pattern X
 */
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');

// ---------- 入力 (stdin の JSON) ----------
let data = {};
try {
  const input = fs.readFileSync(0, 'utf8');
  data = JSON.parse(input);
} catch (e) {
  data = {};
}

// ---------- ANSI ----------
const R = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const BLOCKS = ' ▏▎▍▌▋▊▉█';

function gradient(pct) {
  // Green -> Yellow -> Red TrueColor gradient
  pct = Math.min(Math.max(pct, 0), 100);
  if (pct < 50) {
    const r = Math.floor(pct * 5.1);
    return `\x1b[38;2;${r};200;80m`;
  }
  const g = Math.floor(200 - (pct - 50) * 4);
  return `\x1b[38;2;255;${Math.max(g, 0)};60m`;
}

function bar(pct, width = 10) {
  // Fine-grained progress bar with 1/8 precision
  pct = Math.min(Math.max(pct, 0), 100);
  const filled = (pct * width) / 100;
  const full = Math.floor(filled);
  const frac = Math.floor((filled - full) * 8);
  let b = '█'.repeat(full);
  if (full < width) {
    b += BLOCKS[frac];
    b += '░'.repeat(width - full - 1);
  }
  return b;
}

function fmt(label, pct) {
  const p = Math.round(pct);
  return `${DIM}${label}${R} ${gradient(pct)}${bar(pct)} ${p}%${R}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatReset(ts) {
  // Unix timestamp(秒) を JST の reset 時刻に整形。OS 非依存(Windows でも動く)。
  if (!ts) return '';
  try {
    // JST = UTC+9。getUTC* に +9h を足して算出すると locale 依存を避けられる。
    const j = new Date(ts * 1000 + 9 * 3600 * 1000);
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    const h = j.getUTCHours();
    const mi = pad2(j.getUTCMinutes());
    const sameDay =
      j.getUTCFullYear() === now.getUTCFullYear() &&
      j.getUTCMonth() === now.getUTCMonth() &&
      j.getUTCDate() === now.getUTCDate();
    if (sameDay) {
      return `${DIM}reset ${h}:${mi}${R}`;
    }
    return `${DIM}reset ${j.getUTCMonth() + 1}/${j.getUTCDate()} ${h}:${mi}${R}`;
  } catch (e) {
    return '';
  }
}

// ---------- Parse ----------
const model = (data.model && data.model.display_name) || 'Claude';
const ctxPct = (data.context_window && data.context_window.used_percentage) || 0;

// Git
const cwd = data.cwd || '';
let gitBranch = '';
if (cwd) {
  try {
    if (fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
      gitBranch = execSync(
        `git -C "${cwd}" --no-optional-locks rev-parse --abbrev-ref HEAD`,
        { stdio: ['ignore', 'pipe', 'ignore'] }
      )
        .toString()
        .trim();
    }
  } catch (e) {
    gitBranch = '';
  }
}

const linesAdded = (data.cost && data.cost.total_lines_added) || 0;
const linesRemoved = (data.cost && data.cost.total_lines_removed) || 0;

// Rate limits (v2.1.80+)
const rl = data.rate_limits || {};
const five = rl.five_hour || {};
const seven = rl.seven_day || {};
const fivePct = five.used_percentage;
const sevenPct = seven.used_percentage;
const fiveReset = five.resets_at;
const sevenReset = seven.resets_at;

// ---------- Line 1: Model | ctx | diff | branch ----------
const SEP = ` ${DIM}|${R} `;
const parts1 = [`${BOLD}${model}${R}`, fmt('ctx', ctxPct)];

if (linesAdded > 0 || linesRemoved > 0) {
  parts1.push(`\x1b[38;2;151;201;195m+${linesAdded}/-${linesRemoved}${R}`);
}

if (gitBranch) {
  parts1.push(`${DIM}${gitBranch}${R}`);
}

const line1 = parts1.join(SEP);

// ---------- Line 2: 5h | 7d ----------
const parts2 = [];

if (fivePct != null) {
  let s = fmt('5h', fivePct);
  const rst = formatReset(fiveReset);
  if (rst) s += ` ${rst}`;
  parts2.push(s);
}

if (sevenPct != null) {
  let s = fmt('7d', sevenPct);
  const rst = formatReset(sevenReset);
  if (rst) s += ` ${rst}`;
  parts2.push(s);
}

const line2 = parts2.length ? parts2.join(SEP) : '';

// ---------- Output ----------
process.stdout.write(line1 + '\n');
if (line2) process.stdout.write(line2);
