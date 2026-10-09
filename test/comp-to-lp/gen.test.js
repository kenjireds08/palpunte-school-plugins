#!/usr/bin/env node
/**
 * gen.mjs のテスト（テストモードだけ。OpenAI は呼ばない・課金しない）
 *
 * 実行: `npm test` または `node --test test/comp-to-lp/gen.test.js`
 * 確かめること:
 *   - 見積もりが手計算と ±1 円 / 上限 min(300, 設定) / 上限を超える見積もりは 1 枚も呼ばない
 *   - 台帳 docs/image-ledger.tsv は追記だけ・pending → ok の 2 段階
 *   - 状態表（再開）: ok は飛ばす・err は作り直す・pending は「状態不明」で呼ばない・保存済みなら reconciled
 *   - 並列数: limit5 → 1 / limit50 → 4 / noheader → 1 / remaining1 → 1 / inconsistent → 1
 *   - 429: 全体を 1 段下げて最後に回す・Retry-After が無ければ 60 秒・同じジョブ 2 回で err
 *   - insufficient_quota・401・403・err 3 連続で全体停止し「残高か鍵を確認」を 1 回だけ出す
 *   - 鍵（sk-…）がどの出力・台帳・プロンプトにも出ない
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SCRIPTS, FAKE_KEY, KEY_LIKE, run, readLedger, genWorkspace, eightJobs, readAllText } = require('./helpers.js');

function gen(ws, scenario, args = [], env = {}) {
  return run('gen.mjs', ['--jobs', ws.jobs, '--config', ws.config, ...args], {
    env: { COMP_TO_LP_FAKE: scenario, COMP_TO_LP_FAKE_WAIT_MS: '50', COMP_TO_LP_FAKE_DELAY_MS: '40', OPENAI_API_KEY: FAKE_KEY, ...env },
  });
}
const byName = (rows, name) => rows.filter((r) => r.name === name);
const okCount = (rows, name) => byName(rows, name).filter((r) => r.event === 'ok').length;
function assertNoLeak(...texts) {
  for (const t of texts) {
    assert.ok(!t.includes(FAKE_KEY), '鍵の値がそのまま出ています');
    assert.ok(!KEY_LIKE.test(t), `鍵らしい文字列が出ています: ${t.match(KEY_LIKE)}`);
  }
}
/** 台帳を上から読み、送ったまま結果が出ていない数（同時に呼んでいた数）の最大を返す */
function maxInFlight(rows) {
  const open = new Set();
  let max = 0;
  for (const r of rows) {
    if (r.event === 'pending') open.add(r.name);
    else open.delete(r.name);
    max = Math.max(max, open.size);
  }
  return max;
}

test('dry-run: 見積もりが手計算と ±1 円・台帳を作らない・API を呼ばない', () => {
  const ws = genWorkspace();
  const r = gen(ws, 'ok', ['--dry-run']);
  assert.strictEqual(r.status, 0, r.out);
  // 手計算: 出力トークン（実測表）× $30/100万 + 入力トークン（文字数 / 3・最低 100）× $5/100万 を 154.5 円/ドルで
  const OUT = { '1536x1024': 343, '1024x1024': 439 };
  let yen = 0;
  for (const j of ws.baseJobs) yen += (OUT[j.size] * 30 + Math.max(100, Math.ceil(j.prompt.length / 3)) * 5) / 1e6 * 154.5;
  const m = /料金表どおりの見積もり: 約 ([\d.]+) 円/.exec(r.stdout);
  assert.ok(m, r.out);
  assert.ok(Math.abs(Number(m[1]) - yen) <= 1, `表示 ${m[1]} / 手計算 ${yen}`);
  assert.ok(!fs.existsSync(path.join(ws.dir, 'docs', 'image-ledger.tsv')), 'dry-run で台帳ができています');
  assert.ok(!fs.existsSync(path.join(ws.dir, 'assets')), 'dry-run で画像ができています');
});

test('ok: 全件 pending → ok・ファイルができる・もう一度実行しても呼ばない（二重課金ゼロ）', () => {
  const ws = genWorkspace();
  const r1 = gen(ws, 'ok');
  assert.strictEqual(r1.status, 0, r1.out);
  const rows = readLedger(ws.dir);
  for (const j of ws.baseJobs) {
    assert.deepStrictEqual(byName(rows, j.name).map((x) => x.event), ['pending', 'ok'], j.name);
    assert.ok(fs.existsSync(path.join(ws.dir, 'assets', 'raw', `${j.name}.png`)), j.name);
  }
  assert.ok(rows.every((x) => x.quality === 'medium'));
  const r2 = gen(ws, 'ok');
  assert.strictEqual(r2.status, 0, r2.out);
  assert.match(r2.stdout, /作るものはありません/);
  assert.strictEqual(readLedger(ws.dir).length, rows.length, '2 回目で台帳が増えています');
});

test('台帳は追記だけ（前の行が書き換わらない）', () => {
  const ws = genWorkspace();
  gen(ws, 'ok', ['--only', 'hero-bg']);
  const f = path.join(ws.dir, 'docs', 'image-ledger.tsv');
  const before = fs.readFileSync(f, 'utf8');
  gen(ws, 'ok', ['--only', 'hero-bg']);
  const after = fs.readFileSync(f, 'utf8');
  assert.ok(after.startsWith(before), '前の内容が変わっています');
  assert.deepStrictEqual(byName(readLedger(ws.dir), 'hero-bg').map((x) => x.event), ['pending', 'ok', 'pending', 'ok']);
});

for (const [scenario, want] of [
  ['limit5', 1],
  ['limit50', 4],
  ['noheader', 2], // 画像 API の返事には上限ヘッダが付かないことがある → 2 枚から始める
  ['remaining1', 1],
  ['inconsistent', 1],
]) {
  test(`並列数: ${scenario} → ${want}`, () => {
    const ws = genWorkspace({ jobs: eightJobs() });
    const r = gen(ws, scenario);
    assert.strictEqual(r.status, 0, r.out);
    assert.match(r.stdout, new RegExp(`並列数: ${want}（`));
    const rows = readLedger(ws.dir);
    assert.strictEqual(rows.filter((x) => x.event === 'ok').length, 8);
    // 1 枚目は必ず 1 枚だけで送る
    assert.strictEqual(rows[0].event, 'pending');
    assert.strictEqual(rows[1].event, 'ok');
    assert.strictEqual(rows[1].name, rows[0].name);
    assert.strictEqual(maxInFlight(rows), want, `同時に呼んだ数 ${maxInFlight(rows)}`);
  });
}

test('noheader-429: 上限ヘッダが無ければ 2 枚から始め、429 が来たら 1 に下げてそのまま 1 で続ける', () => {
  const ws = genWorkspace({ jobs: eightJobs() });
  const r = gen(ws, 'noheader-429');
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /並列数: 2（上限ヘッダが無いので 2 枚から始めます/);
  assert.match(r.stdout, /429: 並列数を 2 → 1 に下げます/);
  assert.strictEqual((r.stdout.match(/429: 並列数を/g) || []).length, 1);
  const rows = readLedger(ws.dir);
  assert.strictEqual(rows.filter((x) => x.event === 'ok').length, 8);
  // 429 のあとは同時に 1 つだけ
  const after = rows.slice(rows.findIndex((x) => x.event === 'err') + 1);
  assert.strictEqual(maxInFlight(after), 1, `429 のあとに同時に呼んだ数 ${maxInFlight(after)}`);
});

test('--verbose: 1 枚目の返事のヘッダの名前だけを出す（値は出さない）。付けなければ出さない', () => {
  const ws = genWorkspace();
  const r1 = gen(ws, 'limit50', ['--only', 'hero-bg', '--verbose']);
  assert.strictEqual(r1.status, 0, r1.out);
  const line = r1.stdout.split('\n').find((l) => l.startsWith('受け取ったヘッダの名前'));
  assert.ok(line, r1.out);
  assert.match(line, /x-ratelimit-limit-requests/);
  assert.match(line, /content-type/);
  assert.ok(!/\b49\b|\b50\b|application\/json/.test(line), `値が出ています: ${line}`);
  const r2 = gen(ws, 'limit50', ['--only', 'hero-bg']);
  assert.ok(!r2.stdout.includes('受け取ったヘッダの名前'));
});

test('429-retry-after: 失敗したジョブを最後に回し、Retry-After の秒数で待ってから作る', () => {
  const ws = genWorkspace();
  const r = gen(ws, '429-retry-after');
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /429: 並列数を 1 → 1 に下げます（2 秒待ってから再開）/);
  const rows = readLedger(ws.dir);
  assert.deepStrictEqual(byName(rows, 'feat-kitten').map((x) => x.event), ['pending', 'err', 'pending', 'ok']);
  const oks = rows.filter((x) => x.event === 'ok').map((x) => x.name);
  assert.strictEqual(oks[oks.length - 1], 'feat-kitten', '最後に回っていません');
  for (const j of ws.baseJobs) assert.strictEqual(okCount(rows, j.name), 1, j.name);
});

test('429-noheader: Retry-After が無ければ 60 秒待つ', () => {
  const ws = genWorkspace();
  const r = gen(ws, '429-noheader');
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /Retry-After が無いので 60 秒待ってから再開/);
  for (const j of ws.baseJobs) assert.strictEqual(okCount(readLedger(ws.dir), j.name), 1, j.name);
});

test('429-multi: 並列中に 2 つ同時に 429 → 全体を 1 段だけ下げ、2 つとも最後に回す', () => {
  const ws = genWorkspace({ jobs: eightJobs() });
  const r = gen(ws, '429-multi', [], { COMP_TO_LP_FAKE_WAIT_MS: '500' });
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /並列数: 4（/);
  assert.strictEqual((r.stdout.match(/429: 並列数を/g) || []).length, 1, r.stdout);
  assert.match(r.stdout, /429: 並列数を 4 → 3 に下げます/);
  const rows = readLedger(ws.dir);
  const failed = [...new Set(rows.filter((x) => x.event === 'err').map((x) => x.name))];
  assert.strictEqual(failed.length, 2, `429 になったジョブ ${failed}`);
  const oks = rows.filter((x) => x.event === 'ok').map((x) => x.name);
  assert.strictEqual(oks.length, 8);
  assert.deepStrictEqual(new Set(oks.slice(-2)), new Set(failed), '429 のジョブが最後に回っていません');
  for (const n of new Set(rows.map((x) => x.name))) assert.strictEqual(okCount(rows, n), 1, n);
});

for (const [scenario, stopAt, words] of [
  ['quota', 'feat-kitten', /残高が足りません（insufficient_quota）/],
  ['401', 'hero-bg', /鍵が無効です（HTTP 401）/],
  ['403', 'hero-bg', /HTTP 403/],
]) {
  test(`${scenario}: 全体を止め、「残高か鍵を確認」を 1 回だけ出す・残りは呼ばない`, () => {
    const ws = genWorkspace();
    const r = gen(ws, scenario);
    assert.strictEqual(r.status, 1, r.out);
    assert.match(r.stdout, words);
    assert.strictEqual((r.stdout.match(/残高（Billing）か鍵を確認してください/g) || []).length, 1, r.stdout);
    const rows = readLedger(ws.dir);
    assert.strictEqual(byName(rows, stopAt).at(-1).event, 'err');
    const called = new Set(rows.map((x) => x.name));
    const idx = ws.baseJobs.findIndex((j) => j.name === stopAt);
    for (const j of ws.baseJobs.slice(idx + 1)) assert.ok(!called.has(j.name), `${j.name} を呼んでいます`);
    assertNoLeak(r.out, readAllText(ws.dir));
  });
}

test('err3（5xx が続く）: 5xx は状態不明（pending のまま）・3 回続いたら止める（4 件目は呼ばない）・再開しても送り直さない', () => {
  const ws = genWorkspace();
  const r = gen(ws, 'err3');
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.stdout, /失敗が 3 回続きました/);
  assert.match(r.stdout, /状態不明: hero-bg（HTTP 500/);
  assert.strictEqual((r.stdout.match(/残高（Billing）か鍵を確認してください/g) || []).length, 1);
  let rows = readLedger(ws.dir);
  assert.strictEqual(rows.filter((x) => x.event === 'err').length, 0, '5xx を err にしています');
  for (const j of ws.baseJobs.slice(0, 3)) assert.deepStrictEqual(byName(rows, j.name).map((x) => x.event), ['pending'], j.name);
  assert.strictEqual(byName(rows, ws.baseJobs[3].name).length, 0);
  const r2 = gen(ws, 'ok');
  rows = readLedger(ws.dir);
  for (const j of ws.baseJobs.slice(0, 3)) assert.strictEqual(byName(rows, j.name).length, 1, `${j.name} を自動で送り直しています`);
  assert.match(r2.stdout, /状態不明: hero-bg/);
});

test('bad-request3（4xx が続く）: 4xx は err・3 回続いたら止める（4 件目は呼ばない）', () => {
  const ws = genWorkspace();
  const r = gen(ws, 'bad-request3');
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.stdout, /失敗が 3 回続きました/);
  const rows = readLedger(ws.dir);
  assert.strictEqual(rows.filter((x) => x.event === 'err').length, 3);
  assert.strictEqual(byName(rows, ws.baseJobs[3].name).length, 0);
});

for (const scenario of ['kill-before-send', 'kill-after-response']) {
  test(`${scenario}: 再開しても状態不明の素材は呼ばない → --only で作り直す（二重課金ゼロ）`, () => {
    const ws = genWorkspace();
    const r1 = gen(ws, scenario);
    assert.strictEqual(r1.signal, 'SIGKILL', r1.out);
    let rows = readLedger(ws.dir);
    assert.strictEqual(byName(rows, 'hero-bg').at(-1).event, 'ok');
    assert.strictEqual(byName(rows, 'feat-kitten').at(-1).event, 'pending');
    assert.ok(!fs.existsSync(path.join(ws.dir, 'assets', 'raw', 'feat-kitten.png')));

    const r2 = gen(ws, 'ok');
    assert.strictEqual(r2.status, 1, r2.out);
    assert.match(r2.stdout, /状態不明: feat-kitten。Usage 画面で課金を確かめ、無ければ --only feat-kitten で作り直してください/);
    rows = readLedger(ws.dir);
    assert.strictEqual(byName(rows, 'feat-kitten').length, 1, '状態不明の素材を呼んでいます');
    assert.strictEqual(byName(rows, 'hero-bg').length, 2, '作成済みを呼んでいます');
    for (const n of ['icon-cat-face', 'hand-yasashii-jikan']) assert.deepStrictEqual(byName(rows, n).map((x) => x.event), ['pending', 'ok']);

    const r3 = gen(ws, 'ok', ['--only', 'feat-kitten']);
    assert.strictEqual(r3.status, 0, r3.out);
    rows = readLedger(ws.dir);
    assert.deepStrictEqual(byName(rows, 'feat-kitten').map((x) => x.event), ['pending', 'pending', 'ok']);
    const r4 = gen(ws, 'ok');
    assert.strictEqual(r4.status, 0, r4.out);
    assert.strictEqual(readLedger(ws.dir).length, rows.length);
  });
}

test('kill-after-save: 保存済みなら再開時に reconciled を書いて呼ばない', () => {
  const ws = genWorkspace();
  const r1 = gen(ws, 'kill-after-save');
  assert.strictEqual(r1.signal, 'SIGKILL', r1.out);
  assert.ok(fs.existsSync(path.join(ws.dir, 'assets', 'raw', 'feat-kitten.png')));
  assert.ok(!fs.existsSync(path.join(ws.dir, 'assets', 'raw', 'feat-kitten.png.part')));
  const r2 = gen(ws, 'ok');
  assert.strictEqual(r2.status, 0, r2.out);
  const rows = readLedger(ws.dir);
  const kitten = byName(rows, 'feat-kitten');
  assert.deepStrictEqual(kitten.map((x) => x.event), ['pending', 'reconciled']);
  assert.strictEqual(kitten[1].yen, kitten[0].yen, 'reconciled の額が pending の見積額と違います');
});

test('err（4xx）の素材は次の一括実行（作り直し）で呼ぶ', () => {
  const ws = genWorkspace();
  gen(ws, 'bad-request3');
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 0, r.out);
  const rows = readLedger(ws.dir);
  for (const j of ws.baseJobs) assert.strictEqual(byName(rows, j.name).at(-1).event, 'ok', j.name);
});

test('--suffix: 別の name として台帳に載り、元のファイルを残す', () => {
  const ws = genWorkspace();
  gen(ws, 'ok');
  const r = gen(ws, 'ok', ['--only', 'hero-bg', '--suffix', '-v2']);
  assert.strictEqual(r.status, 0, r.out);
  const rows = readLedger(ws.dir);
  assert.deepStrictEqual(byName(rows, 'hero-bg-v2').map((x) => x.event), ['pending', 'ok']);
  assert.deepStrictEqual(byName(rows, 'hero-bg').map((x) => x.event), ['pending', 'ok']);
  assert.ok(fs.existsSync(path.join(ws.dir, 'assets', 'raw', 'hero-bg-v2.png')));
});

test('上限: 見積もりが上限を超えたら 1 枚も呼ばない', () => {
  const ws = genWorkspace({ budgetYen: 5 });
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.stderr, /上限を超える見積もりです/);
  assert.strictEqual(readLedger(ws.dir).length, 0);
});

test('上限: 台帳の累計 + 見積もりが上限を超えたら呼ばない（pending は見積額で数える）', () => {
  const ws = genWorkspace();
  fs.mkdirSync(path.join(ws.dir, 'docs'));
  const head = 'time\tname\tevent\tsize\tquality\tsec\ttokens\tyen\tnote\n';
  const t = new Date().toISOString();
  fs.writeFileSync(path.join(ws.dir, 'docs', 'image-ledger.tsv'), head + `${t}\told-a\tok\t1536x1024\tmedium\t1\t463\t290\t\n${t}\told-b\tpending\t1536x1024\tmedium\t\t\t5\t\n`);
  const r = gen(ws, 'ok');
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.stdout, /これまでの累計（台帳）: 295\.0 円/);
  assert.strictEqual(readLedger(ws.dir).length, 2);
});

test('上限: 設定に 300 円より大きい額を書いても 300 円で止まる', () => {
  const ws = genWorkspace({ budgetYen: 100000 });
  const r = gen(ws, 'ok', ['--dry-run']);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /上限 300 円/);
});

for (const opt of ['--budget', '--ledger', '--par', '--quality']) {
  test(`${opt} は無いオプションとして止まる`, () => {
    const ws = genWorkspace();
    const r = gen(ws, 'ok', [opt, '10']);
    assert.strictEqual(r.status, 2, r.out);
    assert.match(r.stderr, new RegExp(`${opt} という オプションはありません`));
    assert.strictEqual(readLedger(ws.dir).length, 0);
  });
}

test('鍵が無い本番起動は API に届く前に止まり、--env-file の使い方を案内する', () => {
  const ws = genWorkspace();
  const r = run('gen.mjs', ['--jobs', ws.jobs, '--config', ws.config], { allowNoFake: true });
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.stderr, /--env-file=\.env\.local/);
  assert.strictEqual(readLedger(ws.dir).length, 0);
});

test('鍵漏れ: --env-file・別のフォルダからの相対パス・例外のスタックでも鍵を出さない', () => {
  // --env-file で鍵を渡し、作業フォルダの外（1 つ上）から相対パスで起動して、401（本文に鍵が入る）を返させる
  const ws = genWorkspace();
  const envFile = path.join(ws.dir, '.env.local');
  fs.writeFileSync(envFile, `OPENAI_API_KEY=${FAKE_KEY}\n`);
  const parent = path.dirname(ws.dir);
  const rel = path.basename(ws.dir);
  const r1 = run('gen.mjs', ['--jobs', `${rel}/jobs.json`, '--config', `${rel}/comp.config.json`], {
    cwd: parent,
    nodeArgs: [`--env-file=${rel}/.env.local`],
    env: { COMP_TO_LP_FAKE: '401' },
  });
  assert.strictEqual(r1.status, 1, r1.out);
  assertNoLeak(r1.out, readAllText(path.join(ws.dir, 'docs')), readAllText(path.join(ws.dir, 'prompts')));

  // 例外のスタック: プロンプトの置き場所のパスに鍵の文字列を入れ、作れない場所にして落とす
  const ws2 = genWorkspace({ images: { promptDir: `blocker/${FAKE_KEY}/p` } });
  fs.writeFileSync(path.join(ws2.dir, 'blocker'), 'file, not a directory');
  const r2 = gen(ws2, 'ok');
  assert.notStrictEqual(r2.status, 0, r2.out);
  assert.match(r2.stderr, /想定外のエラーで止まりました/);
  assertNoLeak(r2.out, readAllText(path.join(ws2.dir, 'docs')));

  // 全シナリオの出力・台帳・プロンプトにも出ない
  for (const s of ['ok', 'limit50', '429-retry-after', '429-multi', 'quota', '403', 'err3']) {
    const w = genWorkspace({ jobs: eightJobs() });
    const r = gen(w, s);
    assertNoLeak(r.out, readAllText(w.dir));
  }
});

test('gen.mjs のソース: 台帳を上書きする書き方・Python・子プロセス・上限を外すオプションが無い', () => {
  const src = fs.readFileSync(path.join(SCRIPTS, 'gen.mjs'), 'utf8');
  assert.ok(!/writeFileSync|truncate/.test(src), 'writeFileSync / truncate があります');
  assert.ok(!/python|spawn|child_process/i.test(src), 'python / spawn があります');
  assert.ok(src.includes('path.join("docs", "image-ledger.tsv")'));
  assert.ok(src.includes('Math.min(HARD_CAP_YEN, cfgBudget)') && src.includes('const HARD_CAP_YEN = 300;'));
  assert.ok(!/image_calls|calls\.tsv/.test(src));
});
