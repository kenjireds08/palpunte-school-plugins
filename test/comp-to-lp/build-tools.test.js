#!/usr/bin/env node
/**
 * scripts/build-tools-zip.sh のテスト（道具の zip の中身と版）
 *
 * 実行: `npm test` または `node --test test/comp-to-lp/build-tools.test.js`
 *   zip / unzip コマンドが無い環境では skip（理由を表示する）
 * 確かめること: zip の名前・VERSION・plugin.json の version が一致 / 中身は VERSION・*.mjs・compose.html・templates/*.json だけで、
 *   フォルダを 1 段も作らない / 展開した道具が lp/tools/ でそのまま動く（deps.mjs の版の照合・gen.mjs の dry-run）
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, SCRIPTS, FAKE_KEY, run, tmpDir } = require('./helpers.js');

const has = (cmd) => spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
const skip = has('zip') && has('unzip') ? false : 'zip / unzip コマンドが無いので skip';
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'school-starter', '.claude-plugin', 'plugin.json'), 'utf8')).version;

function build() {
  const out = tmpDir('zip');
  const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'build-tools-zip.sh'), out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  return path.join(out, `comp-to-lp-tools-${version}.zip`);
}

test('zip の名前・VERSION・中身が決まりどおり（フォルダを 1 段も作らない）', { skip }, () => {
  const zip = build();
  assert.ok(fs.existsSync(zip), `${zip} がありません`);
  const list = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.trim().split('\n').sort();
  const want = [
    'VERSION',
    'compose.html',
    ...fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs')),
    ...fs.readdirSync(path.join(SCRIPTS, '..', 'templates')).map((f) => `templates/${f}`),
  ].sort();
  assert.deepStrictEqual(list, want);
  const v = spawnSync('unzip', ['-p', zip, 'VERSION'], { encoding: 'utf8' }).stdout.trim();
  assert.strictEqual(v, version);
});

test('lp/tools/ に展開した道具がそのまま動く（版の照合・ひな形からの dry-run）', { skip }, () => {
  const zip = build();
  const studio = path.join(tmpDir('studio'), 'image-studio');
  const tools = path.join(studio, 'lp', 'tools');
  fs.mkdirSync(tools, { recursive: true });
  assert.strictEqual(spawnSync('unzip', ['-q', zip, '-d', tools]).status, 0);
  assert.ok(fs.existsSync(path.join(tools, 'templates', 'comp.config.example.json')));
  const env = { COMP_TO_LP_FAKE: 'ok', OPENAI_API_KEY: FAKE_KEY };
  const d1 = run('deps.mjs', ['--expect-version', version], { cwd: studio, scriptPath: path.join(tools, 'deps.mjs'), env });
  assert.match(d1.stdout, new RegExp(`\\| 道具の版 \\| ${version.replace(/\./g, '\\.')}（必要: ${version.replace(/\./g, '\\.')}） \\| OK`), d1.out);
  const d2 = run('deps.mjs', ['--expect-version', '0.0.1'], { cwd: studio, scriptPath: path.join(tools, 'deps.mjs'), env });
  assert.match(d2.stdout, /\| 道具の版 \| .* \| NG \| シートから道具の zip を落とし直して/);
  fs.copyFileSync(path.join(tools, 'templates', 'comp.config.example.json'), path.join(studio, 'lp', 'comp.config.json'));
  fs.copyFileSync(path.join(tools, 'templates', 'jobs.example.json'), path.join(studio, 'lp', 'jobs.json'));
  const g = run('gen.mjs', ['--jobs', 'lp/jobs.json', '--config', 'lp/comp.config.json', '--dry-run'], { cwd: studio, scriptPath: path.join(tools, 'gen.mjs'), env });
  assert.strictEqual(g.status, 0, g.out);
  assert.match(g.stdout, /\| 合計 \| \| \| 3 \|/);
});

test('zip / unzip が無ければ、今ある zip を消さずに止まる', () => {
  const out = tmpDir('zip-keep');
  const old = path.join(out, `comp-to-lp-tools-${version}.zip`);
  fs.writeFileSync(old, 'old zip');
  // node だけが見える PATH（zip と unzip が無い状態）で起動する
  const r = spawnSync('/bin/bash', [path.join(ROOT, 'scripts', 'build-tools-zip.sh'), out], { encoding: 'utf8', env: { ...process.env, PATH: path.dirname(process.execPath) } });
  assert.notStrictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /(zip|unzip) コマンドが見つかりません/);
  assert.strictEqual(fs.readFileSync(old, 'utf8'), 'old zip', '今ある zip が変わっています');
});

test('作り直すと、今ある zip を検証済みの新しい zip に置き換える（一時ファイルは残さない）', { skip }, () => {
  const out = tmpDir('zip-replace');
  const old = path.join(out, `comp-to-lp-tools-${version}.zip`);
  fs.writeFileSync(old, 'old zip');
  const r = spawnSync('bash', [path.join(ROOT, 'scripts', 'build-tools-zip.sh'), out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.strictEqual(spawnSync('unzip', ['-tq', old]).status, 0, '置き換えた zip が壊れています');
  assert.deepStrictEqual(fs.readdirSync(out), [path.basename(old)], '一時ファイルが残っています');
});
