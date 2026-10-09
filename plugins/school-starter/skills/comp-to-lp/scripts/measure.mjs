#!/usr/bin/env node
/**
 * 実装の要素の位置・大きさを測り、カンプから採寸した目標値との差を出す。
 *
 * usage:
 *   node measure.mjs --config comp.config.json [--json] [--tolerance 1] [--width 1448] [--pw-root <dir>]
 *
 * 設定の measure: { "<selector>": { "top": 88, "height": 712, "left": 60, "width": 1328 } }
 *   書いた項目だけ比べる。top/left はページ先頭・左端からの絶対座標（スクロール込み）。
 *   同じセレクタに複数一致する場合は最初の要素。n 番目は :nth-child などで指定する。
 * 終了コード: 0 = 全項目が許容差以内 / 1 = 超えた項目あり / 2 = 設定・要素の不備
 */
import { parseArgs, loadConfig, loadPlaywright, openPage, pageUrl, fmt, die } from "./lib.mjs";

const { opts } = parseArgs(process.argv.slice(2));
const { cfg } = loadConfig(opts.config, opts.viewport, opts["out-dir"]);
const tol = Number(opts.tolerance ?? cfg.tolerance ?? 1);
const width = Number(opts.width ?? cfg.targetWidth);
if (!Number.isFinite(tol) || tol < 0) die(`--tolerance は 0 以上の数値で指定してください（${opts.tolerance}）`);
if (!Number.isFinite(width) || width <= 0) die(`--width は正の数値で指定してください（${opts.width}）`);
const targets = cfg.measure ?? {};
if (!Object.keys(targets).length) {
  console.error("設定に measure がありません");
  process.exit(2);
}

const pw = await loadPlaywright(opts["pw-root"], cfg);
const browser = await pw.chromium.launch();
/**
 * @typedef {{ selector: string, found: boolean, actual?: Record<string, number>, diffs?: Record<string, number>, ok?: boolean }} Row
 */
/** @type {Row[]} */
const rows = [];
let docHeight = 0;
try {
  const page = await openPage(browser, pageUrl(cfg), { width, height: cfg.viewportHeight ?? 900 }, cfg.waitMs);
  for (const [selector, t] of Object.entries(targets)) {
    /** @type {number[] | null} */
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [b.top + window.scrollY, b.height, b.left + window.scrollX, b.width];
    }, selector);
    if (!r) {
      rows.push({ selector, found: false });
      continue;
    }
    const actual = { top: r[0], height: r[1], left: r[2], width: r[3] };
    /** @type {Record<string, number>} */
    const diffs = {};
    for (const k of /** @type {const} */ (["top", "height", "left", "width"])) {
      if (typeof t[k] === "number") diffs[k] = Math.round((actual[k] - t[k]) * 10) / 10;
    }
    rows.push({ selector, found: true, actual, diffs, ok: Object.values(diffs).every((d) => Math.abs(d) <= tol) });
  }
  docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
} finally {
  await browser.close();
}

const bad = rows.filter((r) => !r.found || !r.ok);
if (opts.json) {
  console.log(JSON.stringify({ width, tolerance: tol, docHeight, rows, failed: bad.map((r) => r.selector) }, null, 2));
} else {
  const col = Math.min(40, Math.max(...rows.map((r) => r.selector.length)) + 2);
  for (const r of rows) {
    if (!r.found) {
      console.log(`${r.selector.padEnd(col)} 要素が見つかりません`);
      continue;
    }
    const actual = /** @type {Record<string, number>} */ (r.actual);
    const parts = Object.entries(r.diffs ?? {}).map(([k, d]) => `${k} ${actual[k].toFixed(0).padStart(5)} (${fmt(d, 5)})`);
    console.log(`${r.ok ? "  " : "NG"} ${r.selector.padEnd(col)} ${parts.join("  ")}`);
  }
  console.log(`doc height ${docHeight} / 許容差 ±${tol}px / NG ${bad.length} 件`);
}
process.exit(rows.some((r) => !r.found) ? 2 : bad.length ? 1 : 0);
