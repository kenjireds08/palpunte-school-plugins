#!/usr/bin/env node
/**
 * flow-gate.js の回帰テスト（node:test）。
 *
 * 目的: 節目検知の対象/非対象が意図どおりかを固定する。
 *   誤爆（関係ないファイルで停止させる）も、見逃し（節目で止まらない）も
 *   受講生の体験を直接壊すため、両方をテストで押さえる。
 *
 * 実行: npm run test:hooks
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, 'flow-gate.js');

function run(filePath, toolName = 'Write') {
  const payload = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } });
  const out = execFileSync('node', [HOOK], {
    input: payload,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: '/PLUGIN_ROOT' },
  });
  return out.trim() ? JSON.parse(out) : null;
}

// --- 発火すべきケース -------------------------------------------------

test('HIT: DESIGN.md はモック着手前に停止させる', () => {
  const r = run('/proj/DESIGN.md');
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /モックアップ/);
});

test('HIT: spec-light はDESIGN.mdへ誘導する', () => {
  const r = run('/proj/docs/003_spec-light.md');
  assert.match(r.reason, /DESIGN\.md/);
});

test('HIT: 連番なしの spec-light はリネームも促す', () => {
  const r = run('/proj/docs/spec-light.md');
  assert.match(r.reason, /連番/);
});

test('HIT: estimate.md は HTML 御見積書を提案する', () => {
  const r = run('/proj/docs/005_estimate.md');
  assert.match(r.reason, /御見積書/);
});

test('HIT: docs/plans/*.md は判断用HTMLを作らせる', () => {
  const r = run('/proj/docs/plans/T-02-supabase-plan.md');
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /判断用 HTML/);
  assert.match(r.reason, /Codex/);
  // ひな形の絶対パスを CLAUDE_PLUGIN_ROOT から組み立てて案内している
  assert.match(r.reason, /\/PLUGIN_ROOT\/references\/plan-summary-template\.html/);
});

// --- 発火してはいけないケース -----------------------------------------

test('SKIP: plans/archive 配下は完了済みなので発火しない', () => {
  assert.strictEqual(run('/proj/docs/plans/archive/T-01-plan.md'), null);
});

test('SKIP: 判断用HTML自身では発火しない（無限ループ防止）', () => {
  assert.strictEqual(run('/proj/docs/plans/T-02-plan.html'), null);
});

test('SKIP: plans 配下の README/CLAUDE は対象外', () => {
  assert.strictEqual(run('/proj/docs/plans/README.md'), null);
});

test('SKIP: 通常のドキュメントでは発火しない', () => {
  assert.strictEqual(run('/proj/docs/000_PROJECT_STATUS.md'), null);
});

test('SKIP: estimate_for_client は清書後なので対象外', () => {
  assert.strictEqual(run('/proj/docs/006_estimate_for_client.html'), null);
});

test('SKIP: Edit（手直し）では発火しない', () => {
  assert.strictEqual(run('/proj/DESIGN.md', 'Edit'), null);
});

test('SKIP: 壊れた入力でも落ちない', () => {
  const out = execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(out.trim(), '');
});
