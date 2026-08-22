#!/usr/bin/env node
/**
 * check-dependency-prs.js の回帰テスト（node:test）。
 *
 * 目的: 誤検知（関係ないプロジェクトで毎回声をかける）と見逃し（届いても黙っている）を両方押さえる。
 *   毎セッション不要な話題を切り出す Hook は、受講生に読み流される＝無いより悪くなる。
 *
 * 実際の git リポジトリを一時フォルダに作り、Dependabot が作るのと同じ形の
 * リモート参照（refs/remotes/origin/dependabot/...）を置いて検証する。通信は一切しない。
 *
 * 実行: npm run test:hooks
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, 'check-dependency-prs.js');

function run(payload) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return out.trim() ? JSON.parse(out) : null;
}

function context(result) {
  return result?.hookSpecificOutput?.additionalContext ?? null;
}

/** リモート参照つきの使い捨て git リポジトリを作る */
function makeRepo(remoteBranches) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-pr-test-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
  git('add', '-A');
  git('commit', '-qm', 'init');
  const sha = git('rev-parse', 'HEAD').trim();

  // Dependabot が作るのと同じ形のリモート参照を直接置く（通信不要）
  for (const b of remoteBranches) {
    git('update-ref', `refs/remotes/${b}`, sha);
  }
  return dir;
}

// --- 発火すべきケース -------------------------------------------------

test('HIT: Dependabot のブランチがあれば Claude から切り出させる', () => {
  const dir = makeRepo(['origin/main', 'origin/dependabot/npm_and_yarn/next-16.3.1']);
  const c = context(run({ source: 'startup', cwd: dir }));
  assert.ok(c, 'additionalContext が返るべき');
  assert.match(c, /dependabot\/npm_and_yarn\/next-16\.3\.1/);
  assert.match(c, /あなたのほうから最初に切り出/);
  assert.match(c, /dependency-pr/);
});

test('HIT: 複数件あれば件数と一覧を伝える', () => {
  const dir = makeRepo([
    'origin/main',
    'origin/dependabot/npm_and_yarn/production-abc123',
    'origin/dependabot/github_actions/actions-def456',
  ]);
  const c = context(run({ source: 'startup', cwd: dir }));
  assert.match(c, /2 件/);
  assert.match(c, /production-abc123/);
  assert.match(c, /actions-def456/);
});

test('HIT: 断定せず現状確認させる注意書きが入る', () => {
  const dir = makeRepo(['origin/dependabot/npm_and_yarn/next-16.3.1']);
  const c = context(run({ source: 'startup', cwd: dir }));
  assert.match(c, /すでに対応済みのものが混ざっている/);
  assert.match(c, /断定せず/);
});

// --- 発火してはいけないケース -----------------------------------------

test('SKIP: 通常のブランチしかなければ黙っている', () => {
  const dir = makeRepo(['origin/main', 'origin/feature/login']);
  assert.strictEqual(run({ source: 'startup', cwd: dir }), null);
});

test('SKIP: ブランチ名に dependabot を含むだけの別物では発火しない', () => {
  // 「dependabot について調べたときのメモ用ブランチ」等を拾わない
  const dir = makeRepo(['origin/main', 'origin/study-dependabot-memo']);
  assert.strictEqual(run({ source: 'startup', cwd: dir }), null);
});

test('SKIP: git リポジトリでないフォルダでは黙って終わる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-pr-nogit-'));
  assert.strictEqual(run({ source: 'startup', cwd: dir }), null);
});

test('SKIP: リモートが1つも無いリポジトリでは発火しない', () => {
  const dir = makeRepo([]);
  assert.strictEqual(run({ source: 'startup', cwd: dir }), null);
});

test('SKIP: startup 以外（resume / clear / compact）では発火しない', () => {
  const dir = makeRepo(['origin/dependabot/npm_and_yarn/next-16.3.1']);
  for (const source of ['resume', 'clear', 'compact', '']) {
    assert.strictEqual(run({ source, cwd: dir }), null, `source=${source} で発火した`);
  }
});

test('SKIP: 存在しないフォルダを渡されても落ちない', () => {
  assert.strictEqual(run({ source: 'startup', cwd: '/no/such/dir/xyz' }), null);
});

test('SKIP: 壊れた入力でも落ちない', () => {
  const out = execFileSync('node', [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(out.trim(), '');
});
