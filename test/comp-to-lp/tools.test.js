#!/usr/bin/env node
/**
 * shot / measure / crop / textw の動作テストと、道具一式のソースの決まりごと
 *
 * 実行: COMP_TO_LP_PW_ROOT=<playwright@1.61.1 を入れたフォルダ> npm test
 *   Playwright を使うテストは COMP_TO_LP_PW_ROOT が無いと skip（理由を表示する）。ソースの検査は常に動く
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SCRIPTS, FIXTURES, PW_ROOT, run, tmpDir } = require('./helpers.js');

const skip = PW_ROOT ? false : 'COMP_TO_LP_PW_ROOT が無いので skip（playwright@1.61.1 を入れたフォルダを指定すると動く）';
const cfg = path.join(FIXTURES, 'comp.config.json');
const mjs = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs'));

test('shot: sections 数ぶん（3 枚）の cmp_*.png と impl.png', { skip }, () => {
  const out = tmpDir('shot');
  const r = run('shot.mjs', ['--config', cfg, '--out-dir', out, '--pw-root', PW_ROOT]);
  assert.strictEqual(r.status, 0, r.out);
  const cmp = fs.readdirSync(out).filter((f) => /^cmp_.*\.png$/.test(f)).sort();
  assert.deepStrictEqual(cmp, ['cmp_0_hero.png', 'cmp_1_features.png', 'cmp_2_recommend.png']);
  assert.ok(fs.existsSync(path.join(out, 'impl.png')));
});

test('measure: 正しい目標値で exit 0・間違えた目標値で exit 1', { skip }, () => {
  const out = tmpDir('measure');
  assert.strictEqual(run('measure.mjs', ['--config', cfg, '--out-dir', out, '--pw-root', PW_ROOT]).status, 0);
  const r = run('measure.mjs', ['--config', path.join(FIXTURES, 'comp.config.wrong.json'), '--out-dir', out, '--pw-root', PW_ROOT]);
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.stdout, /NG 2 件/);
});

test('crop: 範囲を拡大した画像を作る・数値でない指定は exit 2', { skip }, () => {
  const out = tmpDir('crop');
  const r = run('crop.mjs', ['--config', cfg, '--out-dir', out, '--pw-root', PW_ROOT, '--y', '740', '--h', '200', '--w', '600']);
  assert.strictEqual(r.status, 0, r.out);
  assert.ok(fs.existsSync(path.join(out, 'crop_comp_0_740_600x200@2.png')));
  assert.strictEqual(run('crop.mjs', ['--config', cfg, '--out-dir', out, '--pw-root', PW_ROOT, '--y', 'abc', '--h', '10']).status, 2);
});

test('textw: 起動して表を出す（値は Web フォント次第なので終了コードは 0 か 1）', { skip }, () => {
  const r = run('textw.mjs', ['--config', cfg, '--out-dir', tmpDir('textw'), '--pw-root', PW_ROOT]);
  assert.ok(r.status === 0 || r.status === 1, r.out);
  assert.match(r.stdout, /許容差 ±1px/);
});

test('全 .mjs が node --check を通る', () => {
  for (const f of mjs) {
    const r = spawnSync(process.execPath, ['--check', path.join(SCRIPTS, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, `${f}: ${r.stderr}`);
  }
});

test('道具一式に使えない書き方・言葉が無い', () => {
  const files = [...mjs, 'compose.html'];
  for (const f of files) {
    const src = fs.readFileSync(path.join(SCRIPTS, f), 'utf8');
    assert.ok(!src.includes('import.meta.dirname'), `${f}: import.meta.dirname`);
    assert.ok(!/from\s+["'][^"']+\.ts["']/.test(src), `${f}: .ts の import`);
    assert.ok(!/ちーけんさん|~\/\.claude|youtube-to-infographic|gen-batch|image_calls|calls\.tsv/.test(src), `${f}: 使えない言葉`);
    assert.ok(!/python/i.test(src), `${f}: python`);
    assert.ok(!/CLAUDE_PLUGIN_ROOT/.test(src), `${f}: CLAUDE_PLUGIN_ROOT（受講生側のファイルに書き出さない）`);
  }
});

// ---- SKILL.md・references・templates（T5 の完了条件）----
const SKILL_DIR = path.join(SCRIPTS, '..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const docs = [path.join(SKILL_DIR, 'SKILL.md'), ...walk(path.join(SKILL_DIR, 'references')), ...walk(path.join(SKILL_DIR, 'templates'))];
const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');

test('スキル一式に使えない言葉・オプション・古い台帳名が無い', () => {
  for (const f of walk(SKILL_DIR)) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(SKILL_DIR, f);
    assert.ok(!/ちーけんさん|~\/\.claude\/docs|youtube-to-infographic|gen-batch/.test(src), `${rel}: 使えない言葉`);
    assert.ok(!/python/i.test(src), `${rel}: python`);
    assert.ok(!/--ledger|--budget|--par\b/.test(src), `${rel}: 無いオプション`);
    assert.ok(!/image_calls|calls\.tsv/.test(src), `${rel}: 古い台帳名`);
    for (const m of src.match(/[\w/.-]*image-ledger\.[a-z]+/g) || []) assert.ok(m.endsWith('docs/image-ledger.tsv') || m === 'image-ledger.tsv' || m.endsWith('image-ledger.lock'), `${rel}: 台帳の名前 ${m}`);
  }
});

test('SKILL.md: 4 つの宣言（本体と 2 つの指示文）・承認は AskUserQuestion 1 か所・&& なし', () => {
  assert.strictEqual((skill.match(/AskUserQuestion/g) || []).length, 1);
  for (const f of docs) assert.ok(!fs.readFileSync(f, 'utf8').includes('&&'), `${path.relative(SKILL_DIR, f)}: &&`);
  assert.match(skill, /止まって確認するのは STEP 2 の「見積もりの承認」1 回だけ/);
  assert.match(skill, /feature-dev・Plan Mode・実装計画のファイル作成を提案しない/);
  assert.match(skill, /並行で動かすのは、講師が許可した例外/);
  assert.match(skill, /DESIGN\.md は作らない/);
  assert.match(skill, /frontend-design スキルと UI 禁止パターン集は使わない/);
  const briefs = skill.split('----ここから----').slice(1);
  assert.strictEqual(briefs.length, 2, '指示文が 2 つではありません');
  for (const b of briefs) {
    assert.match(b, /止まって確認しない/);
    assert.match(b, /feature-dev・Plan Mode を提案しない/);
    assert.match(b, /講師が許可した例外/);
    assert.match(b, /DESIGN\.md を作らない・frontend-design と UI 禁止パターン集は使わない/);
    assert.ok(b.includes('----ここまで----'));
  }
});

test('SKILL.md: 道具は "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/xxx.mjs" の形だけで呼ぶ', () => {
  const calls = skill.match(/[^\s`]*scripts\/[a-z]+\.mjs[^\s`]*/g) || [];
  assert.ok(calls.length >= 10, `呼び出しが少なすぎます: ${calls.length}`);
  for (const c of calls) assert.match(c, /^"\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/comp-to-lp\/scripts\/[a-z]+\.mjs"$/, c);
  for (const m of fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.mjs') && f !== 'lib.mjs')) assert.ok(skill.includes(`scripts/${m}"`), `${m} が SKILL.md にありません`);
});

test('SKILL.md: 最初の手順・一括 1 回 + 作り直し 1 回・再開（台帳が正）・90 分', () => {
  const s0 = skill.indexOf('## STEP 0');
  assert.ok(s0 > 0);
  const order = ['node --version', 'deps.mjs" --expect-version-from', 'Read ツールで `.env.probe`', '`cat .env.probe`'].map((k) => skill.indexOf(k, s0));
  assert.ok(order.every((i) => i > 0), `見つからない手順があります: ${order}`);
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, '最初の手順の順番が違います');
  assert.match(skill, /「一括 1 回 ＋ 作り直し 1 回」の 2 回だけ/);
  assert.match(skill, /作った画像の判断は台帳（`lp\/docs\/image-ledger\.tsv`）だけで行う/);
  assert.match(skill, /90 分で終わったところまで/);
  assert.match(skill, /lp\/docs\/ASSETS\.md/);
  assert.match(skill, /並行で動かせなかったとき/);
  assert.match(skill, /\.env\.local は開かない・読まない・中身を表示しないでください/);
});
