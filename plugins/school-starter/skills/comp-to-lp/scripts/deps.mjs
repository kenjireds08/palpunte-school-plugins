#!/usr/bin/env node
/**
 * 必要な道具がそろっているかを 1 回で確かめ、足りない物だけ導入コマンドを出す（自分では何もインストールしない）。
 *
 * usage（作業フォルダ image-studio を開いた状態で実行する）:
 *   node --env-file=.env.local <道具のフォルダ>/deps.mjs [--expect-version 1.28.0 | --expect-version-from <plugin.json>] [--skip-key-check]
 *
 * 確かめること:
 *   Node（20.6 以上）/ 鍵の形（値は出さない）/ 鍵の生存（GET /v1/models）/ 鍵の防壁の確認ファイル .env.probe を作る /
 *   playwright@1.61.1 / chromium / .gitignore の node_modules/ / 作業フォルダ lp/ / 道具の版（VERSION があるとき）
 * 終了コード: 0 = NG なし / 1 = NG あり（表の「次にやること」を上から 1 つずつ実行する）
 *
 * テストモード: COMP_TO_LP_FAKE=ok|401|403|err3 で /v1/models の返事を 200 / 401 / 403 / 500 に差し替える（通信しない）
 */
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { parseArgs, redact, installRedactingCrashHandler, keyShape, KEY_SHAPE_MESSAGE, SCRIPTS_DIR, versionAtLeast } from "./lib.mjs";

const PLAYWRIGHT_VERSION = "1.61.1";
const NODE_MIN = [20, 6, 0];
const MODELS_URL = "https://api.openai.com/v1/models";
const KEY = process.env.OPENAI_API_KEY ?? "";
const FAKE = process.env.COMP_TO_LP_FAKE ?? "";
installRedactingCrashHandler([KEY]);
/** @param {...unknown} a */
const log = (...a) => console.log(redact(a.join(" "), [KEY]));

const { opts, rest } = parseArgs(process.argv.slice(2));
const ALLOWED = new Set(["expect-version", "expect-version-from", "skip-key-check"]);
for (const k of Object.keys(opts)) {
  if (!ALLOWED.has(k)) {
    console.error(`--${k} という オプションはありません（使えるのは --expect-version --expect-version-from --skip-key-check）`);
    process.exit(2);
  }
}
if (rest.length) {
  console.error(`余分な引数があります: ${rest.join(" ")}`);
  process.exit(2);
}
const cwd = process.cwd();
const isWin = process.platform === "win32";

/** @typedef {{ item: string, ok: boolean | null, result: string, next?: string }} Row */
/** @type {Row[]} */
const rows = [];
/** @param {Row} r */
const add = (r) => rows.push(r);

// 1) Node
// テストモードでは版を差し替えて、古い Node の案内を確かめられるようにする
const nodeVersion = FAKE && process.env.COMP_TO_LP_FAKE_NODE_VERSION ? process.env.COMP_TO_LP_FAKE_NODE_VERSION : process.versions.node;
const nodeOk = versionAtLeast(nodeVersion, NODE_MIN);
add({
  item: "Node",
  ok: nodeOk,
  result: `v${nodeVersion}（20.6 以上が必要）`,
  next: nodeOk
    ? undefined
    : `Claude に「Node.js を LTS 版に更新する手順を、このパソコンの OS に合わせて教えてください」と頼む（${isWin ? "Windows: nodejs.org の LTS 版インストーラ（.msi）" : "Mac: nodejs.org の LTS 版インストーラ（.pkg）"}）。更新したら Claude のアプリを完全に終了して開き直す`,
});

// 2) 鍵の形・生存
const shape = keyShape(KEY);
add({ item: "鍵の形", ok: shape === "ok", result: shape === "ok" ? "OPENAI_API_KEY あり（sk- で始まる。値は表示しません）" : "NG", next: shape === "ok" ? undefined : KEY_SHAPE_MESSAGE[shape] });

if (opts["skip-key-check"]) {
  add({ item: "鍵の生存", ok: null, result: "確かめていません（--skip-key-check）" });
} else if (shape !== "ok") {
  add({ item: "鍵の生存", ok: false, result: "鍵の形が NG のため確かめていません", next: "上の「鍵の形」を先に直す" });
} else {
  /** @type {{ status: number, text: string } | { error: string }} */
  let r;
  try {
    if (FAKE) {
      const status = FAKE === "401" ? 401 : FAKE === "403" ? 403 : FAKE === "err3" ? 500 : 200;
      // 本物の OpenAI も 401 の本文に鍵の一部を入れて返す。伏せ字の確認のため、わざと鍵をそのまま入れる
      const text = status === 401 ? JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}`, code: "invalid_api_key" } }) : status === 500 ? `{"error":{"message":"server error ${KEY}"}}` : '{"data":[]}';
      r = { status, text };
    } else if (typeof fetch !== "function") {
      r = { error: "この Node には fetch がありません（Node を更新してください）" };
    } else {
      const res = await fetch(MODELS_URL, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20_000) });
      r = { status: res.status, text: await res.text().catch(() => "") };
    }
  } catch (e) {
    r = { error: `OpenAI に繋がりません（${e instanceof Error ? e.message : String(e)}）。ネットワークを確かめてもう一度実行する` };
  }
  if ("error" in r) add({ item: "鍵の生存", ok: false, result: "NG", next: r.error });
  else if (r.status === 200) add({ item: "鍵の生存", ok: true, result: "OK（GET /v1/models が 200）" });
  else if (r.status === 401) add({ item: "鍵の生存", ok: false, result: "HTTP 401", next: "鍵が無効です。OpenAI の画面で新しい鍵を作り、補講2 シートの STEP 1 の手順で保存し直す" });
  else if (r.status === 403) add({ item: "鍵の生存", ok: false, result: "HTTP 403", next: "本人確認（Verify Organization）の反映待ちの可能性があります。少し待ってからもう一度実行する" });
  else add({ item: "鍵の生存", ok: false, result: `HTTP ${r.status}: ${redact(r.text, [KEY]).replace(/\s+/g, " ").slice(0, 120)}`, next: "少し待ってからもう一度実行する。続くときは講師に知らせる" });
}

// 3) 鍵の防壁の確認ファイル（作業フォルダの直下。中身は PROBE=ok の 1 行だけで、鍵ではない）
// 作業フォルダが image-studio でなければ、ファイルもフォルダも作らない（違う場所に散らかさないため）
const inStudio = path.basename(cwd) === "image-studio";
if (!inStudio) {
  add({
    item: "作業フォルダ",
    ok: false,
    result: `今のフォルダは ${cwd} です`,
    next: "Code タブで選んだフォルダが image-studio ではありません。作業フォルダを image-studio に選び直して、もう一度実行する",
  });
}
const probe = path.join(cwd, ".env.probe");
if (inStudio) try {
  fs.writeFileSync(probe, "PROBE=ok\n");
  add({
    item: "鍵の防壁",
    ok: null,
    result: `確認ファイルを作りました: ${probe}`,
    next: "Claude が Read で .env.probe を読む → 拒否、Bash で cat .env.probe → 拒否、の両方を確かめる。1 つでも読めたら鍵を使う工程に進まず講師に知らせる",
  });
} catch (e) {
  add({ item: "鍵の防壁", ok: false, result: `確認ファイルを作れません（${e instanceof Error ? e.message : String(e)}）`, next: "作業フォルダ（image-studio）を開いているか確かめる" });
}

// 4) package.json / playwright / chromium
// 作業フォルダに package.json が無いと、npm i は上のフォルダ（ホームなど）の package.json に入れてしまう。
// そのため先に npm init -y を案内し、playwright は「作業フォルダの node_modules にあるもの」だけを数える
const hasPkg = fs.existsSync(path.join(cwd, "package.json"));
if (!hasPkg) {
  add({
    item: "package.json",
    ok: false,
    result: "作業フォルダにありません",
    next: "npm init -y（先にこれを実行する。無いまま次の npm i を実行すると、上のフォルダに入ってしまう）",
  });
} else {
  add({ item: "package.json", ok: true, result: "あります" });
}
/** @type {any} */
let pw = null;
let pwVersion = "";
const localPw = path.join(cwd, "node_modules", "playwright", "package.json");
if (hasPkg && fs.existsSync(localPw)) {
  try {
    const req = createRequire(path.join(cwd, "package.json"));
    pwVersion = JSON.parse(fs.readFileSync(localPw, "utf8")).version ?? "";
    const mod = await import(pathToFileURL(req.resolve("playwright")).href);
    pw = mod.default ?? mod;
  } catch {
    pw = null;
  }
}
if (!pw) {
  add({
    item: "playwright",
    ok: false,
    result: "作業フォルダに入っていません",
    next: hasPkg ? `npm i -D playwright@${PLAYWRIGHT_VERSION}` : `npm i -D playwright@${PLAYWRIGHT_VERSION}（上の npm init -y が終わってから、別に実行する）`,
  });
} else if (pwVersion !== PLAYWRIGHT_VERSION) {
  add({ item: "playwright", ok: false, result: `${pwVersion || "版が不明"}（${PLAYWRIGHT_VERSION} が必要）`, next: `npm i -D playwright@${PLAYWRIGHT_VERSION}` });
} else {
  add({ item: "playwright", ok: true, result: `${pwVersion}（作業フォルダの node_modules）` });
}
if (!pw) {
  add({ item: "chromium", ok: false, result: "playwright を入れてから確かめます", next: "playwright を入れたら、もう一度この道具を実行する" });
} else {
  /** @type {string} */
  let exe = "";
  try {
    exe = pw.chromium.executablePath();
  } catch {
    exe = "";
  }
  if (exe && fs.existsSync(exe)) add({ item: "chromium", ok: true, result: "入っています" });
  else add({ item: "chromium", ok: false, result: "入っていません", next: "npx playwright install chromium（約 350MB・2〜5 分。失敗したら同じコマンドをもう一度、それでもだめなら npx playwright install --force chromium）" });
}

// 5) .gitignore
const gi = path.join(cwd, ".gitignore");
const giText = fs.existsSync(gi) ? fs.readFileSync(gi, "utf8") : "";
const giOk = giText.split(/\r?\n/).some((l) => /^\/?node_modules\/?\s*$/.test(l.trim()));
add({
  item: ".gitignore",
  ok: giOk,
  result: giOk ? "node_modules/ が入っています" : fs.existsSync(gi) ? "node_modules/ がありません" : ".gitignore がありません",
  next: giOk ? undefined : ".gitignore に node_modules/ の 1 行を足す（GitHub に 350MB の部品を上げないため）",
});

// 6) 作業フォルダ lp/
const lp = path.join(cwd, "lp");
if (inStudio) try {
  const existed = fs.existsSync(lp);
  fs.mkdirSync(lp, { recursive: true });
  add({ item: "作業フォルダ", ok: true, result: existed ? `${lp} があります` : `${lp} を作りました` });
} catch (e) {
  add({ item: "作業フォルダ", ok: false, result: `lp/ を作れません（${e instanceof Error ? e.message : String(e)}）`, next: "image-studio を開いているか確かめる" });
}

// 7) 道具の版
//   今の版: zip で配った道具は同じフォルダの VERSION、プラグインの道具はプラグインの plugin.json の version
//   必要な版: --expect-version <版> か、--expect-version-from <plugin.json のパス>
/** @param {string} file @returns {string | null} */
const readJsonVersion = (file) => {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")).version;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
};
const verFile = path.join(SCRIPTS_DIR, "VERSION");
const pluginJson = path.resolve(SCRIPTS_DIR, "..", "..", "..", ".claude-plugin", "plugin.json");
const have = fs.existsSync(verFile) ? fs.readFileSync(verFile, "utf8").trim() || null : readJsonVersion(pluginJson);
/** @type {string | null} */
let want = typeof opts["expect-version"] === "string" ? opts["expect-version"] : null;
let wantError = "";
if (typeof opts["expect-version-from"] === "string") {
  want = readJsonVersion(path.resolve(opts["expect-version-from"]));
  if (!want) wantError = `${opts["expect-version-from"]} から版を読めません`;
}
const redownload = fs.existsSync(verFile) ? "シートから道具の zip を落とし直して、lp/tools/ に展開し直す" : "/plugin → Installed → school-starter → Update now のあと、/reload-plugins を実行する";
if (wantError) {
  add({ item: "道具の版", ok: false, result: wantError, next: redownload });
} else if (want !== null) {
  const ok = have === want;
  add({ item: "道具の版", ok, result: `${have ?? "版が分かりません"}（必要: ${want}）`, next: ok ? undefined : redownload });
} else if (have) {
  add({ item: "道具の版", ok: true, result: have });
}

// ---- 表 ----
const mark = (/** @type {boolean | null} */ ok) => (ok === true ? "OK" : ok === false ? "NG" : "要確認");
log("| 項目 | 結果 | 状態 | 次にやること |");
log("|---|---|---|---|");
for (const r of rows) log(`| ${r.item} | ${r.result.replace(/\|/g, "/")} | ${mark(r.ok)} | ${(r.next ?? "").replace(/\|/g, "/")} |`);
const ng = rows.filter((r) => r.ok === false);
log("");
log(ng.length ? `NG ${ng.length} 件。「次にやること」のコマンドを上から 1 つずつ、別々に実行してください（2 つを 1 行につなげない）` : "NG はありません");
process.exit(ng.length ? 1 : 0);
