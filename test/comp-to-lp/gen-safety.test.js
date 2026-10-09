#!/usr/bin/env node
/**
 * gen.mjs の安全まわりのテスト（Codex レビュー 2026-10-08 の指摘ごと。テストモードだけ・課金しない）
 *
 * 実行: `npm test` または `node --test test/comp-to-lp/gen-safety.test.js`
 *   H1 送ったあとで結果が分からないものは状態不明（pending のまま）・自動で送り直さない
 *   H2 予約額で上限を判定・実費が予約額を超えたら全体を止める
 *   H3 プロンプトに鍵らしい文字列があれば、保存も送信もしない
 *   H4 止めるときは送信中のリクエストも打ち切る
 *   M  二重起動のロック / 台帳の検証（fail closed）/ die() の伏せ字
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { FIXTURES, FAKE_KEY, KEY_LIKE, run, readLedger, genWorkspace, eightJobs, readAllText } = require('./helpers.js');

function gen(ws, scenario, args = [], env = {}) {
  return run('gen.mjs', ['--jobs', ws.jobs, '--config', ws.config, ...args], {
    env: { COMP_TO_LP_FAKE: scenario, COMP_TO_LP_FAKE_WAIT_MS: '50', COMP_TO_LP_FAKE_DELAY_MS: '40', OPENAI_API_KEY: FAKE_KEY, ...env },
  });
}
const byName = (rows, name) => rows.filter((r) => r.name === name);
function assertNoLeak(...texts) {
  for (const t of texts) {
    assert.ok(!t.includes(FAKE_KEY), '鍵の値がそのまま出ています');
    assert.ok(!KEY_LIKE.test(t), `鍵らしい文字列が出ています: ${t.match(KEY_LIKE)}`);
  }
}

for (const [scenario, why] of [
  ['timeout', /通信が途中で切れました/],
  ['bad-json', /返事を最後まで読めません/],
  ['no-image', /200 の返事に画像がありませんでした/],
]) {
  test(`H1 ${scenario}: 送ったあとで結果が分からないものは状態不明（pending のまま）にし、再開しても送り直さない`, () => {
    const ws = genWorkspace();
    const r1 = gen(ws, scenario);
    assert.strictEqual(r1.status, 1, r1.out);
    assert.match(r1.stdout, why);
    assert.match(r1.stdout, /状態不明: feat-kitten/);
    let rows = readLedger(ws.dir);
    assert.deepStrictEqual(byName(rows, 'feat-kitten').map((x) => x.event), ['pending'], 'err にしています');
    for (const n of ['icon-cat-face', 'hand-yasashii-jikan']) assert.strictEqual(byName(rows, n).at(-1).event, 'ok', n);
    const r2 = gen(ws, 'ok');
    assert.match(r2.stdout, /状態不明: feat-kitten/);
    rows = readLedger(ws.dir);
    assert.strictEqual(byName(rows, 'feat-kitten').length, 1, '状態不明の素材を自動で送り直しています');
  });
}

test('H1 conn-refused: 送る前に失敗したと確実なもの（接続の拒否）だけ err にし、次の一括で作る', () => {
  const ws = genWorkspace();
  const r1 = gen(ws, 'conn-refused');
  assert.strictEqual(r1.status, 1, r1.out);
  assert.match(r1.stdout, /送る前の通信エラー（課金なし）/);
  assert.deepStrictEqual(byName(readLedger(ws.dir), 'feat-kitten').map((x) => x.event), ['pending', 'err']);
  const r2 = gen(ws, 'ok');
  assert.strictEqual(r2.status, 0, r2.out);
  assert.deepStrictEqual(byName(readLedger(ws.dir), 'feat-kitten').map((x) => x.event), ['pending', 'err', 'pending', 'ok']);
});

test('H2 予約額: 見積もりは上限内でも、その 1 枚の予約額で上限を超えるなら送らない', () => {
  const ws = genWorkspace({ budgetYen: 5 });
  const r = gen(ws, 'ok', ['--only', 'hero-bg']);
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.stdout, /SKIP hero-bg: 上限（5 円）に届くため呼びません/);
  assert.strictEqual(readLedger(ws.dir).length, 0);
});

test('H2 予約額: pending の行には予約額（実費より大きい額）を書く', () => {
  const ws = genWorkspace();
  gen(ws, 'ok', ['--only', 'hero-bg']);
  const [p, ok] = byName(readLedger(ws.dir), 'hero-bg');
  assert.strictEqual(p.event, 'pending');
  assert.strictEqual(ok.event, 'ok');
  assert.ok(p.yen > ok.yen * 2, `予約額 ${p.yen} / 実費 ${ok.yen}`);
});

test('H2 実費の超過: 実費が予約額を超えたら、その時点で全体を止める', () => {
  const ws = genWorkspace();
  const r = gen(ws, 'overcost');
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.stdout, /feat-kitten の実費 [\d.]+ 円が予約額 [\d.]+ 円を超えました/);
  assert.strictEqual((r.stdout.match(/止めました:/g) || []).length, 1);
  const rows = readLedger(ws.dir);
  const k = byName(rows, 'feat-kitten');
  assert.strictEqual(k.at(-1).event, 'ok');
  assert.ok(k.at(-1).yen > k[0].yen, '実費が予約額を超えていません');
  for (const n of ['icon-cat-face', 'hand-yasashii-jikan']) assert.strictEqual(byName(rows, n).length, 0, `${n} を呼んでいます`);
});

test('H3 プロンプトに鍵らしい文字列があれば、保存も送信もしない（ほかのジョブは作る）', () => {
  const jobs = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'jobs.json'), 'utf8'));
  jobs[1].prompt += ` ${FAKE_KEY}`;
  jobs[2].prompt += ' sk-proj-AbCdEfGhIjKlMnOpQrStUv';
  const ws = genWorkspace({ jobs });
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 1, r.out);
  const rows = readLedger(ws.dir);
  for (const n of [jobs[1].name, jobs[2].name]) {
    assert.deepStrictEqual(byName(rows, n).map((x) => x.event), ['err'], n);
    assert.ok(!fs.existsSync(path.join(ws.dir, 'prompts', 'images', `${n}.txt`)), `${n} のプロンプトを保存しています`);
  }
  for (const n of [jobs[0].name, jobs[3].name]) assert.strictEqual(byName(rows, n).at(-1).event, 'ok', n);
  assertNoLeak(r.out, readAllText(path.join(ws.dir, 'docs')), readAllText(path.join(ws.dir, 'prompts')));
  assert.ok(!(r.out + readAllText(path.join(ws.dir, 'docs')) + readAllText(path.join(ws.dir, 'prompts'))).includes('sk-proj-AbCdEfGh'));
});

test('H4 致命エラーで止めるとき、並列で送信中のリクエストも打ち切る（打ち切ったものは状態不明）', () => {
  const ws = genWorkspace({ jobs: eightJobs() });
  const t0 = Date.now();
  const r = gen(ws, '401-parallel');
  const ms = Date.now() - t0;
  assert.strictEqual(r.status, 1, r.out);
  assert.ok(ms < 4000, `打ち切らずに待っています（${ms}ms。残りの返事は 5 秒かかる）`);
  assert.strictEqual((r.stdout.match(/残高（Billing）か鍵を確認してください/g) || []).length, 1);
  const rows = readLedger(ws.dir);
  const pendingLast = [...new Set(rows.map((x) => x.name))].filter((n) => byName(rows, n).at(-1).event === 'pending');
  assert.strictEqual(pendingLast.length, 3, `打ち切った数 ${pendingLast}`);
  assert.match(r.stdout, /止めたときに送信中だったので打ち切りました/);
  assert.strictEqual(rows.filter((x) => x.event === 'ok').length, 1);
  assertNoLeak(r.out, readAllText(ws.dir));
});

test('M ロック: 動いている gen.mjs があれば止まる・古いロックは消して進む・終わったら消す', () => {
  const ws = genWorkspace();
  const lock = path.join(ws.dir, 'docs', 'image-ledger.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, `${process.pid}\n2026-10-08T00:00:00.000Z\n`); // このテスト自身の PID = 動いている
  const r1 = gen(ws, 'ok');
  assert.strictEqual(r1.status, 2, r1.out);
  assert.match(r1.stderr, /別の gen\.mjs が同じ台帳を使っています/);
  assert.strictEqual(readLedger(ws.dir).length, 0);
  fs.writeFileSync(lock, '2147483646\n2026-10-08T00:00:00.000Z\n'); // 動いていない PID
  const r2 = gen(ws, 'ok');
  assert.strictEqual(r2.status, 0, r2.out);
  assert.match(r2.stdout, /古いロックを消しました/);
  assert.ok(!fs.existsSync(lock), '終わったあとにロックが残っています');
});

test('M ロック: 強制終了で残ったロックは、次の起動で消して進む', () => {
  const ws = genWorkspace();
  assert.strictEqual(gen(ws, 'kill-after-save').signal, 'SIGKILL');
  assert.ok(fs.existsSync(path.join(ws.dir, 'docs', 'image-ledger.lock')));
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /古いロックを消しました/);
});

test('M ロック: dry-run はロックを作らない（読むだけ）', () => {
  const ws = genWorkspace();
  const r = gen(ws, 'ok', ['--dry-run']);
  assert.strictEqual(r.status, 0, r.out);
  assert.ok(!fs.existsSync(path.join(ws.dir, 'docs')));
});

for (const [label, line] of [
  ['event が不正', (t) => `${t}\tx\tbogus\t1024x1024\tmedium\t\t\t1\t`],
  ['yen が負', (t) => `${t}\tx\tok\t1024x1024\tmedium\t\t\t-5\t`],
  ['yen が数でない', (t) => `${t}\tx\tok\t1024x1024\tmedium\t\t\tabc\t`],
  ['yen が上限より大きい', (t) => `${t}\tx\tok\t1024x1024\tmedium\t\t\t999\t`],
  ['ok の yen が空', (t) => `${t}\tx\tok\t1024x1024\tmedium\t\t\t\t`],
  ['time が不正', () => 'yesterday\tx\tok\t1024x1024\tmedium\t\t\t1\t'],
  ['列が足りない', (t) => `${t}\tx\tok`],
]) {
  test(`M 台帳の検証: ${label} → 何もせずに止まる（fail closed）`, () => {
    const ws = genWorkspace();
    fs.mkdirSync(path.join(ws.dir, 'docs'));
    const f = path.join(ws.dir, 'docs', 'image-ledger.tsv');
    fs.writeFileSync(f, `time\tname\tevent\tsize\tquality\tsec\ttokens\tyen\tnote\n${line(new Date().toISOString())}\n`);
    const before = fs.readFileSync(f, 'utf8');
    for (const args of [[], ['--dry-run']]) {
      const r = gen(ws, 'ok', args);
      assert.strictEqual(r.status, 2, r.out);
      assert.match(r.stderr, /の 2 行目が読めません/);
    }
    assert.strictEqual(fs.readFileSync(f, 'utf8'), before, '台帳が変わっています');
  });
}

test('M 台帳の検証: 1 行目が列名でなければ止まる', () => {
  const ws = genWorkspace();
  fs.mkdirSync(path.join(ws.dir, 'docs'));
  fs.writeFileSync(path.join(ws.dir, 'docs', 'image-ledger.tsv'), 'name\tyen\nx\t1\n');
  const r = gen(ws, 'ok', ['--dry-run']);
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.stderr, /1 行目が列名ではありません/);
});

test('M die() も伏せ字にする（設定ファイルの中の鍵が JSON のエラーに出ない）', () => {
  const ws = genWorkspace();
  fs.writeFileSync(ws.config, `{"images": ${FAKE_KEY}}`);
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.stderr, /JSON として読めません/);
  assertNoLeak(r.out);
});

// ---- Codex 再レビュー（書き出し先の制限）----
const outside = (ws) => path.join(path.dirname(ws.dir), `outside-${path.basename(ws.dir)}.png`);
for (const [label, mutate, words] of [
  ['out が ../', (jobs, ws) => (jobs[0].out = `../${path.basename(outside(ws))}`), /の中だけを指定できます/],
  ['out が絶対パス', (jobs, ws) => (jobs[0].out = outside(ws)), /の中だけを指定できます/],
  ['out が .env.local', (jobs) => (jobs[0].out = '.env.local'), /\.env で始まる/],
  ['out が assets/.env.png', (jobs) => (jobs[0].out = 'assets/.env.png'), /\.env で始まる/],
  ['name が .env', (jobs) => (jobs[0].name = '.env'), /\.env で始まる/],
]) {
  test(`書き出し先の制限（gen）: ${label} → 1 枚も作らずに止まる`, () => {
    const jobs = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'jobs.json'), 'utf8'));
    const ws = genWorkspace();
    mutate(jobs, ws);
    fs.writeFileSync(ws.jobs, JSON.stringify(jobs));
    const r = gen(ws, 'ok');
    assert.strictEqual(r.status, 2, r.out);
    assert.match(r.stderr, words);
    assert.strictEqual(readLedger(ws.dir).length, 0);
    assert.ok(!fs.existsSync(outside(ws)));
    assert.ok(!fs.existsSync(path.join(ws.dir, '.env.local')));
  });
}

for (const [label, images, words] of [
  ['rawDir が ../', { rawDir: '../raw-outside' }, /images\.rawDir.*の中だけを指定できます/],
  ['rawDir が絶対パス', { rawDir: '/tmp' }, /images\.rawDir.*の中だけを指定できます/],
  ['promptDir が .env', { promptDir: '.envdir' }, /images\.promptDir.*\.env で始まる/],
]) {
  test(`書き出し先の制限（gen）: ${label} → 止まる`, () => {
    const ws = genWorkspace({ images });
    const r = gen(ws, 'ok', ['--dry-run']);
    assert.strictEqual(r.status, 2, r.out);
    assert.match(r.stderr, words);
  });
}

test('書き出し先の制限（gen）: シンボリックリンクで外へ出る rawDir を止める', () => {
  const ws = genWorkspace({ images: { rawDir: 'assets/raw' } });
  const target = path.join(path.dirname(ws.dir), `link-target-${path.basename(ws.dir)}`);
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(ws.dir, 'assets'));
  fs.symlinkSync(target, path.join(ws.dir, 'assets', 'raw'), 'dir');
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.stderr, /の中だけを指定できます/);
  assert.deepStrictEqual(fs.readdirSync(target), []);
});
