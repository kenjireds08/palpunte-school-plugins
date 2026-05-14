#!/usr/bin/env node
/**
 * Hook 回帰テスト: warn-dangerous-prompts.js
 *
 * 実行: `npm run test:hooks` または `node --test plugins/school-starter/scripts/warn-dangerous-prompts.test.js`
 *
 * 前提:
 *   - Node 18+ 必須（`node:test` 利用のため）。Node 14/16 では `node: bad option: --test` で落ちる
 *
 * 目的:
 *   - v1.16.0 で Codex 独立レビューが発見した偽陰性（「消したい」「ですか？」）の再発防止
 *   - リリース前の必須ゲート（自己 for ループテストでは網羅性を保証できない教訓から導入）
 *
 * 仕組み:
 *   - 子プロセスで warn-dangerous-prompts.js を起動し、stdin に UserPromptSubmit JSON を流す
 *   - stdout に hookSpecificOutput が返れば HIT、空なら SKIP と判定
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');

const HOOK_PATH = path.join(__dirname, 'warn-dangerous-prompts.js');

function runHook(prompt) {
  const result = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({ prompt }),
    encoding: 'utf8',
  });
  const stdout = result.stdout || '';
  if (!stdout.trim()) {
    return { hit: false, message: '' };
  }
  try {
    const parsed = JSON.parse(stdout);
    return {
      hit: true,
      message: parsed.hookSpecificOutput?.additionalContext || '',
    };
  } catch (_) {
    return { hit: false, message: '' };
  }
}

// HIT すべきケース（警告が必ず出る）
const HIT_CASES = [
  ['本番DBを全部削除して', 'production-destroy: 直接命令'],
  ['本番ユーザーを消したい', 'production-destroy: 消したい（v1.16.0 偽陰性）'],
  ['本番DBを削除していいですか？', 'production-destroy: 確認質問（v1.16.0 偽陰性）'],
  ['本番のレコードを消してもいい？', 'production-destroy: 消す + 質問'],
  ['.envの値を表示して', 'env: 値表示要求'],
  ['SUPABASE_SERVICE_ROLE_KEYを教えて', 'env: secret key 漏洩要求'],
  ['DROP TABLE users;', 'sql: DROP TABLE 直書き'],
  ['truncate table reservations', 'sql: TRUNCATE'],
  ['git push --force main', 'force push to main'],
  ['npm publish', 'npm publish'],
  // env 系は実害が大きいため、否定文脈でも警告を出す（NEGATION_PATTERN は削除系動詞専用設計）
  ['.env が表示されちゃダメだよね', 'env: 否定でも警告（仕様）'],
];

// SKIP すべきケース（警告が出ない）
const SKIP_CASES = [
  ['本番デプロイ前に削除フラグの動作確認をしたい', 'production false-positive: 対象語なし'],
  ['本番DBを削除しないでね', 'production: 否定文脈'],
  ['本番ユーザーを消したくない', 'production: 消したくない（否定）'],
  ['教材で DROP TABLE の構文を解説したい', 'sql: 教材文脈'],
  ['lesson-08-notes に DROP TABLE のメモを書いて', 'sql: メタ文脈（lesson/メモ）'],
  ['今日の天気はどうですか？', '無関係'],
];

for (const [input, name] of HIT_CASES) {
  test(`HIT: ${name}`, () => {
    const { hit, message } = runHook(input);
    assert.strictEqual(
      hit,
      true,
      `期待: 警告が出る / 実際: 素通り\n  input: ${JSON.stringify(input)}`,
    );
    assert.ok(
      message.includes('IMPORTANT'),
      `期待: additionalContext に "IMPORTANT" を含む / 実際: ${JSON.stringify(message)}`,
    );
  });
}

for (const [input, name] of SKIP_CASES) {
  test(`SKIP: ${name}`, () => {
    const { hit } = runHook(input);
    assert.strictEqual(
      hit,
      false,
      `期待: 素通り（誤検知なし）/ 実際: 警告が出た\n  input: ${JSON.stringify(input)}`,
    );
  });
}
