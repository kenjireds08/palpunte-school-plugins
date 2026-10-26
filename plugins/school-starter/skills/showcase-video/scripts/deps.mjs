#!/usr/bin/env node
// showcase-video の道具がそろっているかを確かめる（読むだけ。何も入れない・書き換えない）。
// わざと .mjs（型なし）にしてある: Node が古くても動いて「Node を新しくしてください」と言えるように。
//
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/deps.mjs" [--dir <promo-video のフォルダ>]
//
// 見るもの: Node（22.18 以上）・ffmpeg・ffprobe・npx・Google Chrome・promo-video の npm install・
//           ElevenLabs と OpenAI のキーが「あるか」と「どこにあるか」（値は読まない・出さない）
// 終了コード: 0 = 全部そろっている / 1 = 足りないものがある（表の「次にやること」を 1 つずつ）

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";
const rows = [];
const add = (item, ok, result, next = "") => rows.push({ item, ok, result, next });

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
}
for (const a of process.argv.slice(2)) {
  if (a.startsWith("--") && !["--dir", "--help", "-h"].includes(a)) {
    console.error(`知らないオプションです: ${a}（--dir <promo-video のフォルダ>）`);
    process.exit(1);
  }
}
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("deps.mjs — 紹介動画づくりの道具がそろっているかを確かめる\n  node deps.mjs [--dir <promo-video のフォルダ>]");
  process.exit(0);
}

// 1) Node
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj > 22 || (maj === 22 && min >= 18)) add("Node", true, process.versions.node);
else add("Node", false, `${process.versions.node}（22.18 以上が必要）`, isWin ? "winget install OpenJS.NodeJS.LTS（入れたらアプリを再起動）" : "brew install node（Homebrew が無ければ https://nodejs.org の LTS を入れる）。入れたらアプリを再起動");

// 2) コマンド
function has(cmd) {
  const r = isWin ? spawnSync("where", [cmd], { encoding: "utf8" }) : spawnSync("/bin/sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0;
}
for (const [cmd, why] of [
  ["ffmpeg", "声・録画・書き出しの変換"],
  ["ffprobe", "長さを測る"],
  ["npx", "HyperFrames（動画の書き出し）"],
]) {
  if (has(cmd)) add(cmd, true, "あり");
  else if (cmd === "npx") add(cmd, false, "見つかりません", "Node を入れ直す（npx は Node に付いてくる）");
  else add(cmd, false, `見つかりません（${why}で使う）`, isWin ? "winget install Gyan.FFmpeg（入れたらアプリを再起動）" : "brew install ffmpeg（5〜10 分）");
}

// 3) Google Chrome（録画・サムネイル・書き出しで使う）
const chromePaths = isMac
  ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")]
  : isWin
    ? [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, "Google", "Chrome", "Application", "chrome.exe"))
    : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
const chrome = chromePaths.find((p) => fs.existsSync(p));
if (chrome) add("Google Chrome", true, "あり");
else add("Google Chrome", false, "見つかりません", "https://www.google.com/chrome/ から入れる（録画とサムネイルで使う）");

// 3b) 書き出し・録画用のブラウザ（HyperFrames の chrome-headless-shell）。無ければ入れ方を出す（NG にはしない。録画は Chrome の窓で撮れる）
function hasHeadlessShell() {
  const exe = isWin ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  for (const root of [path.join(os.homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell"), path.join(os.homedir(), ".cache", "puppeteer", "chrome-headless-shell")]) {
    try {
      for (const ver of fs.readdirSync(root)) for (const sub of fs.readdirSync(path.join(root, ver))) if (fs.existsSync(path.join(root, ver, sub, exe))) return true;
    } catch {
      /* 無い */
    }
  }
  return false;
}
const notes = [];
if (hasHeadlessShell()) add("書き出し用のブラウザ", true, "あり");
else notes.push("書き出し用のブラウザ（約 200MB）がまだありません。npx --yes hyperframes@0.8.77 browser ensure を 1 回実行すると入ります（数分。入れないと、最初の書き出しのときに自動で入り、録画は Chrome の窓を開いて撮ります）");

// 4) promo-video の npm install（--dir のときだけ）
const dir = argValue("--dir");
if (dir) {
  const abs = path.resolve(dir);
  if (!fs.existsSync(path.join(abs, "package.json"))) add("promo-video", false, `package.json がありません（${abs}）`, "スキルの templates/package.json を promo-video に写す");
  else {
    const missing = ["playwright", "gsap", "@fontsource/noto-sans-jp", "@fontsource/anton"].filter((m) => !fs.existsSync(path.join(abs, "node_modules", m, "package.json")));
    if (missing.length) add("npm install", false, `入っていません: ${missing.join(", ")}`, `promo-video フォルダで npm install（1〜3 分）`);
    else add("npm install", true, "済み");
    // 録画（Playwright の recordVideo）は Playwright 専用の小さな ffmpeg が要る。package.json の postinstall が入れる
    const pwDir = process.env.PLAYWRIGHT_BROWSERS_PATH || (isMac ? path.join(os.homedir(), "Library", "Caches", "ms-playwright") : isWin ? path.join(process.env.LOCALAPPDATA || os.homedir(), "ms-playwright") : path.join(os.homedir(), ".cache", "ms-playwright"));
    let pwFfmpeg = false;
    try {
      pwFfmpeg = fs.readdirSync(pwDir).some((d) => d.startsWith("ffmpeg-"));
    } catch {
      /* 無い */
    }
    if (pwFfmpeg) add("録画用の ffmpeg（Playwright）", true, "あり");
    else add("録画用の ffmpeg（Playwright）", false, "入っていません", "promo-video フォルダで npm install をやり直す（自動で入る。だめなら npx playwright install ffmpeg を promo-video で）");
  }
}

// 5) キー（値は読まない。「この名前の行があるか」だけを見る）
const credFile = process.env.SHOWCASE_CREDENTIALS_FILE || path.join(os.homedir(), ".config", "school-starter", "credentials.env");
const studioFile = process.env.SHOWCASE_IMAGE_STUDIO_ENV || path.join(os.homedir(), "claude-code-projects", "image-studio", ".env.local");
function lineIn(file, name) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).some((l) => new RegExp(`^\\s*(export\\s+)?${name}\\s*=\\s*\\S`).test(l));
  } catch {
    return false;
  }
}
function where(name, alsoStudio) {
  if (process.env[name] && process.env[name].trim()) return "環境変数";
  if (lineIn(credFile, name)) return "共通の置き場";
  if (alsoStudio && lineIn(studioFile, name)) return "補講2 の image-studio";
  return null;
}
const el = where("ELEVENLABS_API_KEY", false);
add("ElevenLabs のキー", Boolean(el), el ? `あり（${el}）` : "なし", el ? "" : "references/setup.md「鍵を保存する」の ElevenLabs の保存用コマンドを、アプリの中のターミナルで実行（チャットに貼らない）");
const oa = where("OPENAI_API_KEY", true);
add("OpenAI のキー", Boolean(oa), oa ? `あり（${oa}）` : "なし", oa ? "" : "references/setup.md「鍵を保存する」の OpenAI の保存用コマンドを、アプリの中のターミナルで実行（チャットに貼らない）");

// 表
console.log(`パソコン: ${isMac ? "Mac" : isWin ? "Windows" : process.platform}`);
for (const r of rows) console.log(`[${r.ok ? "OK" : "NG"}] ${r.item}: ${r.result}${r.next ? `\n      → 次にやること: ${r.next}` : ""}`);
for (const n of notes) console.log(`[注意] ${n}`);
const ng = rows.filter((r) => !r.ok).length;
console.log(ng ? `足りないもの ${ng} 件。上から 1 つずつ入れて、もう一度この確認を実行します` : "全部そろっています");
process.exit(ng ? 1 : 0);
