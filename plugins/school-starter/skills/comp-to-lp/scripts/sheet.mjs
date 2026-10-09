#!/usr/bin/env node
/**
 * 生成画像の検品用に、一覧画像（コンタクトシート）を作る。透過 PNG は市松模様の上に置く。
 * （Chromium の描画で合成する）
 *
 * usage:
 *   node sheet.mjs --out <出力PNGのパス> [--cols 4] [--thumb 320] [--pw-root <dir>] file1.png file2.png ...
 *
 * 一覧で当たりを付けたら、気になる画像は必ず 1 枚ずつ原寸で開いて確認する（一覧だけで合格にしない）。
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs, loadPlaywright, die, writeComposePage } from "./lib.mjs";

const { opts, rest } = parseArgs(process.argv.slice(2));
if (typeof opts.out !== "string") die("--out <出力PNGのパス> を指定してください");
const files = rest.map((f) => path.resolve(f));
if (!files.length) die("画像ファイルを 1 つ以上渡してください");
for (const f of files) if (!fs.existsSync(f)) die(`見つかりません: ${f}`);
const cols = Number(opts.cols ?? 4);
const thumb = Number(opts.thumb ?? 320);
if (!Number.isInteger(cols) || cols < 1) die(`--cols は 1 以上の整数で指定してください（${opts.cols}）`);
if (!Number.isFinite(thumb) || thumb <= 0) die(`--thumb は正の数値で指定してください（${opts.thumb}）`);
const out = path.resolve(opts.out);
fs.mkdirSync(path.dirname(out), { recursive: true });

const pw = await loadPlaywright(opts["pw-root"]);
const browser = await pw.chromium.launch();
try {
  const composeFile = writeComposePage(path.dirname(out));
  const width = cols * (thumb + 10) + 10;
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(pathToFileURL(composeFile).href);
  const items = files.map((f) => ({ src: pathToFileURL(f).href, label: path.basename(f), checker: f.toLowerCase().endsWith(".png") }));
  /** @type {number} */
  const h = await page.evaluate((a) => window.sheet(a), { items, cols, thumb });
  await page.setViewportSize({ width, height: Math.ceil(h) });
  await page.locator("#stage").screenshot({ path: out });
  console.log(`${out}（${files.length} 枚）`);
} finally {
  await browser.close();
}
