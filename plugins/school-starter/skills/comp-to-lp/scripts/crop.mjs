#!/usr/bin/env node
/**
 * カンプ（または実装のスクショ）の一部を拡大し、10px ごとの目盛りを付けて 1 枚にする。
 * 採寸の目標値（measure / text）を「目で読む」ときに使う。座標は targetWidth 基準。
 *
 * usage:
 *   node crop.mjs --config comp.config.json --y 740 --h 420 [--x 0 --w 1448] [--zoom 2] [--src comp|impl|<file>] [--out name.png]
 *
 * impl は shot.mjs が出した outDir/impl.png を使う（先に shot.mjs を実行しておく）。
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs, loadConfig, loadPlaywright, die, writeComposePage } from "./lib.mjs";

const { opts } = parseArgs(process.argv.slice(2));
const { cfg } = loadConfig(opts.config, opts.viewport, opts["out-dir"]);
/**
 * @param {string} k
 * @param {number} [d]
 * @returns {number}
 */
const num = (k, d) => {
  const v = opts[k];
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isFinite(n)) die(`--${k} は数値で指定してください（${v}）`);
    return n;
  }
  if (d === undefined) die(`--${k} を指定してください`);
  return d;
};
const W = cfg.targetWidth;
const x = num("x", 0), y = num("y"), w = num("w", W), h = num("h"), zoom = num("zoom", 2);
if (w <= 0 || h <= 0 || zoom <= 0) die("--w / --h / --zoom は 0 より大きい値にしてください");
const srcOpt = typeof opts.src === "string" ? opts.src : "comp";
const src = srcOpt === "comp" ? cfg.comp : srcOpt === "impl" ? path.join(cfg.outDir, "impl.png") : path.resolve(srcOpt);
if (!fs.existsSync(src)) die(`画像が見つかりません: ${src}${srcOpt === "impl" ? "（先に shot.mjs を実行）" : ""}`);
if (w * zoom * h * zoom > 60_000_000) die("拡大後の画像が大きすぎます。範囲か --zoom を小さくしてください");

const pw = await loadPlaywright(opts["pw-root"], cfg);
const browser = await pw.chromium.launch();
try {
  const composeFile = writeComposePage(cfg.outDir);
  const page = await browser.newPage({ viewport: { width: Math.ceil(w * zoom), height: Math.ceil(h * zoom) } });
  await page.goto(pathToFileURL(composeFile).href);
  await page.evaluate((a) => window.crop(a), { src: pathToFileURL(src).href, W, x, y, w, h, zoom });
  const name = typeof opts.out === "string" ? opts.out : `crop_${srcOpt === "impl" ? "impl" : "comp"}_${x}_${y}_${w}x${h}@${zoom}.png`;
  const out = path.join(cfg.outDir, name);
  await page.locator("#stage").screenshot({ path: out });
  console.log(out);
} finally {
  await browser.close();
}
