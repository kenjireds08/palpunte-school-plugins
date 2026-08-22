#!/usr/bin/env node
/**
 * warn-non-null-assertion.js の回帰テスト（node:test）。
 *
 * 目的: 誤検知ゼロを固定する。`!==` / `!!` / 論理否定 / 文字列・コメント内で
 *   発火すると「毎回鳴る Hook」になり、読み流されて無いより悪くなる。
 *   見逃し（false negative）は lint / CI 側が最終防衛するため許容。
 *
 * 実行: npm run test:hooks
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const HOOK = path.join(__dirname, 'warn-non-null-assertion.js');

function run(payload) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return out.trim() ? JSON.parse(out) : null;
}

function write(filePath, content) {
  return run({ tool_name: 'Write', tool_input: { file_path: filePath, content } });
}

// --- 発火すべきケース -------------------------------------------------

test('HIT: JSX 描画式の user!.name', () => {
  const r = write('/proj/app/page.tsx', 'export default function P(){ return <div>{user!.name}</div> }');
  assert.strictEqual(r.decision, 'block');
  assert.match(r.reason, /非nullアサーション/);
});

test('HIT: 関数呼び出し結果への getUser()!.id', () => {
  assert.ok(write('/proj/lib/a.ts', 'const id = getUser()!.id;'));
});

test('HIT: 配列要素への rows[0]!.value', () => {
  assert.ok(write('/proj/lib/a.ts', 'const v = rows[0]!.value;'));
});

test('HIT: 文末の foo!;', () => {
  assert.ok(write('/proj/lib/a.ts', 'const x = maybe!;'));
});

test('HIT: as と組み合わせた foo! as Bar', () => {
  assert.ok(write('/proj/lib/a.ts', 'const x = data! as Item;'));
});

test('HIT: Edit の new_string でも検知する', () => {
  const r = run({
    tool_name: 'Edit',
    tool_input: { file_path: '/proj/app/page.tsx', old_string: 'a', new_string: '<span>{order!.total}</span>' },
  });
  assert.strictEqual(r.decision, 'block');
});

test('HIT: MultiEdit の edits 配列でも検知する', () => {
  const r = run({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: '/proj/lib/a.ts',
      edits: [{ old_string: 'a', new_string: 'const b = 1;' }, { old_string: 'c', new_string: 'const d = item!.id;' }],
    },
  });
  assert.strictEqual(r.decision, 'block');
});

// --- 発火してはいけないケース（誤検知ゼロが最重要） ---------------------

test('SKIP: 比較演算子 !== では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', 'if (user !== null) { show(user); }'), null);
});

test('SKIP: 空白なしの a!==b でも発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', 'const ok = a!==b;'), null);
});

test('SKIP: 不等価 != では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', 'const ok = a != b;'), null);
});

test('SKIP: 二重否定 !!x では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', 'const has = !!value;'), null);
});

test('SKIP: 論理否定 !x では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', 'if (!user) return null;'), null);
});

test('SKIP: 文字列リテラル内の ! では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', "const msg = 'Done!, next step';"), null);
});

test('SKIP: コメント内の ! では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.ts', '// ここで user!.name は使わないこと\nconst a = 1;'), null);
});

test('SKIP: ?. と ?? の正しい書き方では発火しない', () => {
  assert.strictEqual(write('/proj/app/page.tsx', "<div>{user?.name ?? '—'}</div>"), null);
});

test('SKIP: 対象外の拡張子（.js / .md / .css）では発火しない', () => {
  assert.strictEqual(write('/proj/lib/a.js', 'const id = getUser()!.id;'), null);
  assert.strictEqual(write('/proj/docs/note.md', 'user!.name はダメ'), null);
});

test('SKIP: 型定義ファイル .d.ts は対象外', () => {
  assert.strictEqual(write('/proj/types/global.d.ts', 'declare const x: Item!;'), null);
});

test('SKIP: Read 等の他ツールでは発火しない', () => {
  assert.strictEqual(run({ tool_name: 'Read', tool_input: { file_path: '/proj/a.tsx' } }), null);
});

test('SKIP: 壊れた入力でも落ちない', () => {
  const out = execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(out.trim(), '');
});
