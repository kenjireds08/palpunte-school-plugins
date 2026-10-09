#!/usr/bin/env node
/**
 * 文字の実際の描画幅を測り、カンプから採寸した幅と比べる。
 * フォントサイズ・letter-spacing を決めるための道具（ratio = 目標 / 実測 を掛けると近づく）。
 *
 * usage:
 *   node textw.mjs --config comp.config.json [--json] [--tolerance 2] [--pw-root <dir>]
 *
 * 設定の text: [{ "selector": ".hero__title", "line": 0, "width": 555, "left": 60 }]
 *   line を省略（null）すると要素内の全テキストの範囲、数値なら n 番目のテキストノード
 *   （<br> で区切った行や、<span> で分けた行を 1 つずつ測れる）。
 * 終了コード: 0 = 許容差以内 / 1 = 超えた項目あり / 2 = 要素の不備
 */
import { parseArgs, loadConfig, loadPlaywright, openPage, pageUrl, die } from "./lib.mjs";

const { opts } = parseArgs(process.argv.slice(2));
const { cfg } = loadConfig(opts.config, opts.viewport, opts["out-dir"]);
const tol = Number(opts.tolerance ?? cfg.tolerance ?? 2);
if (!Number.isFinite(tol) || tol < 0) die(`--tolerance は 0 以上の数値で指定してください（${opts.tolerance}）`);
const targets = cfg.text ?? [];
if (!targets.length) {
  console.error("設定に text がありません");
  process.exit(2);
}

const pw = await loadPlaywright(opts["pw-root"], cfg);
const browser = await pw.chromium.launch();
/**
 * @typedef {{ selector: string, line: number | null, target: number, width?: number, left?: number, ratio?: number, diff?: number, leftDiff?: number, ok?: boolean, error?: string }} Row
 */
/** @type {Row[]} */
const rows = [];
try {
  const page = await openPage(browser, pageUrl(cfg), { width: cfg.targetWidth, height: cfg.viewportHeight ?? 900 }, cfg.waitMs);
  for (const t of targets) {
    const line = t.line ?? null;
    /** @type {number[] | string} */
    const r = await page.evaluate(
      ([s, ln]) => {
        const el = document.querySelector(s);
        if (!el) return "要素が見つかりません";
        const texts = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) if ((n.textContent ?? "").trim()) texts.push(n);
        if (!texts.length) return "テキストがありません";
        const range = document.createRange();
        if (ln === null) {
          range.setStart(texts[0], 0);
          const last = texts[texts.length - 1];
          range.setEnd(last, last.length);
        } else {
          if (!texts[ln]) return `テキストノード ${ln} がありません（${texts.length} 個）`;
          range.selectNodeContents(texts[ln]);
        }
        const b = range.getBoundingClientRect();
        return [b.left, b.width];
      },
      [t.selector, line],
    );
    if (typeof r === "string") {
      rows.push({ selector: t.selector, line, target: t.width, error: r });
      continue;
    }
    const [left, width] = r;
    const diff = Math.round((width - t.width) * 10) / 10;
    const leftDiff = typeof t.left === "number" ? Math.round((left - t.left) * 10) / 10 : undefined;
    const ok = Math.abs(diff) <= tol && (leftDiff === undefined || Math.abs(leftDiff) <= tol);
    rows.push({ selector: t.selector, line, target: t.width, width, left, ratio: Math.round((t.width / width) * 1000) / 1000, diff, leftDiff, ok });
  }
} finally {
  await browser.close();
}

const bad = rows.filter((r) => r.error || !r.ok);
if (opts.json) {
  console.log(JSON.stringify({ tolerance: tol, rows, failed: bad.map((r) => `${r.selector}#${r.line}`) }, null, 2));
} else {
  for (const r of rows) {
    const name = `${r.selector}${r.line === null ? "" : ` [${r.line}]`}`.padEnd(34);
    if (r.error) {
      console.log(`NG ${name} ${r.error}`);
      continue;
    }
    const lft = r.leftDiff === undefined ? `left ${r.left?.toFixed(0)}` : `left ${r.left?.toFixed(0)} (${r.leftDiff >= 0 ? "+" : ""}${r.leftDiff})`;
    console.log(`${r.ok ? "  " : "NG"} ${name} w ${r.width?.toFixed(1).padStart(6)} / 目標 ${String(r.target).padStart(4)}  ratio ${r.ratio?.toFixed(3)}  ${lft}`);
  }
  console.log(`許容差 ±${tol}px / NG ${bad.length} 件`);
}
process.exit(rows.some((r) => r.error) ? 2 : bad.length ? 1 : 0);
