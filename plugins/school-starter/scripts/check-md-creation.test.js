#!/usr/bin/env node
/**
 * Hook 回帰テスト: check-md-creation.js
 *
 * 実行: `npm run test:hooks` または `node --test plugins/school-starter/scripts/check-md-creation.test.js`
 * 前提: Node 18+（node:test 利用）
 *
 * 目的:
 *   - ルート直下の雑多な .md / .txt 新規作成をブロックする（正例）
 *   - 置き場所が仕様で決まっている標準ファイル（robots.txt 等）・許可ディレクトリ配下を誤爆しない（負例）
 *   - v1.27.3 の受講生報告 2 件（小文字 obsidian/ が通らない・public/robots.txt が作れない）の回帰防止
 *   - Windows 区切り（\）でも同じ判定になること
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

const HOOK_PATH = path.join(__dirname, 'check-md-creation.js');

function runExit(file_path) {
  const r = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({ tool_input: { file_path } }),
    encoding: 'utf8',
  });
  return r.status;
}

// ブロックされるべき（存在しないパスを使い「新規作成」扱いにする）
const BLOCK_CASES = [
  ['/nonexistent-proj/NOTES.md', 'ルート直下の NOTES.md'],
  ['/nonexistent-proj/TODO.txt', 'ルート直下の TODO.txt'],
  ['/nonexistent-proj/src/memo.txt', 'src/ 配下の雑多な .txt'],
  ['C:\\nonexistent-proj\\NOTES.md', 'Windows 区切りでもブロック'],
];

// 通すべき
const PASS_CASES = [
  ['/nonexistent-proj/public/robots.txt', 'public/robots.txt（報告 #2）'],
  ['/nonexistent-proj/public/ads.txt', 'public/ads.txt'],
  ['/nonexistent-proj/.well-known/security.txt', '.well-known/security.txt'],
  ['/nonexistent-proj/robots.txt', 'ルート直下でも robots.txt は標準ファイル'],
  ['/nonexistent-proj/requirements.txt', 'Python の requirements.txt'],
  ['/nonexistent-proj/requirements-dev.txt', 'requirements-dev.txt'],
  ['C:\\nonexistent-proj\\public\\robots.txt', 'Windows 区切りの public/robots.txt'],
  ['/nonexistent-proj/obsidian/note.md', '小文字 obsidian/（報告 #1）'],
  ['/nonexistent-proj/Obsidian/note.md', '大文字 Obsidian/'],
  ['/nonexistent-proj/docs/spec.md', 'docs/ 配下'],
  ['/nonexistent-proj/.claude/projects/x/memory/fact.md', 'memory/ 配下（v1.26.1）'],
  ['/nonexistent-proj/README.md', '標準ドキュメント README'],
  ['/nonexistent-proj/DESIGN.md', '標準ドキュメント DESIGN'],
  ['/nonexistent-proj/src/index.ts', '.md/.txt 以外は対象外'],
];

for (const [p, label] of BLOCK_CASES) {
  test(`BLOCK: ${label} (${p})`, () => {
    assert.strictEqual(runExit(p), 2);
  });
}

for (const [p, label] of PASS_CASES) {
  test(`PASS: ${label} (${p})`, () => {
    assert.strictEqual(runExit(p), 0);
  });
}

test('不正 JSON は素通し（他 Hook に副作用を出さない）', () => {
  const r = spawnSync(process.execPath, [HOOK_PATH], { input: '{not json', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});
