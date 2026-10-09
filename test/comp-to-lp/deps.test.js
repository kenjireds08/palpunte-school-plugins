#!/usr/bin/env node
/**
 * deps.mjs のテスト（テストモードだけ。/v1/models は呼ばない）
 *
 * 実行: `npm test` または `node --test test/comp-to-lp/deps.test.js`
 * Playwright の判定は、作業フォルダに置いた「にせの playwright パッケージ」で確かめる（本物は不要）。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { SCRIPTS, FAKE_KEY, KEY_LIKE, run, tmpDir } = require('./helpers.js');

function studio() {
  const dir = path.join(tmpDir('deps'), 'image-studio');
  fs.mkdirSync(dir);
  return dir;
}
function deps(cwd, scenario, env = {}, args = []) {
  return run('deps.mjs', args, { cwd, env: { COMP_TO_LP_FAKE: scenario, ...env } });
}
/** 表の行を「項目 → { result, state, next }」にする */
function table(stdout) {
  const m = new Map();
  for (const line of stdout.split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (c.length >= 6 && c[1] && c[1] !== '項目' && !c[1].startsWith('---')) m.set(c[1], { result: c[2], state: c[3], next: c[4] });
  }
  return m;
}
/** 作業フォルダに、にせの playwright（版と chromium の場所を指定）を置く */
function fakePlaywright(dir, version, exePath, { withPkg = true } = {}) {
  if (withPkg && !fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","private":true}\n');
  const p = path.join(dir, 'node_modules', 'playwright');
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name: 'playwright', version, main: 'index.js' }));
  fs.writeFileSync(path.join(p, 'index.js'), `module.exports = { chromium: { executablePath() { return ${JSON.stringify(exePath)}; } } };\n`);
}

test('鍵が無い: 鍵の形が NG・--env-file の案内・生存は確かめない', () => {
  const dir = studio();
  const r = deps(dir, 'ok');
  assert.strictEqual(r.status, 1, r.out);
  const t = table(r.stdout);
  assert.strictEqual(t.get('鍵の形').state, 'NG');
  assert.match(t.get('鍵の形').next, /--env-file=\.env\.local/);
  assert.strictEqual(t.get('鍵の生存').state, 'NG');
});

for (const [scenario, state, words] of [
  ['ok', 'OK', /GET \/v1\/models が 200/],
  ['401', 'NG', /鍵が無効です/],
  ['403', 'NG', /本人確認/],
  ['err3', 'NG', /少し待ってから/],
]) {
  test(`鍵の生存: ${scenario} → ${state}（鍵の値は出さない）`, () => {
    const dir = studio();
    const r = deps(dir, scenario, { OPENAI_API_KEY: FAKE_KEY });
    const t = table(r.stdout);
    assert.strictEqual(t.get('鍵の形').state, 'OK', r.out);
    assert.strictEqual(t.get('鍵の生存').state, state, r.out);
    assert.match(t.get('鍵の生存').result + t.get('鍵の生存').next, words);
    assert.ok(!r.out.includes(FAKE_KEY) && !KEY_LIKE.test(r.out), '鍵が出ています');
  });
}

test('鍵の形: sk- で始まらない・改行が混ざる → NG（値は出さない）', () => {
  const dir = studio();
  const r1 = deps(dir, 'ok', { OPENAI_API_KEY: 'pk-abcdefghijklmnopqrstuvwxyz' });
  assert.match(table(r1.stdout).get('鍵の形').next, /sk- で始まっていません/);
  assert.ok(!r1.out.includes('pk-abcdefghijklmnopqrstuvwxyz'));
  const r2 = deps(dir, 'ok', { OPENAI_API_KEY: `${FAKE_KEY}\r` });
  assert.match(table(r2.stdout).get('鍵の形').next, /空白や改行/);
  assert.ok(!r2.out.includes(FAKE_KEY));
});

test('鍵の防壁: 作業フォルダの直下に .env.probe（PROBE=ok の 1 行）を作り、Read と cat の両方を確かめる案内を出す', () => {
  const dir = studio();
  const r = deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY });
  assert.strictEqual(fs.readFileSync(path.join(dir, '.env.probe'), 'utf8'), 'PROBE=ok\n');
  const row = table(r.stdout).get('鍵の防壁');
  assert.strictEqual(row.state, '要確認');
  assert.match(row.next, /Read で \.env\.probe を読む → 拒否、Bash で cat \.env\.probe → 拒否、の両方/);
  assert.ok(fs.statSync(path.join(dir, 'lp')).isDirectory(), 'lp/ を作っていません');
});

test('作業フォルダが image-studio でなければ NG で、.env.probe も lp/ も作らない', () => {
  const dir = tmpDir('deps-other');
  const r = deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY });
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.stdout, /Code タブで選んだフォルダが image-studio ではありません/);
  assert.ok(!fs.existsSync(path.join(dir, '.env.probe')));
  assert.ok(!fs.existsSync(path.join(dir, 'lp')));
});

test('playwright が無い（package.json はある）→ npm i -D playwright@1.61.1（&& でつながない）、chromium は後で', () => {
  const dir = studio();
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","private":true}\n');
  const r = deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY });
  const t = table(r.stdout);
  assert.strictEqual(t.get('package.json').state, 'OK');
  assert.strictEqual(t.get('playwright').next, 'npm i -D playwright@1.61.1');
  assert.strictEqual(t.get('chromium').state, 'NG');
  assert.ok(!r.stdout.includes('&&'), '&& でつないだコマンドがあります');
});

test('package.json が無い → 先に npm init -y、そのあと別に npm i -D playwright@1.61.1 の 2 行で案内（表の順も init が先）', () => {
  const dir = studio();
  const r = deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY });
  const t = table(r.stdout);
  assert.strictEqual(t.get('package.json').state, 'NG');
  assert.match(t.get('package.json').next, /^npm init -y（/);
  assert.match(t.get('playwright').next, /^npm i -D playwright@1\.61\.1（上の npm init -y が終わってから、別に実行する）$/);
  assert.ok(r.stdout.indexOf('| package.json |') < r.stdout.indexOf('| playwright |'), 'npm init -y の行が後ろにあります');
  assert.ok(!r.stdout.includes('&&'));
  assert.ok(!fs.existsSync(path.join(dir, 'package.json')), 'deps.mjs が package.json を作っています（案内だけのはず）');
});

test('上のフォルダ（ホームなど）にある playwright は数えない（作業フォルダの node_modules だけ）', () => {
  const parent = tmpDir('deps-parent');
  fs.writeFileSync(path.join(parent, 'package.json'), '{"name":"home","private":true}\n');
  fakePlaywright(parent, '1.61.1', process.execPath, { withPkg: false });
  const dir = path.join(parent, 'image-studio');
  fs.mkdirSync(dir);
  const t1 = table(deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY }).stdout);
  assert.strictEqual(t1.get('playwright').state, 'NG', '上のフォルダの playwright を数えています');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x","private":true}\n');
  const t2 = table(deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY }).stdout);
  assert.strictEqual(t2.get('playwright').state, 'NG', 'package.json があっても上のフォルダの playwright を数えています');
});

test('playwright の版が違う → NG', () => {
  const dir = studio();
  fakePlaywright(dir, '1.50.0', process.execPath);
  const t = table(deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY }).stdout);
  assert.strictEqual(t.get('playwright').state, 'NG');
  assert.match(t.get('playwright').result, /1\.50\.0/);
});

test('playwright 1.61.1 あり・chromium が無い → npx playwright install chromium', () => {
  const dir = studio();
  fakePlaywright(dir, '1.61.1', path.join(dir, 'no-such-chrome'));
  const t = table(deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY }).stdout);
  assert.strictEqual(t.get('playwright').state, 'OK');
  assert.strictEqual(t.get('chromium').state, 'NG');
  assert.match(t.get('chromium').next, /^npx playwright install chromium/);
});

test('全部そろっている → exit 0（入っている物は飛ばす）', () => {
  const dir = studio();
  fakePlaywright(dir, '1.61.1', process.execPath);
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env*\nnode_modules/\n');
  const r = deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY });
  assert.strictEqual(r.status, 0, r.out);
  const t = table(r.stdout);
  for (const k of ['Node', '鍵の形', '鍵の生存', 'playwright', 'chromium', '.gitignore', '作業フォルダ']) assert.strictEqual(t.get(k).state, 'OK', k);
  assert.match(r.stdout, /NG はありません/);
});

test('.gitignore に node_modules/ が無い → 1 行足す提案（ファイルは書き換えない）', () => {
  const dir = studio();
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env*\n');
  const t = table(deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY }).stdout);
  assert.strictEqual(t.get('.gitignore').state, 'NG');
  assert.strictEqual(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), '.env*\n');
});

test('Node が 20.6 未満 → 更新の案内とアプリの開き直し', () => {
  const dir = studio();
  for (const [v, state] of [['20.5.1', 'NG'], ['18.20.0', 'NG'], ['20.6.0', 'OK'], ['20.10.0', 'OK'], ['22.0.0', 'OK']]) {
    const t = table(deps(dir, 'ok', { OPENAI_API_KEY: FAKE_KEY, COMP_TO_LP_FAKE_NODE_VERSION: v }).stdout);
    assert.strictEqual(t.get('Node').state, state, v);
    if (state === 'NG') {
      assert.match(t.get('Node').next, /Node\.js を LTS 版に更新する手順を、このパソコンの OS に合わせて教えてください/);
      assert.match(t.get('Node').next, /完全に終了して開き直す/);
    }
  }
});

test('道具の版（zip で配った道具の VERSION）が違えば NG', () => {
  const dir = studio();
  const tools = path.join(dir, 'lp', 'tools');
  fs.mkdirSync(tools, { recursive: true });
  for (const f of ['deps.mjs', 'lib.mjs']) fs.copyFileSync(path.join(SCRIPTS, f), path.join(tools, f));
  fs.writeFileSync(path.join(tools, 'VERSION'), '1.27.0\n');
  const env = { OPENAI_API_KEY: FAKE_KEY };
  const r1 = run('deps.mjs', ['--expect-version', '1.28.0'], { cwd: dir, scriptPath: path.join(tools, 'deps.mjs'), env: { COMP_TO_LP_FAKE: 'ok', ...env } });
  assert.strictEqual(table(r1.stdout).get('道具の版').state, 'NG', r1.out);
  fs.writeFileSync(path.join(tools, 'VERSION'), '1.28.0\n');
  const r2 = run('deps.mjs', ['--expect-version', '1.28.0'], { cwd: dir, scriptPath: path.join(tools, 'deps.mjs'), env: { COMP_TO_LP_FAKE: 'ok', ...env } });
  assert.strictEqual(table(r2.stdout).get('道具の版').state, 'OK', r2.out);
});

test('プラグインの道具（VERSION なし）は plugin.json の版で照合する', () => {
  const dir = studio();
  const pj = path.join(SCRIPTS, '..', '..', '..', '.claude-plugin', 'plugin.json');
  const v = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
  const env = { OPENAI_API_KEY: FAKE_KEY };
  const r1 = deps(dir, 'ok', env, ['--expect-version-from', pj]);
  assert.strictEqual(table(r1.stdout).get('道具の版').state, 'OK', r1.out);
  assert.ok(table(r1.stdout).get('道具の版').result.includes(v), r1.out);
  const r2 = deps(dir, 'ok', env, ['--expect-version', '9.9.9']);
  assert.strictEqual(table(r2.stdout).get('道具の版').state, 'NG', r2.out);
  assert.match(table(r2.stdout).get('道具の版').next, /Update now/);
  const r3 = deps(dir, 'ok', env, ['--expect-version-from', path.join(dir, 'none.json')]);
  assert.strictEqual(table(r3.stdout).get('道具の版').state, 'NG', r3.out);
});

test('無いオプションは止まる', () => {
  const r = deps(studio(), 'ok', {}, ['--install']);
  assert.strictEqual(r.status, 2, r.out);
});
