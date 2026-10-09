/**
 * comp-to-lp の共通処理（設定の読み込み・Playwright の解決・ページを開く）。
 *
 * 受講生の Node 20.6 以上でそのまま動かすため、型の無い .mjs で書く（型は JSDoc に残す）。
 * スクリプトの場所は fileURLToPath(import.meta.url) で求める
 * （import.meta のフォルダ名プロパティは Node 20.11 未満に無く、20.6 以上で動かすため使わない）。
 */
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

/** この道具一式（*.mjs と compose.html）が置かれているフォルダ */
export const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 合成用ページ compose.html の絶対パス */
export const COMPOSE_HTML = path.join(SCRIPTS_DIR, "compose.html");

/**
 * @typedef {{ top?: number, height?: number, left?: number, width?: number }} Box
 * @typedef {{ selector: string, line?: number | null, width: number, left?: number, note?: string }} TextTarget
 * @typedef {{ name: string, top: number, bottom: number }} Section
 *
 * @typedef {object} CompConfig
 * @property {string} [html]  実装のページ。html（ファイル）か url のどちらか
 * @property {string} [url]
 * @property {string} comp  カンプ画像（PNG/JPG）
 * @property {number} targetWidth  採寸の基準幅（ブラウザの幅）。カンプはこの幅に拡大縮小して比べる
 * @property {number} [viewportHeight]
 * @property {string} outDir  スクショ・比較画像の出力先
 * @property {number} [waitMs]  フォント読み込み後の待ち時間（ms）
 * @property {number} [tolerance]  許容する差（px）。measure / textw がこれを超えると終了コード 1
 * @property {Section[]} [sections]
 * @property {Record<string, Box>} [measure]
 * @property {TextTarget[]} [text]
 * @property {{ width: number, height: number, dpr?: number, comp?: string, sections?: Section[], measure?: Record<string, Box>, text?: TextTarget[] }} [mobile]
 *   スマホ幅。comp（スマホ用カンプ）を書くと、各道具に --viewport sp を付けたとき
 *   このブロックの comp / width / sections / measure / text で見比べる（出力は outDir/sp/）。
 *   comp が無ければ、shot.mjs --mobile で横はみ出しの確認と sp.png の撮影だけ行う。
 * @property {"pc" | "sp"} [viewport]  実際に使う画面の種類（loadConfig が埋める）
 * @property {number} [dpr]
 * @property {{ budgetYen?: number, jpyPerUsd?: number, quality?: "low" | "medium" | "high", rawDir?: string, promptDir?: string }} [images]
 */

/**
 * 引数を `--key value` / `--flag` の形で読む（依存を増やさないための最小実装）
 * @param {string[]} argv
 * @returns {{ opts: Record<string, string | true>, rest: string[] }}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string | true>} */
  const opts = {};
  /** @type {string[]} */
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        opts[a.slice(2, eq)] = a.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        opts[a.slice(2)] = argv[++i];
      } else {
        opts[a.slice(2)] = true;
      }
    } else {
      rest.push(a);
    }
  }
  return { opts, rest };
}

/**
 * @param {string} msg
 * @returns {never}
 */
export function die(msg) {
  // 設定ファイルの中身やパスに鍵が混ざっていても出さない
  console.error(redact(msg, [process.env.OPENAI_API_KEY ?? ""]));
  process.exit(2);
}

/**
 * 設定ファイルを読み、相対パスを「設定ファイルのあるディレクトリ」基準で絶対パスにする。
 * viewport が "sp" なら、mobile ブロック（スマホ用カンプ・スマホの採寸値）で置き換えた設定を返す。
 * @param {string | true | undefined} configPath
 * @param {string | true | undefined} [viewport]
 * @param {string | true | undefined} [outDirOverride]
 * @returns {{ cfg: CompConfig, baseDir: string }}
 */
export function loadConfig(configPath, viewport = "pc", outDirOverride) {
  if (typeof configPath !== "string") {
    die(`--config <comp.config.json> を指定してください（ひな形: この道具と同じ場所の templates/comp.config.example.json）`);
  }
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) die(`設定ファイルが見つかりません: ${abs}`);
  /** @type {CompConfig} */
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    die(`設定ファイルを JSON として読めません: ${abs}\n${e instanceof Error ? e.message : String(e)}`);
  }
  const baseDir = path.dirname(abs);
  // --out-dir: 並列のサブエージェントごとに出力先を分けるため（設定ファイルは書き換えない）
  if (typeof outDirOverride === "string") cfg.outDir = path.resolve(outDirOverride);
  /** @param {string | undefined} p */
  const r = (p) => (p === undefined ? undefined : path.resolve(baseDir, p));
  if (viewport === "sp") {
    const m = cfg.mobile;
    if (!m?.comp) die("--viewport sp には、設定の mobile.comp（スマホ用カンプ）が必要です");
    cfg = {
      ...cfg,
      comp: m.comp,
      targetWidth: m.width,
      viewportHeight: m.height,
      dpr: m.dpr ?? 1,
      sections: m.sections,
      measure: m.measure,
      text: m.text,
      outDir: path.join(cfg.outDir ?? "comp-shots", "sp"),
      viewport: "sp",
    };
  } else if (viewport !== "pc" && viewport !== undefined) {
    die("--viewport は pc か sp です");
  } else {
    cfg.viewport = "pc";
  }
  if (!cfg.html && !cfg.url) die("設定に html（ファイル）か url を書いてください");
  if (!cfg.comp) die("設定に comp（カンプ画像のパス）を書いてください");
  if (!cfg.targetWidth) die("設定に targetWidth（採寸の基準幅）を書いてください");
  cfg.html = r(cfg.html);
  cfg.comp = /** @type {string} */ (r(cfg.comp));
  cfg.outDir = /** @type {string} */ (r(cfg.outDir ?? "comp-shots"));
  if (cfg.html && !fs.existsSync(cfg.html)) die(`html が見つかりません: ${cfg.html}`);
  if (!fs.existsSync(cfg.comp)) die(`カンプ画像が見つかりません: ${cfg.comp}`);
  fs.mkdirSync(cfg.outDir, { recursive: true });
  return { cfg, baseDir };
}

/**
 * @param {CompConfig} cfg
 * @returns {string}
 */
export function pageUrl(cfg) {
  return cfg.url ?? pathToFileURL(/** @type {string} */ (cfg.html)).href;
}

/**
 * 合成用ページ compose.html を dir に _compose.html として書き出し、そのパスを返す。
 * （カンプ・スクショと同じ file:// に置くため、出力先へコピーして開く）
 * @param {string} dir
 * @returns {string}
 */
export function writeComposePage(dir) {
  const file = path.join(dir, "_compose.html");
  fs.writeFileSync(file, fs.readFileSync(COMPOSE_HTML, "utf8"));
  return file;
}

/**
 * Playwright を探す。道具の置き場所には node_modules が無いので、次の順に探す。
 *   1. --pw-root / 環境変数 COMP_TO_LP_PW_ROOT（node_modules/playwright を持つディレクトリ）
 *   2. 実装ページのあるディレクトリから上へ（作業フォルダの node_modules）
 *   3. 起動したディレクトリ（cwd）
 *   4. 道具のディレクトリ
 * @param {string | true | undefined} pwRoot
 * @param {CompConfig} [cfg]
 * @returns {Promise<any>}
 */
export async function loadPlaywright(pwRoot, cfg) {
  /** @type {string[]} */
  const candidates = [];
  if (typeof pwRoot === "string") candidates.push(path.resolve(pwRoot));
  if (process.env.COMP_TO_LP_PW_ROOT) candidates.push(path.resolve(process.env.COMP_TO_LP_PW_ROOT));
  if (cfg?.html) {
    let d = path.dirname(cfg.html);
    for (let i = 0; i < 6; i++) {
      candidates.push(d);
      const up = path.dirname(d);
      if (up === d) break;
      d = up;
    }
  }
  candidates.push(process.cwd());
  candidates.push(SCRIPTS_DIR);
  for (const c of candidates) {
    try {
      const entry = createRequire(path.join(c, "package.json")).resolve("playwright");
      const mod = await import(pathToFileURL(entry).href);
      return mod.default ?? mod;
    } catch {
      // 次の候補へ
    }
  }
  die(
    [
      "Playwright（Node 版）が見つかりません。作業フォルダで次の 2 つを 1 つずつ実行してください:",
      "  1. npm i -D playwright@1.61.1",
      "  2. npx playwright install chromium",
      "既に入っているフォルダを指す場合: --pw-root <node_modules/playwright を持つディレクトリ>",
      "（または環境変数 COMP_TO_LP_PW_ROOT）",
      `探した場所: ${candidates.join(", ")}`,
    ].join("\n"),
  );
}

/**
 * ページを開き、Web フォントの読み込みを待つ
 * @param {any} browser
 * @param {string} url
 * @param {{ width: number, height: number, dpr?: number }} size
 * @param {number} [waitMs]
 * @returns {Promise<any>}
 */
export async function openPage(browser, url, size, waitMs = 800) {
  const page = await browser.newPage({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr ?? 1,
  });
  await page.goto(url, { waitUntil: "load" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 15000 });
  } catch {
    // 常時通信するページでも止めない
  }
  // FontFaceSet そのものは返せない（シリアライズできない）ので true を返す
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.waitForTimeout(waitMs);
  return page;
}

/**
 * 鍵らしい文字列を伏せる。`sk-` で始まる 8 文字以上の並びと、渡された値そのもの（extra）を消す。
 * API の返事の本文・例外のスタック・台帳のメモなど、外へ出す文字列は必ずここを通す。
 * @param {unknown} s
 * @param {string[]} [extra]
 * @returns {string}
 */
export function redact(s, extra = []) {
  let t = String(s);
  for (const v of extra) if (typeof v === "string" && v.length >= 8) t = t.split(v).join("***");
  return t.replace(/sk-[A-Za-z0-9_\-]{8,}/g, "sk-***");
}

/**
 * 名前が .env で始まる部分（.env・.env.local・.env.probe など）がパスに含まれるか。
 * base を渡すと base より下の部分だけを見る（作業フォルダより上の名前は問わない）。渡さなければファイル名だけを見る
 * @param {string} p
 * @param {string} [base]
 */
export function hasEnvSegment(p, base) {
  const abs = path.resolve(p);
  const parts = base === undefined ? [] : path.relative(path.resolve(base), abs).split(/[\\/]+/);
  return [...parts, path.basename(abs)].some((s) => /^\.env/i.test(s));
}

/**
 * いちばん近い「実在する上のフォルダ」の実体（シンボリックリンクをたどった先）に、残りのパスをつなげる
 * @param {string} abs
 */
function realpathLoose(abs) {
  let cur = abs;
  /** @type {string[]} */
  const rest = [];
  while (!fs.existsSync(cur)) {
    const up = path.dirname(cur);
    if (up === cur) break;
    rest.unshift(path.basename(cur));
    cur = up;
  }
  let real = cur;
  try {
    real = fs.realpathSync.native(cur);
  } catch {
    // 実体が読めなければそのまま比べる
  }
  return path.join(real, ...rest);
}

/**
 * base（設定ファイルのあるフォルダ）の配下のパスだけを許す。../・絶対パス・シンボリックリンクで外へ出るもの、
 * 名前が .env で始まるもの（鍵のファイル）は止める。問題が無ければ絶対パスを返す
 * @param {string} base
 * @param {string} p
 * @param {string} label
 * @returns {string}
 */
export function resolveInside(base, p, label) {
  if (typeof p !== "string" || !p) die(`${label} のパスが空です`);
  const abs = path.resolve(base, p);
  if (hasEnvSegment(abs, base)) die(`${label}（${p}）: 名前が .env で始まるファイル・フォルダは読み書きできません`);
  const baseReal = realpathLoose(path.resolve(base));
  const real = realpathLoose(abs);
  const rel = path.relative(baseReal, real);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    die(`${label}（${p}）: 設定ファイルのあるフォルダ（${base}）の中だけを指定できます`);
  }
  return abs;
}

/**
 * 文章の中に鍵らしい文字列があるか（プロンプトに鍵を貼ってしまった事故を防ぐ）。
 * `sk-` に 16 文字以上が続く並び、または渡された値そのもの（extra）を探す。見つけた値は返さない
 * @param {unknown} s
 * @param {string[]} [extra]
 * @returns {boolean}
 */
export function hasKeyLike(s, extra = []) {
  const t = String(s ?? "");
  if (/sk-[A-Za-z0-9_\-]{16,}/.test(t)) return true;
  return extra.some((v) => typeof v === "string" && v.length >= 8 && keyShape(v) === "ok" && t.includes(v));
}

/**
 * 想定外の例外で落ちたときも、スタックに鍵が混ざらないよう伏せ字にしてから出す。
 * @param {string[]} [extra]
 */
export function installRedactingCrashHandler(extra = []) {
  /** @param {unknown} e */
  const onCrash = (e) => {
    const text = e instanceof Error ? e.stack ?? e.message : String(e);
    console.error(redact(`想定外のエラーで止まりました: ${text}`, extra));
    process.exit(1);
  };
  process.on("uncaughtException", onCrash);
  process.on("unhandledRejection", onCrash);
}

/**
 * 鍵の形だけを確かめる（値は返さない・表示しない）。
 * @param {string | undefined} key
 * @returns {"missing" | "bad-prefix" | "bad-char" | "ok"}
 */
export function keyShape(key) {
  if (!key) return "missing";
  if (!key.startsWith("sk-")) return "bad-prefix";
  if (/[\s\x00-\x1f\x7f]/.test(key)) return "bad-char";
  return "ok";
}

/**
 * "20.6.1" のような版が min（[20, 6, 0] など）以上か。数値で比べる（文字列比較だと 20.10 < 20.6 になるため）
 * @param {string} version
 * @param {number[]} min
 */
export function versionAtLeast(version, min) {
  const v = String(version).replace(/^v/, "").split(".").map((s) => Number.parseInt(s, 10) || 0);
  for (let i = 0; i < min.length; i++) {
    const a = v[i] ?? 0;
    if (a !== min[i]) return a > min[i];
  }
  return true;
}

/** 鍵の形が違うときの案内（値は出さない） */
export const KEY_SHAPE_MESSAGE = {
  missing: "OPENAI_API_KEY が読めません。作業フォルダ（image-studio）で `node --env-file=.env.local <道具のパス>` の形で起動してください（.env.local を開いて確かめる必要はありません）",
  "bad-prefix": "OPENAI_API_KEY の形が違います（sk- で始まっていません）。補講2 シートの STEP 1 の手順で鍵を保存し直してください",
  "bad-char": "OPENAI_API_KEY に空白や改行が混ざっています。補講2 シートの STEP 1 の手順で鍵を保存し直してください",
};

/**
 * @param {number} n
 * @param {number} [width]
 * @returns {string}
 */
export function fmt(n, width = 6) {
  return (n >= 0 ? "+" : "") + n.toFixed(0).padStart(width - 1);
}
