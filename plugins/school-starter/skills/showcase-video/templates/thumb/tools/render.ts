// サムネイル（stills/thumb.html）を 1200x630 で撮り、final/thumb-ogp.png に書き出す。
//
//   node <stills>/tools/render.ts [--playwright <…/node_modules/playwright>]
//   → final/thumb-ogp.png（1200x630 の PNG）と final/thumb-layout.json（配置の検査の結果と元ファイルの指紋）
//
// 撮る前に: 全 <img> の読み込み・フォントの読み込み完了を待つ。画像の欠け・フォントの読み込み失敗・読み込めなかったリクエスト・
//   スクリプトのエラー・別の書体に落ちた文字が 1 つでもあれば、書き出さずに終了コード 1（豆腐や空白のまま出さない）。
//   さらに thumb.js の配置の検査（端末が枠内・文字と端末が重ならない・画面の中身 .keep が隠れない）が不合格でも止める。
// ブラウザ: パソコンの Google Chrome を使う（Playwright の追加のブラウザを入れなくてよい）。無ければ Playwright の Chromium。
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

type PwPage = {
  on(ev: "requestfailed", cb: (r: { url(): string }) => void): void;
  on(ev: "pageerror", cb: (e: Error) => void): void;
  goto(url: string, o: { waitUntil: "load" }): Promise<unknown>;
  evaluate<T>(fn: () => T | Promise<T>): Promise<T>;
  screenshot(o: { path: string; fullPage: boolean }): Promise<unknown>;
};
type PwContext = { newPage(): Promise<PwPage>; close(): Promise<void> };
type PwBrowser = {
  newContext(o: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<PwContext>;
  close(): Promise<void>;
};
type Pw = { chromium: { launch(o?: { channel?: string }): Promise<PwBrowser> } };
type Layout = { issues: string[]; pass: boolean };

class RenderError extends Error {}

const STILLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINAL = path.join(STILLS, "final");
/** 中身が変わったかを showcase-check.ts thumb が見分けるための指紋の対象（同じ一覧を showcase-check.ts にも持つ） */
const THUMB_SOURCES = ["thumb.html", "thumb.css", "thumb.js"];
const W = 1200;
const H = 630;

function findPlaywright(explicit: string | undefined): string {
  if (explicit) {
    const entry = path.join(path.resolve(explicit), "index.mjs");
    if (!fs.existsSync(entry)) throw new RenderError(`--playwright の場所に index.mjs がありません: ${entry}`);
    return entry;
  }
  for (let dir = STILLS; ; ) {
    try {
      return createRequire(path.join(dir, "package.json")).resolve("playwright");
    } catch {
      /* 上のフォルダへ */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new RenderError(
    `Playwright が見つかりません（${STILLS} から上の node_modules）。promo-video フォルダで npm install を実行してください（references/setup.md「道具をそろえる」）`,
  );
}

function sourceDigest(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of THUMB_SOURCES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) throw new RenderError(`サムネイルの部品がありません: ${p}（スキルの templates/thumb から写す）`);
    out[f] = createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  }
  return out;
}

async function launch(pw: Pw): Promise<PwBrowser> {
  try {
    return await pw.chromium.launch({ channel: "chrome" });
  } catch (e) {
    console.warn(`[注意] Google Chrome を起動できなかったので Playwright の Chromium を使います（${(e as Error).message.split("\n")[0]}）`);
    try {
      return await pw.chromium.launch();
    } catch {
      throw new RenderError("ブラウザを起動できません。Google Chrome を入れるか、promo-video フォルダで npx playwright install chromium を実行してください");
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let explicit: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--playwright") {
      explicit = argv[++i];
      if (!explicit) throw new RenderError("--playwright には値が必要です");
    } else throw new RenderError(`不明な引数です: ${argv[i]}（使い方: node tools/render.ts [--playwright <dir>]）`);
  }
  const file = path.join(STILLS, "thumb.html");
  if (!fs.existsSync(file)) throw new RenderError(`thumb.html がありません: ${file}（スキルの templates/thumb から型を 1 つ写す）`);
  if (/〔|〕/.test(fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, ""))) {
    throw new RenderError("thumb.html に埋めていない〔 〕が残っています（REPLACE を先に埋める）");
  }
  const pw = (await import(pathToFileURL(findPlaywright(explicit)).href)) as Pw & { default?: Pw };
  const { chromium } = pw.chromium ? pw : (pw.default as Pw);
  fs.mkdirSync(FINAL, { recursive: true });
  // 前回の結果を先に消す（途中で止まったときに古い合格が残らないように）
  for (const f of ["thumb-ogp.png", "thumb-layout.json"]) fs.rmSync(path.join(FINAL, f), { force: true });

  const browser = await launch({ chromium });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const failed: string[] = [];
    const errors: string[] = [];
    page.on("requestfailed", (r) => failed.push(r.url()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
    const report = await page.evaluate(async () => {
      const imgs = [...document.images];
      await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
      await document.fonts.ready;
      await Promise.all([...document.fonts].map((f) => (f.status === "unloaded" ? f.load().catch(() => undefined) : undefined)));
      await document.fonts.ready;
      const broken = imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src);
      const fontErrors = [...document.fonts].filter((f) => f.status === "error").map((f) => `${f.family} ${f.weight}`);
      return { broken, fontErrors, faces: document.fonts.size };
    });
    if (failed.length || errors.length || report.broken.length || report.fontErrors.length) {
      throw new RenderError(`読めなかった=${failed.join(",")} スクリプトのエラー=${errors.join(",")} 画像の欠け=${report.broken.join(",")} フォント=${report.fontErrors.join(",")}`);
    }
    if (report.faces === 0) throw new RenderError("@font-face が 0 件です（先に gen-fonts.ts を回す）");
    const fallback = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = (n.textContent || "").trim();
        const el = n.parentElement;
        if (!text || !el || el.closest("script,style")) continue;
        const cs = getComputedStyle(el);
        const fam = cs.fontFamily.split(",")[0].trim();
        if (fam === "sans-serif") continue;
        if (!document.fonts.check(`${cs.fontWeight} ${cs.fontSize} ${fam}`, text)) out.push(`${fam} ${cs.fontWeight}: ${text.slice(0, 20)}`);
      }
      return out;
    });
    if (fallback.length) throw new RenderError(`別の書体に落ちた文字があります（gen-fonts.ts を回し直す）: ${fallback.join(" / ")}`);
    const layout = (await page.evaluate(() => {
      const fn = (window as unknown as { __thumbLayout?: () => unknown }).__thumbLayout;
      return fn ? fn() : null;
    })) as Layout | null;
    if (!layout) throw new RenderError("thumb.js が読み込まれていません（__thumbLayout が無い）");
    if (!layout.pass) {
      throw new RenderError(`配置の検査で不合格（書き出していません）\n  - ${layout.issues.join("\n  - ")}\n  → 端末の --x --y --s・文字の長さ・.keep を直す`);
    }
    const out = path.join(FINAL, "thumb-ogp.png");
    await page.screenshot({ path: out, fullPage: false });
    await ctx.close();
    const rec = { renderedAt: new Date().toISOString(), size: [W, H], sources: sourceDigest(STILLS), layout };
    fs.writeFileSync(path.join(FINAL, "thumb-layout.json"), JSON.stringify(rec, null, 2) + "\n");
    console.log(`thumb-ogp: ${W}x${H} faces=${report.faces} 配置の検査 OK -> ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(`[render] ${e instanceof RenderError ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
});
