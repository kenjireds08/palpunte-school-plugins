/**
 * comp-to-lp の道具のテスト用の共通処理。
 * - 道具は子プロセスで起動する（受講生と同じ使い方で確かめるため）
 * - OpenAI は呼ばない。gen / deps は必ず COMP_TO_LP_FAKE を付けて起動する（付け忘れたら例外）
 * - 鍵らしい値はテスト用のダミー（FAKE_KEY）だけを使う。本物の OPENAI_API_KEY は子プロセスに渡さない
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, 'plugins', 'school-starter', 'skills', 'comp-to-lp', 'scripts');
const FIXTURES = path.join(__dirname, 'fixtures');
/** 伏せ字の確認用のダミーの鍵（本物ではない） */
const FAKE_KEY = 'sk-test-LEAKCHECK-0123456789abcdefghijklmnop';
/** 出力に鍵らしい文字列（sk- + 20 文字以上）が残っていないかを見る */
const KEY_LIKE = /sk-[A-Za-z0-9_-]{20,}/;
/** Playwright を使うテストは、これが設定されているときだけ動かす */
const PW_ROOT = process.env.COMP_TO_LP_PW_ROOT || '';

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `comp-to-lp-${prefix}-`));
}

/** 子プロセスに渡す環境変数（本物の鍵は消し、テスト用の値だけを足す） */
function childEnv(extra = {}) {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.COMP_TO_LP_FAKE;
  delete env.COMP_TO_LP_FAKE_WAIT_MS;
  delete env.COMP_TO_LP_FAKE_DELAY_MS;
  delete env.COMP_TO_LP_FAKE_NODE_VERSION;
  return { ...env, ...extra };
}

/**
 * 道具を起動する。opts.fake が無い gen / deps の起動は、本物の API を呼ぶ恐れがあるので拒否する
 * （例外: opts.allowNoFake は「鍵が無いので API に届く前に止まる」ことを確かめるときだけ使う）
 */
function run(script, args, opts = {}) {
  const env = childEnv(opts.env || {});
  if ((script === 'gen.mjs' || script === 'deps.mjs') && !env.COMP_TO_LP_FAKE && !opts.allowNoFake) {
    throw new Error(`テストで ${script} を COMP_TO_LP_FAKE なしで起動しようとしました`);
  }
  if (opts.allowNoFake && env.OPENAI_API_KEY) throw new Error('allowNoFake のときは鍵を渡せません');
  const nodeArgs = [...(opts.nodeArgs || []), opts.scriptPath || path.join(SCRIPTS, script), ...args];
  const r = spawnSync(process.execPath, nodeArgs, { cwd: opts.cwd || ROOT, env, encoding: 'utf8', timeout: opts.timeout || 120000 });
  return { status: r.status, signal: r.signal, stdout: r.stdout || '', stderr: r.stderr || '', out: (r.stdout || '') + (r.stderr || '') };
}

/** 台帳を読む（ヘッダを除いた行の配列） */
function readLedger(dir) {
  const f = path.join(dir, 'docs', 'image-ledger.tsv');
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('time\t'))
    .map((l) => {
      const c = l.split('\t');
      return { time: c[0], name: c[1], event: c[2], size: c[3], quality: c[4], sec: c[5], tokens: c[6], yen: Number(c[7]) || 0, note: c[8] || '' };
    });
}

/** gen のテスト用の作業フォルダ（comp.config.json と jobs.json）を作る */
function genWorkspace({ budgetYen = 300, jobs, images } = {}) {
  const dir = tmpDir('gen');
  const baseJobs = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'jobs.json'), 'utf8'));
  const cfg = { html: 'index.html', comp: 'comp-pc.png', targetWidth: 1448, outDir: 'comp-shots', images: { budgetYen, quality: 'medium', rawDir: 'assets/raw', promptDir: 'prompts/images', ...(images || {}) } };
  fs.writeFileSync(path.join(dir, 'comp.config.json'), JSON.stringify(cfg, null, 2));
  fs.writeFileSync(path.join(dir, 'jobs.json'), JSON.stringify(jobs || baseJobs, null, 2));
  return { dir, config: path.join(dir, 'comp.config.json'), jobs: path.join(dir, 'jobs.json'), baseJobs };
}

/** 8 件のジョブ（並列のテスト用）。フィクスチャの 4 件を名前を変えて 2 倍にする */
function eightJobs() {
  const base = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'jobs.json'), 'utf8'));
  return [...base, ...base.map((j) => ({ ...j, name: `${j.name}-b` }))];
}

/** ディレクトリの中のすべてのファイルの中身をつなげる（鍵が漏れていないかを見るため） */
function readAllText(dir) {
  let s = '';
  if (!fs.existsSync(dir)) return s;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) s += readAllText(p);
    else if (/\.(tsv|txt|json|md|log)$/.test(e.name)) s += fs.readFileSync(p, 'utf8');
  }
  return s;
}

module.exports = { ROOT, SCRIPTS, FIXTURES, FAKE_KEY, KEY_LIKE, PW_ROOT, tmpDir, run, readLedger, genWorkspace, eightJobs, readAllText };
