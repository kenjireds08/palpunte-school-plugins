#!/usr/bin/env node
/**
 * Hook 回帰テスト: guard-env-access.js
 *
 * 実行: `npm run test:hooks` または `node --test plugins/school-starter/scripts/guard-env-access.test.js`
 * 前提: Node 18+（node:test 利用）
 *
 * 目的:
 *   - .env 系シークレットの「読み取り」コマンドを確実にブロックする（正例）
 *   - 正規の開発操作（npm run dev / .env.example の取り扱い / 書き込み・コピー）を誤爆しない（負例）
 *   - exit code 2（blocking）/ 0（pass）/ 不正入力素通しの確認
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert');
const { detect } = require('./guard-env-access.js');

const HOOK_PATH = path.join(__dirname, 'guard-env-access.js');

function runExit(command) {
  const r = spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  return r.status;
}

// ブロックされるべき（.env 実ファイルの中身を読む）
const BLOCK_CASES = [
  ['cat .env', '基本'],
  ['cat .env.local', 'local'],
  ['cat ./.env.production', '相対パス + production'],
  ['less .env.local', 'less'],
  ['more .env', 'more'],
  ['tail -n 20 .env.local', 'tail オプション付き'],
  ['head .env', 'head'],
  ['grep SUPABASE .env', 'grep'],
  ['grep -i key .env.local', 'grep オプション付き'],
  ["awk '{print}' .env", 'awk'],
  ["sed -n '1,5p' .env.local", 'sed'],
  ['source .env', 'source'],
  ['. ./.env.local', 'dot source'],
  ['base64 .env.local', 'base64 エンコードで覗く'],
  ['xxd .env', 'xxd'],
  ['strings .env.local', 'strings'],
  ['cat .env.development', 'development'],
  ['node app.js < .env.local', '入力リダイレクト'],
  ['echo start && cat .env.local', 'チェーン内の cat'],
  ['cat .env.example .env.local', '実ファイル混在は読み取り扱い'],
];

// 通すべき（正規の開発操作・ダミーファイル・読み取り以外）
const PASS_CASES = [
  ['npm run dev', 'dev サーバー（内部で .env を読むがコマンドに出ない）'],
  ['next dev', 'next dev'],
  ['npm install', 'install'],
  ['vite build', 'vite'],
  ['cat .env.example', 'ダミーは許可'],
  ['cat .env.sample', 'sample 許可'],
  ['cat .env.template', 'template 許可'],
  ['cp .env.example .env.local', '新規プロジェクト定番のコピー'],
  ['source .env.example', 'ダミーの source'],
  ['echo "KEY=value" >> .env.local', '書き込みは対象外'],
  ['touch .env.local', '作成は対象外'],
  ['rm .env.local', '削除は対象外'],
  ['ls -la .env*', '一覧は中身を見ない'],
  ['cat README.md', '無関係ファイル'],
  ['cat .environment', '.environment は .env ではない'],
  ['cat .envrc', '.envrc は対象外（.env\\b 境界）'],
  ['git status', 'git'],
  ['python script.py', 'スクリプトファイル実行は中身解析しない（誤爆回避）'],
  ['python -c "print(1)"', '.env を含まない inline'],
  // inline スクリプトは読み書き判別不可のため対象外（Codex P2・deny/sandbox に委ねる）
  ['node -e "require(\'fs\').writeFileSync(\'.env.local\',\'KEY=x\')"', '書き込み inline は通す'],
  ['python -c "open(\'.env\').read()"', '読み取り inline も guard 対象外（deny に委ねる）'],
];

test('detect(): ブロックすべきケース', () => {
  for (const [cmd, desc] of BLOCK_CASES) {
    assert.strictEqual(detect(cmd), true, `BLOCK されるべき: ${desc} :: ${cmd}`);
  }
});

test('detect(): 通すべきケース', () => {
  for (const [cmd, desc] of PASS_CASES) {
    assert.strictEqual(detect(cmd), false, `PASS されるべき: ${desc} :: ${cmd}`);
  }
});

test('exit code: ブロック時は 2', () => {
  assert.strictEqual(runExit('cat .env.local'), 2);
});

test('exit code: 通過時は 0', () => {
  assert.strictEqual(runExit('npm run dev'), 0);
});

test('不正な JSON 入力は素通し（exit 0）', () => {
  const r = spawnSync(process.execPath, [HOOK_PATH], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});
