#!/usr/bin/env node
/**
 * 画像素材を gpt-image-2.5-sunburst でまとめて作る（見積もり・費用の上限・台帳・自動の並列数つき）。
 * OpenAI の API は Node 標準の fetch で直接呼ぶ。ほかのプログラムは起動しない。
 *
 * usage（作業フォルダ image-studio で実行する。鍵は --env-file で渡し、このファイルは鍵を表示しない）:
 *   node --env-file=.env.local gen.mjs --jobs lp/jobs.json --config lp/comp.config.json --dry-run      見積もりだけ（費用ゼロ）
 *   node --env-file=.env.local gen.mjs --jobs lp/jobs.json --config lp/comp.config.json                 一括で作る（再開もこれ）
 *   node --env-file=.env.local gen.mjs --jobs lp/jobs.json --config lp/comp.config.json --only a,b      指定した素材だけ作り直す
 *   node --env-file=.env.local gen.mjs --jobs lp/jobs.json --config lp/comp.config.json --only a --suffix -v2   別名で作り直す（元を残す）
 *   [--retry-rate 0.2]   見積もりの「作り直しの見込み」の割合（表示だけ）
 *   [--verbose]          1 枚目の返事で受け取ったヘッダの名前の一覧を出す（値は出さない）
 *
 * 決まりごと（変えられない）:
 *   - quality は medium 固定。費用の上限は min(300 円, 設定の images.budgetYen)
 *   - 台帳は設定ファイルの場所から docs/image-ledger.tsv。追記だけで、書き換え・削除はしない
 *     列: time / name / event / size / quality / sec / tokens / yen / note
 *     event: pending（送る直前）/ ok（保存した）/ err（失敗）/ reconciled（再開時にファイルから ok と判定）
 *     1 つの素材の状態 = その name の最後の行の event
 *   - 再開: ok / reconciled は飛ばす。err は作り直す。pending は、ファイルが pending より後に保存されていれば
 *     reconciled を書いて飛ばし、無ければ「状態不明」と出して呼ばない（課金済みかもしれないため）
 *   - 並列数: 1 枚目は 1 枚だけで呼び、返事のヘッダ x-ratelimit-limit-requests（L）/ x-ratelimit-remaining-requests（R）から
 *     par = clamp(floor(L / 60 × 15), 1, 4)。R < par なら max(1, R)。R > L（食い違い）なら 1。
 *     ヘッダが無い・数でない（画像 API の返事には付かないことがある）なら 2 枚から始め、429 が来たら 1 に下げてそのまま続ける
 *   - 429: 全体の並列数を 1 段下げ（同じ待ちの間に何回来ても 1 段だけ）、失敗したジョブを最後に回す。
 *     Retry-After の秒数（無ければ 60 秒）待ってから再開。同じジョブで 2 回目の 429 は err
 *   - insufficient_quota・401・403・失敗 3 回連続は全体を止め、「残高か鍵を確認」を 1 回だけ出す。
 *     止めるときは、送信中のリクエストも共有の AbortController で打ち切る（打ち切ったものは状態不明）
 *   - 送ったあとで結果が分からなくなったもの（タイムアウト・途中で切れた・返事が読めない・200 なのに画像が無い・
 *     サーバー側の失敗 5xx）は、err にせず pending のまま残す（状態不明）。自動では送り直さない（二重課金を防ぐ）。
 *     err にするのは、送る前に失敗したと確実に分かるもの（名前解決の失敗・接続の拒否・接続のタイムアウト）と、
 *     OpenAI が受け付けなかった返事（4xx。429 は待って 1 回だけ送り直す）だけ。状態不明も「失敗 3 回連続」に数える
 *   - 書き出し先（out・rawDir・promptDir）は設定ファイルのあるフォルダの中だけ。.env で始まる名前は拒否する
 *   - 上限の判定: 送る前に、その 1 枚で起こりうる最大額（予約額）を台帳の累計に足して判定する。
 *     pending の行には予約額を書く。実費が予約額を超えたら、その時点で全体を止める
 *   - プロンプトに鍵らしい文字列（sk- に長い文字列が続くもの）があれば、そのジョブは保存も送信もしない（err）
 *   - 同じ台帳を 2 つの gen.mjs が同時に使わないよう、docs/image-ledger.lock を排他で作る
 *     （中身は PID。残っていても、その PID のプロセスが無ければ古いロックとして消して進む）
 *   - 台帳に読めない行（event・時刻・yen が不正）があれば、安全側に倒して何もせずに止まる
 *
 * jobs.json: [{ "name": "hero-bg", "kind"?: "photo", "size": "1536x1024", "prompt": "...", "out"?: "assets/raw/hero-bg.png", "final"?: [...] }]
 *   kind（photo / icon / hand / logo / bg / map など）は見積もりの内訳用。省略時は name の接頭辞から推定
 * 設定の images（パスは設定ファイルのあるディレクトリ基準）:
 *   budgetYen（既定 300・300 より上は 300 として扱う）/ jpyPerUsd（既定 154.5）/ rawDir（既定 assets/raw）/ promptDir（既定 prompts/images）
 *
 * 終了コード: 0 = 全部できた / 1 = 失敗・状態不明・上限で飛ばしたものがある、または途中で止めた / 2 = 設定の不備・上限を超える見積もり
 *
 * テストモード（課金しない）: COMP_TO_LP_FAKE=<シナリオ> で fetch を差し替える。待ち時間は COMP_TO_LP_FAKE_WAIT_MS で短縮。
 *   ok / limit5 / limit50 / noheader / remaining1 / inconsistent / 429-retry-after / 429-noheader / 429-multi /
 *   quota / 401 / 403 / err3 / kill-before-send / kill-after-response / kill-after-save /
 *   timeout / conn-refused / bad-json / no-image / overcost / 401-parallel / bad-request3（400 が続く）/ noheader-429（上限ヘッダなし＋3 回目に 429）
 */
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { parseArgs, die, redact, installRedactingCrashHandler, keyShape, KEY_SHAPE_MESSAGE, hasKeyLike, resolveInside } from "./lib.mjs";

const MODEL = "gpt-image-2.5-sunburst";
const API_URL = "https://api.openai.com/v1/images/generations";
const QUALITY = "medium";
const HARD_CAP_YEN = 300;
const LEDGER_REL = path.join("docs", "image-ledger.tsv");
const LEDGER_COLUMNS = ["time", "name", "event", "size", "quality", "sec", "tokens", "yen", "note"];
const MAX_PAR = 4;
const DEFAULT_WAIT_SEC = 60;
const FATAL_ERR_STREAK = 3;
/** ファイルの更新時刻の粗さ（FAT などは 2 秒単位）を見込む幅 */
const MTIME_SLACK_MS = 2000;
const ALLOWED_OPTS = new Set(["jobs", "config", "dry-run", "only", "suffix", "retry-rate", "verbose"]);
/** 上限ヘッダが付いていないときに始める並列数（429 が来たら 1 に下げる） */
const UNKNOWN_LIMIT_PAR = 2;

const KEY = process.env.OPENAI_API_KEY ?? "";
const FAKE = process.env.COMP_TO_LP_FAKE ?? "";
installRedactingCrashHandler([KEY]);

/** @param {...unknown} a */
const log = (...a) => console.log(redact(a.join(" "), [KEY]));
/** @param {...unknown} a */
const warn = (...a) => console.error(redact(a.join(" "), [KEY]));
/** @param {number} ms */
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** 止めるときに、送信中のリクエストをまとめて打ち切るためのもの */
const abortAll = new AbortController();

// ---- 引数・設定 ----
const { opts, rest } = parseArgs(process.argv.slice(2));
for (const k of Object.keys(opts)) {
  if (!ALLOWED_OPTS.has(k)) die(`--${k} という オプションはありません（使えるのは ${[...ALLOWED_OPTS].map((o) => "--" + o).join(" ")}）`);
}
if (rest.length) die(`余分な引数があります: ${rest.join(" ")}`);
if (typeof opts.jobs !== "string") die("--jobs <jobs.json> を指定してください");
if (typeof opts.config !== "string") die("--config <comp.config.json> を指定してください（費用の上限と台帳の置き場所を読むため）");
const dryRun = Boolean(opts["dry-run"]);
const verbose = Boolean(opts.verbose);
const cfgPath = path.resolve(opts.config);
if (!fs.existsSync(cfgPath)) die(`設定ファイルが見つかりません: ${cfgPath}`);
const base = path.dirname(cfgPath);
/** @type {import("./lib.mjs").CompConfig} */
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (e) {
  die(`設定ファイルを JSON として読めません: ${cfgPath}\n${e instanceof Error ? e.message : String(e)}`);
}
const img = cfg.images ?? {};
const cfgBudget = img.budgetYen ?? HARD_CAP_YEN;
if (typeof cfgBudget !== "number" || !Number.isFinite(cfgBudget) || cfgBudget <= 0) die("設定の images.budgetYen は正の数にしてください");
// 上限はコードに固定。設定に 300 より大きい数を書いても 300 で止まる
const budget = Math.min(HARD_CAP_YEN, cfgBudget);
const jpyPerUsd = img.jpyPerUsd ?? 154.5;
if (typeof jpyPerUsd !== "number" || !(jpyPerUsd > 0)) die("設定の images.jpyPerUsd は正の数にしてください");
if (img.quality !== undefined && img.quality !== QUALITY) warn(`注意: images.quality は ${QUALITY} 固定です（設定の ${img.quality} は使いません）`);
const suffix = typeof opts.suffix === "string" ? opts.suffix : "";
if (suffix && !/^[A-Za-z0-9._-]+$/.test(suffix)) die("--suffix は英数字と . _ - だけにしてください（例: -v2）");
const retryRate = Number(opts["retry-rate"] ?? 0.2);
if (!Number.isFinite(retryRate) || retryRate < 0) die("--retry-rate は 0 以上の数にしてください");
// 書き出し先は設定ファイルのあるフォルダ（lp/）の中だけ。.env で始まる名前は拒否する
const rawDir = resolveInside(base, img.rawDir ?? "assets/raw", "images.rawDir");
const promptDir = resolveInside(base, img.promptDir ?? "prompts/images", "images.promptDir");
const ledger = path.resolve(base, LEDGER_REL);

/**
 * @typedef {{ name: string, kind?: string, size: string, prompt: string, quality?: string, out?: string, slot?: string, adopt?: string, final?: unknown[] }} Job
 */
const jobsPath = path.resolve(opts.jobs);
if (!fs.existsSync(jobsPath)) die(`jobs.json が見つかりません: ${jobsPath}`);
/** @type {Job[]} */
let jobs;
try {
  jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
} catch (e) {
  die(`jobs.json を JSON として読めません: ${jobsPath}\n${e instanceof Error ? e.message : String(e)}`);
}
if (!Array.isArray(jobs)) die("jobs.json は [ ... ] の配列にしてください");
const seen = new Set();
for (const j of jobs) {
  if (!j || typeof j.name !== "string" || !/^[A-Za-z0-9._-]+$/.test(j.name)) die(`ジョブの name は英数字と . _ - だけにしてください: ${JSON.stringify(j?.name)}`);
  if (seen.has(j.name)) die(`jobs.json に同じ name が 2 つあります: ${j.name}`);
  seen.add(j.name);
}
/** @type {Set<string> | null} */
const onlySet = typeof opts.only === "string" ? new Set(opts.only.split(",").map((s) => s.trim()).filter(Boolean)) : null;
if (opts.only === true) die("--only には名前をカンマ区切りで書いてください（例: --only hero-bg,icon-paw）");
if (onlySet) {
  jobs = jobs.filter((j) => onlySet.has(j.name));
  const missing = [...onlySet].filter((k) => !jobs.some((j) => j.name === k));
  if (missing.length) die(`jobs に無い名前: ${missing.join(", ")}`);
}
if (suffix && !onlySet) die("--suffix は --only と一緒に使ってください（作り直す素材を決めるため）");
if (!jobs.length) die("生成するジョブがありません");

// サイズの検査（公式の制約: 両辺 16 の倍数 / 長辺:短辺 3:1 以内 / 総画素 655,360〜8,294,400）
for (const j of jobs) {
  const m = /^(\d+)x(\d+)$/.exec(j.size ?? "");
  if (!m || typeof j.prompt !== "string" || !j.prompt.trim()) die(`ジョブの形が不正です（size と prompt が要ります）: ${j.name}`);
  const w = Number(m[1]);
  const h = Number(m[2]);
  const px = w * h;
  if (w % 16 || h % 16 || Math.max(w, h) / Math.min(w, h) > 3 || px < 655360 || px > 8294400) {
    die(`${j.name}: サイズ ${j.size} は使えません（16 の倍数・3:1 以内・655,360〜8,294,400 画素）`);
  }
  if (j.quality !== undefined && j.quality !== QUALITY) warn(`注意 ${j.name}: quality は ${QUALITY} 固定です（${j.quality} は使いません）`);
  if (/[\u{1F300}-\u{1FAFF}]/u.test(j.prompt)) warn(`注意 ${j.name}: プロンプトに絵文字があります`);
  if (hasKeyLike(j.prompt, [KEY])) warn(`注意 ${j.name}: プロンプトに鍵らしい文字列（sk- で始まる長い文字列）があります。このジョブは送りません。prompt から消してください`);
}

if (!dryRun && !FAKE) {
  const shape = keyShape(KEY);
  if (shape !== "ok") die(KEY_SHAPE_MESSAGE[shape]);
}

/*
 * 単価の根拠（gpt-image-2.5-sunburst・images/generations）
 * - 料金: 出力（画像）$30 / 100 万トークン、入力テキスト $5 / 100 万トークン（2026-09-09 時点）
 * - 出力トークンは画像サイズと quality だけで決まり、絵の中身では変わらない
 *   実測（medium）: 1536x1024 = 343 / 1024x1536 = 343 / 1024x1024 = 439 / 1024x1280 = 378
 * - 入力テキストはプロンプトの文字数から安全側に見積もる
 * 表に無いサイズは画素数で比例（「推定」と表示）
 */
/** @type {Record<string, number>} */
const OUT_TOKENS = { "1536x1024": 343, "1024x1536": 343, "1024x1024": 439, "1024x1280": 378 };
const USD_OUT = 30 / 1_000_000;
const USD_IN = 5 / 1_000_000;

/** @param {Job} j */
function outTokens(j) {
  const exact = OUT_TOKENS[j.size];
  if (exact) return { tokens: exact, measured: true };
  const [w, h] = j.size.split("x").map(Number);
  return { tokens: Math.round(Math.max(343, (343 * w * h) / (1536 * 1024))), measured: false };
}
/** @param {Job} j */
function inTokens(j) {
  return Math.max(100, Math.ceil(j.prompt.length / 3)); // 英語は約 4 文字で 1 トークン。安全側に 3 で割る
}
/**
 * 1 枚の見積もり（円）。exact = 料金表どおり / safe = 入力も出力単価で数えた安全側（上限の判定に使う）
 * @param {Job} j
 */
function estimateYen(j) {
  const o = outTokens(j);
  const i = inTokens(j);
  return { exact: (o.tokens * USD_OUT + i * USD_IN) * jpyPerUsd, safe: (o.tokens + i) * USD_OUT * jpyPerUsd, measured: o.measured };
}
/** 予約額の余裕（出力トークンの実測値に対する倍率） */
const RESERVE_OUT_FACTOR = 1.5;
/**
 * 送る前に確保する「その 1 枚で起こりうる最大額」（円）。上限の判定と pending の行に使う。
 * 出力トークンはサイズと quality で決まる値の 1.5 倍、入力はプロンプトの文字数と同じ数のトークン
 * （日本語でも 1 文字 1 トークンを超えにくい）を、どちらも高いほうの出力単価で数える
 * @param {Job} j
 */
function reserveYen(j) {
  const o = Math.ceil(outTokens(j).tokens * RESERVE_OUT_FACTOR);
  const i = Math.max(100, j.prompt.length);
  return (o + i) * USD_OUT * jpyPerUsd;
}
/** @param {Job} j */
function kindOf(j) {
  if (j.kind) return j.kind;
  const m = /^(icon|hand|logo|map|bg)[-_]/.exec(j.name);
  if (m) return m[1];
  return /[-_]bg$/.test(j.name) ? "bg" : "photo";
}
/** @param {number} n */
const round2 = (n) => Math.round(n * 100) / 100;

// ---- 台帳（追記のみ）----
/**
 * @typedef {{ time: string, name: string, event: string, size: string, quality: string, sec: string, tokens: string, yen: number, note: string }} LedgerRow
 */
const EVENTS = new Set(["pending", "ok", "err", "reconciled"]);
/** 1 行あたりの額の上限（これを超える行は壊れているとみなす） */
const MAX_ROW_YEN = HARD_CAP_YEN;
/**
 * 台帳を読む。読めない行があれば、安全側に倒して何もせずに止める（費用の判定を誤らないため）
 * @returns {LedgerRow[]}
 */
function readLedger() {
  if (!fs.existsSync(ledger)) return [];
  /** @type {LedgerRow[]} */
  const rows = [];
  const lines = fs.readFileSync(ledger, "utf8").split(/\r?\n/);
  /** @param {number} n @param {string} why @returns {never} */
  const bad = (n, why) =>
    die(`台帳 ${ledger} の ${n} 行目が読めません（${why}）。1 枚も作っていません。台帳を手で直さず、講師に知らせてください`);
  lines.forEach((line, idx) => {
    const n = idx + 1;
    if (!line.trim()) return;
    if (idx === 0) {
      if (line !== LEDGER_COLUMNS.join("\t")) bad(n, "1 行目が列名ではありません");
      return;
    }
    const c = line.split("\t");
    if (c.length !== LEDGER_COLUMNS.length) bad(n, `列の数が ${c.length} です`);
    const [time, name, event, size, quality, sec, tokens, yenS, note] = c;
    if (!Number.isFinite(Date.parse(time)) || !/^\d{4}-\d\d-\d\dT/.test(time)) bad(n, "time が日時ではありません");
    if (!/^[A-Za-z0-9._-]+$/.test(name)) bad(n, "name が不正です");
    if (!EVENTS.has(event)) bad(n, `event「${event}」は使えません`);
    const yenEmpty = yenS === "";
    const yen = Number(yenS);
    if (!yenEmpty && (!Number.isFinite(yen) || yen < 0 || yen > MAX_ROW_YEN)) bad(n, `yen「${yenS}」が範囲外です`);
    if (yenEmpty && event !== "err") bad(n, `${event} の行に yen がありません`);
    rows.push({ time, name, event, size, quality, sec, tokens, yen: yenEmpty ? 0 : yen, note });
  });
  return rows;
}
/** @param {LedgerRow[]} rows @returns {Map<string, LedgerRow>} */
function lastByName(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.name, r);
  return m;
}
/**
 * 使った額 = ok と reconciled の yen の合計 + まだ pending のままの素材の見積額（安全側）
 * @param {LedgerRow[]} rows
 */
function spentYen(rows) {
  let s = 0;
  for (const r of rows) if (r.event === "ok" || r.event === "reconciled") s += r.yen;
  for (const r of lastByName(rows).values()) if (r.event === "pending") s += r.yen;
  return s;
}
/** @param {unknown} s */
const cell = (s) => redact(String(s ?? ""), [KEY]).replace(/[\t\r\n]+/g, " ").slice(0, 240);
/**
 * @param {{ name: string, event: "pending" | "ok" | "err" | "reconciled", size: string, sec?: number | string, tokens?: number | string, yen?: number, note?: string }} r
 */
function appendLedger(r) {
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  if (!fs.existsSync(ledger) || fs.statSync(ledger).size === 0) fs.appendFileSync(ledger, LEDGER_COLUMNS.join("\t") + "\n");
  const row = [new Date().toISOString(), r.name, r.event, r.size, QUALITY, r.sec ?? "", r.tokens ?? "", r.yen === undefined ? "" : round2(r.yen), r.note ?? ""];
  fs.appendFileSync(ledger, row.map(cell).join("\t") + "\n");
}

/** @param {Job} j */
const nameOf = (j) => j.name + suffix;
/** @param {Job} j */
function outOf(j) {
  // --suffix を付けたときは out にも付ける（元の画像を上書きしないため）
  const p = j.out ? j.out.replace(/(\.[a-z]+)?$/i, `${suffix}$1`) : path.join(rawDir, `${nameOf(j)}.png`);
  return resolveInside(base, p, `${j.name} の書き出し先`);
}
// 送る前に、全ジョブの書き出し先とプロンプトの保存先を確かめる（1 つでも外を指していれば 1 枚も作らない）
for (const j of jobs) {
  outOf(j);
  resolveInside(base, path.join(promptDir, `${nameOf(j)}.txt`), `${j.name} のプロンプトの保存先`);
}

// ---- 二重起動の防止（同じ台帳を 2 つの gen.mjs が使わない）----
const lockFile = path.join(path.dirname(ledger), "image-ledger.lock");
/** @param {number} pid */
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return /** @type {NodeJS.ErrnoException} */ (e).code === "EPERM";
  }
}
function takeLock() {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockFile, "wx"); // 既にあれば失敗する（排他）
      fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      fs.closeSync(fd);
      process.on("exit", () => {
        try {
          if (fs.readFileSync(lockFile, "utf8").split(/\r?\n/)[0] === String(process.pid)) fs.rmSync(lockFile, { force: true });
        } catch {
          // 消せなくても次回は「古いロック」として扱える
        }
      });
      return;
    } catch (e) {
      if (/** @type {NodeJS.ErrnoException} */ (e).code !== "EEXIST") throw e;
      let text = "";
      let ageMs = Infinity;
      try {
        text = fs.readFileSync(lockFile, "utf8");
        ageMs = Date.now() - fs.statSync(lockFile).mtimeMs;
      } catch {
        continue; // 読む前に消えた
      }
      const pid = Number(text.split(/\r?\n/)[0]);
      const valid = Number.isInteger(pid) && pid > 0;
      // 作られた直後で PID がまだ書かれていないロックも「使用中」とみなす
      if ((valid && pidAlive(pid)) || (!valid && ageMs < 5000)) {
        die(`別の gen.mjs が同じ台帳を使っています（${valid ? `PID ${pid}` : "起動中"}）。終わるのを待ってから、もう一度実行してください`);
      }
      fs.rmSync(lockFile, { force: true });
      log(`古いロックを消しました（${valid ? `PID ${pid} はもう動いていません` : "中身が読めないロック"}）`);
    }
  }
  die(`ロックを作れません: ${lockFile}`);
}
if (!dryRun) takeLock();

// ---- 再開の判定（§ 状態表）----
const rows0 = readLedger();
const last0 = lastByName(rows0);
/** @type {Job[]} */ const toRun = [];
/** @type {string[]} */ const done = [];
/** @type {string[]} */ const unknown = [];
/** @type {string[]} */ const reconcile = [];
for (const j of jobs) {
  const name = nameOf(j);
  const last = last0.get(name);
  if (onlySet) {
    toRun.push(j);
  } else if (!last || last.event === "err") {
    toRun.push(j);
  } else if (last.event === "ok" || last.event === "reconciled") {
    done.push(name);
  } else if (last.event === "pending") {
    const out = outOf(j);
    const t = Date.parse(last.time);
    if (fs.existsSync(out) && Number.isFinite(t) && fs.statSync(out).mtimeMs >= t - MTIME_SLACK_MS) reconcile.push(name);
    else unknown.push(name);
  } else {
    unknown.push(name);
  }
}
if (!dryRun) {
  for (const name of reconcile) {
    const p = /** @type {LedgerRow} */ (last0.get(name));
    appendLedger({ name, event: "reconciled", size: p.size, yen: p.yen, note: "再開時にファイルを確認（保存済み）" });
  }
}

// ---- 見積もりの表（人が読んで承認するためのもの。Markdown の表で出す）----
/** @type {Map<string, { kind: string, size: string, n: number, unit: number, measured: boolean }>} */
const groups = new Map();
let exactSum = 0;
let safeSum = 0;
for (const j of toRun) {
  const e = estimateYen(j);
  exactSum += e.exact;
  safeSum += e.safe;
  const key = `${kindOf(j)}|${j.size}`;
  const g = groups.get(key) ?? { kind: kindOf(j), size: j.size, n: 0, unit: e.exact, measured: e.measured };
  g.n++;
  groups.set(key, g);
}
// reconciled は pending と同じ額で載るので、dry-run（追記しない）でも累計は変わらない
const before = dryRun ? spentYen(rows0) : spentYen(readLedger());
const withRetry = safeSum * (1 + retryRate);
if (done.length) log(`作成済みのため飛ばす: ${done.length} 件`);
if (reconcile.length) log(`保存済みを確認して ok 扱い（呼ばない）: ${reconcile.join(", ")}`);
for (const name of unknown) log(`状態不明: ${name}。Usage 画面で課金を確かめ、無ければ --only ${name} で作り直してください`);
if (!toRun.length) {
  log(`作るものはありません（累計 ${before.toFixed(1)} 円 / 上限 ${budget} 円 / 台帳 ${ledger}）`);
  process.exit(unknown.length ? 1 : 0);
}
log("| 種類 | サイズ | quality | 枚数 | 1枚あたり | 小計 |");
log("|---|---|---|---|---|---|");
for (const g of [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind))) {
  const mark = g.measured ? "" : "（推定）";
  log(`| ${g.kind} | ${g.size} | ${QUALITY} | ${g.n} | 約 ${g.unit.toFixed(2)} 円${mark} | 約 ${(g.unit * g.n).toFixed(1)} 円 |`);
}
log(`| 合計 | | | ${toRun.length} | | 約 ${exactSum.toFixed(0)} 円 |`);
log("");
log(`- 料金表どおりの見積もり: 約 ${exactSum.toFixed(1)} 円（1 ドル = ${jpyPerUsd} 円）`);
log(`- 安全側（入力も出力単価で数える）: 約 ${safeSum.toFixed(1)} 円`);
log(`- 作り直し ${Math.round(retryRate * 100)}% を見込んだ目安: 約 ${withRetry.toFixed(0)} 円`);
log(`- 送る直前に 1 枚ずつ確保する額（予約額・最大）: 1 枚 約 ${Math.max(...toRun.map(reserveYen)).toFixed(1)} 円まで。累計 + 予約額が上限を超える 1 枚は送りません`);
log(`- これまでの累計（台帳）: ${before.toFixed(1)} 円 / 上限 ${budget} 円`);
if (before + safeSum > budget) {
  die(`上限を超える見積もりです（累計 + 安全側 = ${(before + safeSum).toFixed(1)} 円 > ${budget} 円）。1 枚も作っていません。素材の数を減らしてください`);
}
if (before + withRetry > budget) log(`注意: 作り直しを見込むと上限（${budget} 円）を超えるおそれがあります`);
if (dryRun) process.exit(0);

// ---- 呼び出し（本物 or テストモード）----
let callNo = 0;
// テストモードの画像（32x32・白地の真ん中に黒い四角。透過の処理も通る）
const FAKE_PNG = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR42mP4T2PAMGrBqAVD2AIGEsGoBaMWjFowasGoBcPTgtEqc9SCEWQBAKuE93k7oq+mAAAAAElFTkSuQmCC";

/**
 * テストモードの待ち。止める合図（signal）が来たら、本物の fetch と同じく AbortError で終わる
 * @param {number} ms @param {AbortSignal} signal
 */
function fakeWait(ms, signal) {
  return new Promise((ok, ng) => {
    const abortErr = () => ng(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
    if (signal.aborted) return abortErr();
    const t = setTimeout(ok, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      abortErr();
    }, { once: true });
  });
}

/**
 * テストモードの返事。n は何回目の呼び出しか（1 始まり）。
 * @param {string} scenario
 * @param {number} n
 * @param {string} size
 * @param {AbortSignal} signal
 * @returns {Promise<Response>}
 */
async function fakeResponse(scenario, n, size, signal) {
  if (scenario === "kill-before-send" && n === 2) process.kill(process.pid, "SIGKILL");
  // 送る前に失敗したと確実に分かる例（接続の拒否）
  if (scenario === "conn-refused" && n === 2) throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" }) });
  let delay = Number(process.env.COMP_TO_LP_FAKE_DELAY_MS ?? 30);
  // 401-parallel: 4 並列のうち 1 つだけがすぐ 401 を返し、残りは長くかかる（止める合図で打ち切られるはず）
  if (scenario === "401-parallel" && n > 2) delay = 5000;
  if (scenario === "401-parallel" && n === 2) delay = 50;
  await fakeWait(delay, signal);
  // 送ったあとで結果が分からなくなる例（タイムアウト）
  if (scenario === "timeout" && n === 2) throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  /** @type {Record<string, string>} */
  let h = { "x-ratelimit-limit-requests": "5", "x-ratelimit-remaining-requests": "4" };
  if (scenario === "limit50" || scenario === "429-multi" || scenario === "401-parallel") h = { "x-ratelimit-limit-requests": "50", "x-ratelimit-remaining-requests": "49" };
  if (scenario === "noheader" || scenario === "noheader-429") h = {};
  if (scenario === "remaining1") h = { "x-ratelimit-limit-requests": "50", "x-ratelimit-remaining-requests": "1" };
  if (scenario === "inconsistent") h = { "x-ratelimit-limit-requests": "5", "x-ratelimit-remaining-requests": "50" };
  /** @param {number} status @param {unknown} body @param {Record<string, string>} [extra] */
  const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...h, ...extra } });
  if (scenario === "429-retry-after" && n === 2) return json(429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, { "retry-after": "2" });
  if (scenario === "429-noheader" && n === 2) return json(429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } });
  if (scenario === "noheader-429" && n === 3) return json(429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, { "retry-after": "1" });
  if (scenario === "429-multi" && (n === 2 || n === 3)) return json(429, { error: { message: "Rate limit reached", code: "rate_limit_exceeded" } }, { "retry-after": "1" });
  if (scenario === "quota" && n === 2) return json(429, { error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } });
  // 本物の OpenAI も、401 の本文に送った鍵の一部を入れて返す。伏せ字の確認のため、ここではわざと鍵をそのまま入れる
  const msg401 = { error: { message: `Incorrect API key provided: ${KEY || "sk-fake"}`, code: "invalid_api_key" } };
  if (scenario === "401") return json(401, msg401);
  if (scenario === "401-parallel" && n === 2) return json(401, msg401);
  if (scenario === "403") return json(403, { error: { message: "Your organization must be verified to use this model", code: "organization_not_verified" } });
  if (scenario === "err3") return json(500, { error: { message: "The server had an error while processing your request", code: "server_error" } });
  if (scenario === "bad-request3") return json(400, { error: { message: "Invalid value for 'size'", code: "invalid_value" } });
  if (scenario === "bad-json" && n === 2) return new Response("{not json", { status: 200, headers: h });
  if (scenario === "no-image" && n === 2) return json(200, { created: 0, data: [] });
  const o = OUT_TOKENS[size] ?? 439;
  // overcost: 2 枚目の実費が予約額を大きく超える
  const outTok = scenario === "overcost" && n === 2 ? 20000 : o;
  return json(200, { created: 0, data: [{ b64_json: FAKE_PNG }], usage: { input_tokens: 120, output_tokens: outTok, total_tokens: 120 + outTok } });
}

/**
 * @param {Job} j
 * @returns {Promise<Response>}
 */
function callApi(j) {
  callNo++;
  // 止める合図（全体）と 1 枚あたりのタイムアウト（300 秒）の、どちらかで打ち切る
  const signal = AbortSignal.any([abortAll.signal, AbortSignal.timeout(300_000)]);
  if (FAKE) return fakeResponse(FAKE, callNo, j.size, signal);
  return fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: j.prompt, size: j.size, quality: QUALITY, n: 1 }),
    signal,
  });
}
/** テストモードで「この段階で強制終了」を再現する @param {string} stage @param {number} n */
function fakeKill(stage, n) {
  if (FAKE === `kill-${stage}` && n === 2) process.kill(process.pid, "SIGKILL");
}

/**
 * 送る前に失敗したと確実に分かる通信エラーか（このときだけ err にしてよい）。
 * 名前解決の失敗・接続の拒否・接続のタイムアウト・到達できない、は要求を送る前の段階で起きる
 * @param {unknown} e
 */
function failedBeforeSend(e) {
  const PRE = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);
  /** @type {any} */
  let cur = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur.code === "string" && PRE.has(cur.code)) return true;
    cur = cur.cause;
  }
  return false;
}
/** @param {unknown} e */
function errText(e) {
  if (!(e instanceof Error)) return String(e);
  const c = /** @type {any} */ (e).cause;
  return `${e.name}: ${e.message}${c instanceof Error ? ` (${c.message})` : ""}`;
}

// ---- 並列数（R4）と 429（R5）----
let par = 1;
let parDecided = false;
let pauseUntil = 0;
/** @type {{ reason: string, advice: string } | null} */
let stopInfo = null;
let errStreak = 0;
const counts = { ok: 0, err: 0, skip: 0, unknown: 0 };
const ADVICE_KEY = "OpenAI の残高（Billing）か鍵を確認してください";

/** @param {Headers} headers */
function decidePar(headers) {
  parDecided = true;
  if (verbose) {
    // 値は出さない（名前だけ）。上限ヘッダの実名を確かめるため
    const names = [...headers.keys()].sort();
    log(`受け取ったヘッダの名前（${names.length} 個）: ${names.join(", ") || "なし"}`);
  }
  const ls = headers.get("x-ratelimit-limit-requests");
  const rs = headers.get("x-ratelimit-remaining-requests");
  const L = ls !== null && /^\d+$/.test(ls.trim()) ? Number(ls) : NaN;
  const R = rs !== null && /^\d+$/.test(rs.trim()) ? Number(rs) : NaN;
  if (Number.isFinite(L) && Number.isFinite(R) && R > L) {
    par = 1;
    log(`並列数: 1（上限ヘッダが食い違うため。L=${ls} R=${rs}）`);
    return;
  }
  if (!Number.isFinite(L) || L <= 0) {
    // 画像 API の返事には上限ヘッダが付かないことがある。2 枚から始め、429 が来たら 1 に下げてそのまま続ける
    par = Number.isFinite(R) ? Math.max(1, Math.min(UNKNOWN_LIMIT_PAR, R)) : UNKNOWN_LIMIT_PAR;
    log(`並列数: ${par}（上限ヘッダが無いので ${UNKNOWN_LIMIT_PAR} 枚から始めます。混んでいれば 429 で 1 に下げます。L=${ls ?? "なし"} R=${rs ?? "なし"}）`);
    return;
  }
  if (!Number.isFinite(R)) {
    par = Math.min(MAX_PAR, Math.max(1, Math.floor((L / 60) * 15)), UNKNOWN_LIMIT_PAR);
    log(`並列数: ${par}（残りの数が読めないので最大 ${UNKNOWN_LIMIT_PAR}。L=${L} R=なし）`);
    return;
  }
  par = Math.min(MAX_PAR, Math.max(1, Math.floor((L / 60) * 15)));
  if (R < par) par = Math.max(1, R);
  log(`並列数: ${par}（上限ヘッダ L=${L} R=${R}）`);
}
/** @param {string | null} v @returns {number | null} 秒 */
function retryAfterSec(v) {
  if (v === null) return null;
  const s = v.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.max(0, Number(s));
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.max(0, (t - Date.now()) / 1000) : null;
}
/** @param {number} sec */
function waitMs(sec) {
  const w = process.env.COMP_TO_LP_FAKE_WAIT_MS;
  if (FAKE && w !== undefined && Number.isFinite(Number(w))) return Number(w);
  return sec * 1000;
}
/** @param {Response} res @returns {Promise<{ code: string, message: string }>} */
async function errorInfo(res) {
  const text = await res.text().catch(() => "");
  try {
    const e = JSON.parse(text)?.error ?? {};
    return { code: String(e.code ?? e.type ?? ""), message: String(e.message ?? "") };
  } catch {
    return { code: "", message: text.slice(0, 200) };
  }
}
/**
 * 全体を止める。送信中のリクエストも打ち切る（打ち切ったものは状態不明になる）
 * @param {string} reason @param {string} [advice]
 */
function stopAll(reason, advice = ADVICE_KEY) {
  if (stopInfo) return;
  stopInfo = { reason, advice };
  abortAll.abort();
}
function noteFailure() {
  errStreak++;
  if (errStreak >= FATAL_ERR_STREAK) stopAll(`失敗が ${FATAL_ERR_STREAK} 回続きました`);
}
/** @param {string} name @param {string} why */
function markUnknown(name, why) {
  // 台帳には何も足さない（最後の行が pending のまま = 状態不明）。課金されたか分からないので自動では送り直さない
  counts.unknown++;
  log(`状態不明: ${name}（${why}）。課金されたか分かりません。Usage 画面で確かめ、無ければ --only ${name} で作り直してください`);
}

/**
 * @typedef {{ j: Job, name: string, out: string, n429: number }} Task
 * @param {Task} task
 * @param {Task[]} queue
 */
async function runOne(task, queue) {
  const { j, name, out } = task;
  if (stopInfo) return;
  // プロンプトに鍵らしい文字列があれば、保存も送信もしない
  if (hasKeyLike(j.prompt, [KEY])) {
    appendLedger({ name, event: "err", size: j.size, note: "プロンプトに鍵らしい文字列があるため送りませんでした" });
    counts.err++;
    log(`ERR ${name} プロンプトに鍵らしい文字列（sk- で始まる長い文字列）があります。送っていません。jobs.json の prompt から消してください`);
    return;
  }
  const reserve = reserveYen(j);
  // 読み取り → 判定 → pending の追記の間に await を挟まない（並列のジョブが割り込まない）
  if (spentYen(readLedger()) + reserve > budget) {
    counts.skip++;
    log(`SKIP ${name}: 上限（${budget} 円）に届くため呼びません（この 1 枚の予約額 ${round2(reserve)} 円）`);
    return;
  }
  appendLedger({ name, event: "pending", size: j.size, yen: reserve, note: "送信前（yen はこの 1 枚の予約額）" });
  await fsp.mkdir(promptDir, { recursive: true });
  await fsp.writeFile(path.join(promptDir, `${name}.txt`), j.prompt, "utf8");
  const t0 = Date.now();
  const sec = () => ((Date.now() - t0) / 1000).toFixed(0);
  /** @type {Response} */
  let res;
  const n = callNo + 1;
  try {
    res = await callApi(j);
  } catch (e) {
    if (failedBeforeSend(e)) {
      appendLedger({ name, event: "err", size: j.size, sec: sec(), note: `送る前の通信エラー: ${errText(e)}` });
      counts.err++;
      log(`ERR ${name} 送る前の通信エラー（課金なし）: ${errText(e)}`);
    } else {
      markUnknown(name, stopInfo ? "止めたときに送信中だったので打ち切りました" : `通信が途中で切れました: ${errText(e)}`);
    }
    noteFailure();
    return;
  }
  if (!parDecided) decidePar(res.headers);

  if (res.status === 429) {
    const info = await errorInfo(res);
    if (info.code === "insufficient_quota") {
      appendLedger({ name, event: "err", size: j.size, sec: sec(), note: `HTTP 429 insufficient_quota: ${info.message}` });
      log(`ERR ${name} 残高が足りません（insufficient_quota）`);
      counts.err++;
      stopAll("OpenAI の残高が足りません（insufficient_quota）");
      return;
    }
    const ra = retryAfterSec(res.headers.get("retry-after"));
    const waitSec = ra ?? DEFAULT_WAIT_SEC;
    const now = Date.now();
    if (now >= pauseUntil) {
      const old = par;
      par = Math.max(1, par - 1);
      log(`429: 並列数を ${old} → ${par} に下げます（${ra === null ? `Retry-After が無いので ${DEFAULT_WAIT_SEC}` : waitSec} 秒待ってから再開）`);
    }
    pauseUntil = Math.max(pauseUntil, now + waitMs(waitSec));
    task.n429++;
    if (task.n429 >= 2) {
      appendLedger({ name, event: "err", size: j.size, sec: sec(), note: "HTTP 429 が 2 回続いたので作りませんでした" });
      log(`ERR ${name} 429 が 2 回続いたので、この素材はあとで作り直してください`);
      counts.err++;
      noteFailure();
    } else {
      appendLedger({ name, event: "err", size: j.size, sec: sec(), note: "HTTP 429（最後に回してもう一度送ります）" });
      queue.push(task);
      log(`429 ${name}: 最後に回します`);
    }
    return;
  }
  if (res.status === 401 || res.status === 403) {
    const info = await errorInfo(res);
    appendLedger({ name, event: "err", size: j.size, sec: sec(), note: `HTTP ${res.status} ${info.code}: ${info.message}` });
    log(`ERR ${name} HTTP ${res.status} ${info.code}: ${redact(info.message, [KEY]).slice(0, 160)}`);
    counts.err++;
    stopAll(res.status === 401 ? "鍵が無効です（HTTP 401）" : "この鍵ではまだ使えません（HTTP 403。本人確認の反映待ちの可能性）");
    return;
  }
  if (res.status >= 500) {
    // サーバー側の失敗（5xx）は、画像が作られて課金されたかどうか分からないので状態不明にする（自動で送り直さない）
    const info = await errorInfo(res);
    markUnknown(name, `HTTP ${res.status} ${info.code}: ${redact(info.message, [KEY]).slice(0, 120)}`);
    noteFailure();
    return;
  }
  if (!res.ok) {
    // 4xx（429・401・403 以外）は、OpenAI が受け付けなかった = 画像は作られていない（課金なし）ので err にする
    const info = await errorInfo(res);
    appendLedger({ name, event: "err", size: j.size, sec: sec(), note: `HTTP ${res.status} ${info.code}: ${info.message}` });
    log(`ERR ${name} HTTP ${res.status} ${info.code}: ${redact(info.message, [KEY]).slice(0, 160)}`);
    counts.err++;
    noteFailure();
    return;
  }
  /** @type {any} */
  let body;
  try {
    body = await res.json();
  } catch (e) {
    // 200 の返事が途中で切れた・読めない = 画像は作られて課金されたかもしれない
    markUnknown(name, stopInfo ? "止めたときに返事を受け取り中だったので打ち切りました" : `返事を最後まで読めません: ${errText(e)}`);
    noteFailure();
    return;
  }
  const b64 = body?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || !b64) {
    markUnknown(name, "200 の返事に画像がありませんでした");
    noteFailure();
    return;
  }
  fakeKill("after-response", n);
  const u = body.usage ?? {};
  const inTok = Number(u.input_tokens);
  const outTok = Number(u.output_tokens);
  const total = Number(u.total_tokens);
  // 使用量の内訳が取れなければ、予約額で台帳に載せる
  const yen = Number.isFinite(inTok) && Number.isFinite(outTok) && inTok >= 0 && outTok >= 0 ? (outTok * USD_OUT + inTok * USD_IN) * jpyPerUsd : reserve;
  // 途中で止まっても壊れたファイルを「保存済み」と誤判定しないよう、一時ファイルに書いてから名前を変える
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const tmp = `${out}.part`;
  await fsp.writeFile(tmp, Buffer.from(b64, "base64"));
  await fsp.rename(tmp, out);
  fakeKill("after-save", n);
  appendLedger({ name, event: "ok", size: j.size, sec: sec(), tokens: Number.isFinite(total) ? total : "", yen, note: path.relative(base, out) });
  counts.ok++;
  errStreak = 0;
  log(`OK  ${name} ${sec()}s ${Number.isFinite(total) ? total : "?"}tok ${round2(yen)}円 → ${path.relative(base, out)}`);
  if (yen > reserve) {
    stopAll(
      `${name} の実費 ${round2(yen)} 円が予約額 ${round2(reserve)} 円を超えました`,
      "料金が想定より高くなっています。台帳と OpenAI の Usage 画面で金額を確かめ、講師に知らせてください",
    );
  } else if (spentYen(readLedger()) > budget) {
    stopAll(`累計が上限（${budget} 円）を超えました`, "台帳と OpenAI の Usage 画面で金額を確かめ、講師に知らせてください");
  }
}

/** @type {Task[]} */
const queue = toRun.map((j) => ({ j, name: nameOf(j), out: outOf(j), n429: 0 }));
/** @type {Set<Promise<void>>} */
const running = new Set();
log(`生成を始めます（${queue.length} 件・1 枚目は 1 枚だけで送り、返事を見て並列数を決めます）`);
while (true) {
  if (stopInfo) {
    await Promise.all(running);
    break;
  }
  const limit = parDecided ? par : 1;
  const wait = pauseUntil - Date.now();
  if (queue.length && running.size < limit && wait <= 0) {
    const task = /** @type {Task} */ (queue.shift());
    const p = runOne(task, queue).finally(() => running.delete(p));
    running.add(p);
    continue;
  }
  if (!queue.length && !running.size) break;
  /** @type {Promise<unknown>[]} */
  const waiters = [...running];
  if (queue.length && wait > 0) waiters.push(sleep(wait));
  await Promise.race(waiters);
}

const after = spentYen(readLedger());
if (stopInfo) {
  log("");
  log(`止めました: ${stopInfo.reason}。${stopInfo.advice}。残り ${queue.length} 件は呼んでいません`);
}
log(`今回 ${(after - before).toFixed(1)} 円 / 累計 ${after.toFixed(1)} 円 / 上限 ${budget} 円 / できた ${counts.ok} 件・失敗 ${counts.err} 件・状態不明 ${counts.unknown} 件・上限で飛ばした ${counts.skip} 件 / 台帳 ${ledger}`);
process.exit(stopInfo || counts.err || counts.skip || counts.unknown || unknown.length ? 1 : 0);
