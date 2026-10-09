#!/usr/bin/env node
/**
 * 実装ページを撮影し、カンプと「セクションごとに上下に並べた比較画像」を作る。
 *
 * usage:
 *   node shot.mjs --config comp.config.json [--diff] [--only hero,faq] [--mobile] [--out-dir <dir>] [--pw-root <dir>]
 *   node shot.mjs --config comp.config.json --viewport sp [--diff]     スマホ用カンプ（mobile.comp）と見比べる
 *
 * 出力（outDir。--viewport sp のときは outDir/sp/）:
 *   impl.png             実装の全体スクショ（幅 = targetWidth / スマホは mobile.width）
 *   cmp_<n>_<name>.png   上 = カンプ / 赤線 / 下 = 実装（--diff なら 3 段目に差分。黒いほど一致）
 *   sp.png               --mobile のとき（スマホ用カンプが無い場合の確認用）。スマホ幅の全体スクショ
 *
 * 画像の合成は Chromium の描画で行う（Node に画像ライブラリを足さないため）。
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, loadConfig, loadPlaywright, openPage, pageUrl, writeComposePage } from "./lib.mjs";

const { opts } = parseArgs(process.argv.slice(2));
const { cfg } = loadConfig(opts.config, opts.viewport, opts["out-dir"]);
const pw = await loadPlaywright(opts["pw-root"], cfg);
const browser = await pw.chromium.launch();
const W = cfg.targetWidth;
const label = cfg.viewport === "sp" ? "sp" : "pc";

try {
  // 1) 実装の全体スクショ（比較用なので CSS px = 画素になるよう dpr 1 で撮る）
  const page = await openPage(browser, pageUrl(cfg), { width: W, height: cfg.viewportHeight ?? 900 }, cfg.waitMs);
  const implPath = path.join(cfg.outDir, "impl.png");
  await page.screenshot({ path: implPath, fullPage: true });
  /** @type {number} */
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  /** @type {number} */
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.close();
  if (scrollWidth > W) console.log(`注意: ${label} で横にはみ出しています（scrollWidth ${scrollWidth} > ${W}）`);

  if (opts.mobile && cfg.viewport === "pc") {
    if (cfg.mobile) {
      const sp = await openPage(browser, pageUrl(cfg), cfg.mobile, cfg.waitMs);
      await sp.screenshot({ path: path.join(cfg.outDir, "sp.png"), fullPage: true });
      /** @type {number} */
      const sw = await sp.evaluate(() => document.documentElement.scrollWidth);
      console.log(`sp: scrollWidth ${sw}（${cfg.mobile.width} を超えたら横スクロールが出ている）`);
      await sp.close();
    } else {
      console.log("mobile の設定が無いため sp.png は撮っていません");
    }
  }

  // 2) 合成用のページを file:// で開き、カンプの元サイズを測る
  const compUrl = pathToFileURL(cfg.comp).href;
  const implUrl = pathToFileURL(implPath).href;
  const composeFile = writeComposePage(cfg.outDir);
  const cp = await browser.newPage({ viewport: { width: W, height: 800 } });
  await cp.goto(pathToFileURL(composeFile).href);
  /** @type {[number, number]} */
  const natural = await cp.evaluate((src) => window.naturalSize(src), compUrl);
  const scale = W / natural[0];
  const compH = Math.round(natural[1] * scale);
  const d = pageHeight - compH;
  console.log(`${label}: comp ${natural[0]}x${natural[1]} → x${scale.toFixed(3)} = ${W}x${compH} / page ${W}x${pageHeight}（差 ${d >= 0 ? "+" : ""}${d}px）`);

  // 3) セクションごとの比較画像（番号は設定の並び順のまま）
  const only = typeof opts.only === "string" ? new Set(opts.only.split(",")) : null;
  const sections = (cfg.sections ?? [{ name: "all", top: 0, bottom: Math.max(compH, pageHeight) }])
    .map((s, i) => ({ ...s, i }))
    .filter((s) => !only || only.has(s.name));
  if (only && !sections.length) console.log(`注意: --only ${opts.only} に一致するセクションがありません`);
  const withDiff = Boolean(opts.diff);
  for (const s of sections) {
    const h = s.bottom - s.top;
    /** @type {number} */
    const stageH = await cp.evaluate((a) => window.compose(a), {
      compUrl,
      pcUrl: implUrl,
      W,
      compH,
      top: s.top,
      h,
      withDiff,
    });
    await cp.setViewportSize({ width: W, height: Math.ceil(stageH) });
    const out = path.join(cfg.outDir, `cmp_${s.i}_${s.name}.png`);
    await cp.locator("#stage").screenshot({ path: out });
    console.log(`${out}  y ${s.top}-${s.bottom}`);
  }
  await cp.close();
} finally {
  await browser.close();
}
