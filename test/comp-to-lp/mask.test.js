#!/usr/bin/env node
/**
 * mask.mjs のテスト（Playwright の Chromium を使う）
 *
 * 実行: COMP_TO_LP_PW_ROOT=<playwright@1.61.1 を入れたフォルダ> npm test
 *   COMP_TO_LP_PW_ROOT が無いときは、このファイルのテストは skip になる（理由を表示する）
 * golden: fixtures/mask/golden/ は、元の後処理（Pillow 版 mask.py）で fixtures/mask/input/ を処理した結果。
 *   基準は「サイズ一致・透明度の差 2 以下・RGB 一致」
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { FIXTURES, PW_ROOT, run, tmpDir } = require('./helpers.js');
const { decodePng } = require('./png.js');

const M = path.join(FIXTURES, 'mask');
const skip = PW_ROOT ? false : 'COMP_TO_LP_PW_ROOT が無いので skip（playwright@1.61.1 を入れたフォルダを指定すると動く）';
const mask = (args) => run('mask.mjs', [...args, '--pw-root', PW_ROOT]);

function compare(a, b) {
  const A = decodePng(a), B = decodePng(b);
  assert.deepStrictEqual([A.w, A.h], [B.w, B.h], 'サイズが違います');
  let maxAlpha = 0, rgb = 0;
  for (let i = 0; i < A.w * A.h; i++) {
    maxAlpha = Math.max(maxAlpha, Math.abs(A.rgba[i * 4 + 3] - B.rgba[i * 4 + 3]));
    for (let k = 0; k < 3; k++) if (A.rgba[i * 4 + k] !== B.rgba[i * 4 + k]) rgb++;
  }
  return { maxAlpha, rgb };
}

for (const [name, args] of [
  ['icon-cat-face', ['--color', '#b5613f']],
  ['hand-nonbiri', ['--color', '#6e5040']],
  ['icon-logo-cat', ['--color', '#9a5a3c', '--white', '220', '--pad', '4']],
]) {
  test(`golden: ${name}（サイズ一致・透明度の差 ≤ 2・RGB 一致）`, { skip }, () => {
    const out = path.join(tmpDir('mask'), `${name}.png`);
    const r = mask(['mask', path.join(M, 'input', `${name}.png`), out, ...args]);
    assert.strictEqual(r.status, 0, r.out);
    const { maxAlpha, rgb } = compare(out, path.join(M, 'golden', `${name}.png`));
    assert.ok(maxAlpha <= 2, `透明度の差 ${maxAlpha}`);
    assert.strictEqual(rgb, 0, `RGB が違う画素 ${rgb}`);
  });
}

test('photo: maxWidth より大きければ縮む（高さは比率どおり）・小さければそのまま', { skip }, () => {
  const dir = tmpDir('photo');
  const r1 = mask(['photo', path.join(M, 'input', 'feat-kitten.png'), path.join(dir, 'a.jpg'), '--max-width', '400']);
  assert.strictEqual(r1.status, 0, r1.out);
  assert.match(r1.stdout, /\(400, 267\)/);
  const jpg = fs.readFileSync(path.join(dir, 'a.jpg'));
  assert.deepStrictEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff], 'JPEG ではありません');
  const r2 = mask(['photo', path.join(M, 'input', 'feat-kitten.png'), path.join(dir, 'b.png'), '--max-width', '2000']);
  assert.strictEqual(r2.status, 0, r2.out);
  const b = decodePng(path.join(dir, 'b.png'));
  assert.deepStrictEqual([b.w, b.h], [768, 512]);
});

test('batch: final どおりに書き出す・既存は --force なしで飛ばす・--force で上書き', { skip }, () => {
  const dir = tmpDir('batch');
  fs.mkdirSync(path.join(dir, 'assets', 'raw'), { recursive: true });
  for (const n of ['icon-cat-face', 'hand-nonbiri', 'feat-kitten']) fs.copyFileSync(path.join(M, 'input', `${n}.png`), path.join(dir, 'assets', 'raw', `${n}.png`));
  fs.writeFileSync(path.join(dir, 'comp.config.json'), JSON.stringify({ images: { rawDir: 'assets/raw' } }));
  const jobs = [
    { name: 'icon-cat-face', kind: 'icon', size: '1024x1024', prompt: 'x', final: [{ out: 'assets/icons/cat-t.png', color: '#b5613f' }, { out: 'assets/icons/cat-w.png', color: '#ffffff' }] },
    { name: 'hand-nonbiri', size: '1536x1024', prompt: 'x', final: [{ out: 'assets/hand/nonbiri.png', color: '#6e5040' }] },
    { name: 'feat-kitten', kind: 'photo', size: '1536x1024', prompt: 'x', final: [{ out: 'assets/img/kitten.jpg', maxWidth: 300 }] },
    { name: 'no-final', kind: 'photo', size: '1536x1024', prompt: 'x' },
    { name: 'not-made', kind: 'photo', size: '1536x1024', prompt: 'x', final: [{ out: 'assets/img/none.jpg' }] },
  ];
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs));
  const args = ['batch', '--jobs', path.join(dir, 'jobs.json'), '--config', path.join(dir, 'comp.config.json')];
  const r1 = mask(args);
  assert.strictEqual(r1.status, 0, r1.out);
  assert.match(r1.stdout, /書き出し 4 \/ 既存のため飛ばした 0（--force で上書き）\/ 生成元なし 1 \/ final 未指定 1/);
  const white = decodePng(path.join(dir, 'assets', 'icons', 'cat-w.png'));
  assert.deepStrictEqual([...white.rgba.subarray(0, 3)], [255, 255, 255], '白で塗り直されていません');
  // hand は kind が無くても name の接頭辞で透過にする
  const hand = decodePng(path.join(dir, 'assets', 'hand', 'nonbiri.png'));
  assert.ok(hand.rgba.some((v, i) => i % 4 === 3 && v === 0), '透過になっていません');
  assert.match(r1.stdout, /kitten\.jpg \(300, 200\)/);

  const r2 = mask(args);
  assert.match(r2.stdout, /書き出し 0 \/ 既存のため飛ばした 4/);
  const r3 = mask([...args, '--force']);
  assert.match(r3.stdout, /書き出し 4 \/ 既存のため飛ばした 0/);
});

test('市松の一覧（目視用）を sheet.mjs で作れる', { skip }, () => {
  const dir = tmpDir('sheet');
  const outs = [];
  for (const [n, c] of [['icon-cat-face', '#b5613f'], ['hand-nonbiri', '#6e5040'], ['icon-logo-cat', '#ffffff']]) {
    const o = path.join(dir, `${n}.png`);
    assert.strictEqual(mask(['mask', path.join(M, 'input', `${n}.png`), o, '--color', c]).status, 0);
    outs.push(o);
  }
  const sheet = path.join(dir, 'sheet.png');
  const r = run('sheet.mjs', ['--out', sheet, '--cols', '3', '--thumb', '240', '--pw-root', PW_ROOT, ...outs]);
  assert.strictEqual(r.status, 0, r.out);
  assert.ok(fs.statSync(sheet).size > 0);
});

// 書き出し先の制限（Codex 再レビュー）。ブラウザを起動する前に止まるので Playwright は要らない
function batchDir(jobs, cfg = { images: { rawDir: 'assets/raw' } }) {
  const dir = tmpDir('batch-guard');
  fs.mkdirSync(path.join(dir, 'assets', 'raw'), { recursive: true });
  fs.copyFileSync(path.join(M, 'input', 'icon-cat-face.png'), path.join(dir, 'assets', 'raw', 'icon-cat-face.png'));
  fs.writeFileSync(path.join(dir, 'comp.config.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs));
  return dir;
}
const batchArgs = (dir) => ['batch', '--jobs', path.join(dir, 'jobs.json'), '--config', path.join(dir, 'comp.config.json')];
const icon = (final, extra = {}) => [{ name: 'icon-cat-face', kind: 'icon', size: '1024x1024', prompt: 'x', final, ...extra }];

// 外の書き出し先はテストごとに別の名前にする（ほかのテストの残りに左右されないように）
const OUTSIDE_DIR = tmpDir('outside');
for (const [label, makeJobs, words] of [
  ['final の out が ../', (t) => icon([{ out: `../outside-${t}.png`, color: '#000000' }]), /の中だけを指定できます/],
  ['final の out が絶対パス', (t) => icon([{ out: path.join(OUTSIDE_DIR, `abs-${t}.png`), color: '#000000' }]), /の中だけを指定できます/],
  ['final の out が .env.local', () => icon([{ out: '.env.local', color: '#000000' }]), /\.env で始まる/],
  ['adopt が ../.env.local', () => icon([{ out: 'assets/icons/a.png' }], { adopt: '../.env.local' }), /\.env で始まる/],
  ['adopt が絶対パス', () => icon([{ out: 'assets/icons/a.png' }], { adopt: path.join(M, 'input', 'icon-cat-face.png') }), /の中だけを指定できます/],
]) {
  test(`書き出し先の制限（mask batch）: ${label} → 何も書かずに止まる`, () => {
    const t = `${process.pid}-${Math.random().toString(36).slice(2)}`;
    const dir = batchDir(makeJobs(t));
    const r = mask(batchArgs(dir));
    assert.strictEqual(r.status, 2, r.out);
    assert.match(r.stderr, words);
    assert.ok(!fs.existsSync(path.join(path.dirname(dir), `outside-${t}.png`)));
    assert.ok(!fs.existsSync(path.join(OUTSIDE_DIR, `abs-${t}.png`)));
    assert.ok(!fs.existsSync(path.join(dir, '.env.local')));
    assert.ok(!fs.existsSync(path.join(dir, 'assets', 'icons')), '書き出しています');
  });
}

test('書き出し先の制限（mask batch）: rawDir が外を指す・シンボリックリンクで外へ出る → 止まる', () => {
  const r1 = mask(batchArgs(batchDir(icon([{ out: 'assets/icons/a.png' }]), { images: { rawDir: '../raw' } })));
  assert.strictEqual(r1.status, 2, r1.out);
  assert.match(r1.stderr, /images\.rawDir/);
  const dir = batchDir(icon([{ out: 'assets/out/a.png' }]));
  const target = tmpDir('link-target');
  fs.symlinkSync(target, path.join(dir, 'assets', 'out'), 'dir');
  const r2 = mask(batchArgs(dir));
  assert.strictEqual(r2.status, 2, r2.out);
  assert.match(r2.stderr, /の中だけを指定できます/);
  assert.deepStrictEqual(fs.readdirSync(target), []);
});

test('mask / photo の単体起動でも、.env で始まる名前は読み書きしない', () => {
  const dir = tmpDir('envname');
  fs.writeFileSync(path.join(dir, '.env.local'), 'OPENAI_API_KEY=dummy\n');
  for (const args of [
    ['mask', path.join(dir, '.env.local'), path.join(dir, 'x.png')],
    ['photo', path.join(dir, '.env.local'), path.join(dir, 'x.jpg')],
    ['mask', path.join(M, 'input', 'icon-cat-face.png'), path.join(dir, '.env.png')],
  ]) {
    const r = mask(args);
    assert.strictEqual(r.status, 2, r.out);
    assert.match(r.stderr, /\.env で始まる/);
  }
  assert.ok(!fs.existsSync(path.join(dir, '.env.png')));
});

test('不正な指定は exit 2（色・数値・モード）', { skip }, () => {
  const src = path.join(M, 'input', 'icon-cat-face.png');
  const out = path.join(tmpDir('bad'), 'x.png');
  assert.strictEqual(mask(['mask', src, out, '--color', 'red']).status, 2);
  assert.strictEqual(mask(['mask', src, out, '--pad', '-1']).status, 2);
  assert.strictEqual(mask(['shrink', src, out]).status, 2);
  assert.strictEqual(mask(['mask', path.join(M, 'input', 'none.png'), out]).status, 2);
  assert.ok(!fs.existsSync(out));
});

test('壊れた画像は例外で落ちず、案内して exit 2（mask・photo とも）', { skip }, () => {
  const dir = tmpDir('broken');
  const broken = path.join(dir, 'broken.png');
  fs.writeFileSync(broken, 'not an image');
  for (const mode of ['mask', 'photo']) {
    const r = mask([mode, broken, path.join(dir, `out-${mode}.png`)]);
    assert.strictEqual(r.status, 2, r.out);
    assert.match(r.stderr, /画像として読めません/);
    assert.ok(!/at runMask|at runPhoto|triggerUncaughtException/.test(r.stderr), 'スタックが出ています');
  }
});

test('テストモードの gen.mjs が作る画像も mask.mjs で処理できる（道具どうしのつながり）', { skip }, () => {
  const { genWorkspace, FAKE_KEY } = require('./helpers.js');
  const jobs = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'jobs.json'), 'utf8'));
  const ws = genWorkspace({ jobs });
  const g = run('gen.mjs', ['--jobs', ws.jobs, '--config', ws.config], { env: { COMP_TO_LP_FAKE: 'ok', COMP_TO_LP_FAKE_DELAY_MS: '5', OPENAI_API_KEY: FAKE_KEY } });
  assert.strictEqual(g.status, 0, g.out);
  const r = mask(['batch', '--jobs', ws.jobs, '--config', ws.config]);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.stdout, /書き出し 4 \//);
});

test('mask.mjs のソースに Python の呼び出しが無い', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'plugins', 'school-starter', 'skills', 'comp-to-lp', 'scripts', 'mask.mjs'), 'utf8');
  assert.ok(!/python|spawn|child_process/i.test(src));
});
