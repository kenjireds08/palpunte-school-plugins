#!/usr/bin/env node
/**
 * 生成画像の後処理（透過・色の塗り直し・写真の縮小）。Node と Playwright の Chromium だけで画素を読む。
 *
 * usage:
 *   node mask.mjs mask  <src.png> <dst.png> [--color #b5613f] [--pad 8] [--white 232] [--thin 0] [--pw-root <dir>]
 *   node mask.mjs photo <src.png> <dst.jpg> [--max-width 1600] [--quality 88] [--pw-root <dir>]
 *   node mask.mjs batch --jobs jobs.json --config comp.config.json [--force] [--pw-root <dir>]
 *
 * mask: 「白地に黒で描かせた」アイコン・手書き文字・ロゴマークを、明るさ → 透明度に変換し、
 *       1 色で塗り直して、余白を切り詰めた透過 PNG にする。
 *       明るさ = 0.299R + 0.587G + 0.114B（四捨五入）。lo = min(最暗部 + 25, 200)、hi = --white（既定 232）
 *       透明度 = 明るさ >= hi → 0 / <= lo → 255 / 間は int((hi - 明るさ) * 255 / (hi - lo))（切り捨て）
 *       切り詰めは 透明度 > 24 の範囲に --pad（既定 8）px を足した四角。RGB は全画素 --color にするので、ふちに白や灰色が残らない
 * photo: 幅が --max-width より大きければ縮めて書き出す（拡張子 .jpg / .jpeg / .png / .webp で形式を決める）
 * batch: 素材一覧（jobs.json）の final に従って一括で書き出す。既にある書き出し先は --force を付けない限り飛ばす
 *   - 生成元: adopt（作り直し版を採用したとき）→ out → images.rawDir（既定 assets/raw）/<name>.png の順
 *   - kind が icon / hand / logo（または name の接頭辞がそれ）、または "transparent": true なら mask、それ以外は photo
 *   - final の項目: { out, color?, pad?, white?, thin? }（mask）/ { out, maxWidth?, quality? }（photo）。パスは設定ファイルのあるディレクトリ基準
 */
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import { parseArgs, die, loadPlaywright, COMPOSE_HTML, resolveInside, hasEnvSegment } from "./lib.mjs";

const MASK_KINDS = new Set(["icon", "hand", "logo"]);

/** @param {string} color @returns {[number, number, number]} */
function hexRgb(color) {
  const c = String(color).replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) die(`色は #rrggbb で指定してください: ${color}`);
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
}
/** @param {unknown} v @param {string} label @param {number} min */
function intOpt(v, label, min) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) die(`${label} は ${min} 以上の整数で指定してください（${v}）`);
  return n;
}
/** ちょうど 0.5 のときは偶数へ丸める（元の後処理と同じ丸め方） @param {number} x */
function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// ---- PNG の書き出し（RGBA 8bit。Node 標準の zlib だけで作る）----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** @param {number} w @param {number} h @param {Uint8Array} rgba */
export function encodePngRgba(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * 明るさの配列から、透明度・切り詰め・塗り直しを計算する（画素の計算は Node 側。テストしやすくするため）
 * @param {{ w: number, h: number, L: Uint8Array }} img
 * @param {{ color: [number, number, number], pad: number, white: number, thin: number }} o
 * @returns {{ w: number, h: number, rgba: Uint8Array, empty: boolean }}
 */
export function computeMask({ w, h, L }, { color, pad, white, thin }) {
  let min = 255;
  for (let i = 0; i < L.length; i++) if (L[i] < min) min = L[i];
  const lo = Math.min(min + 25, 200); // 最暗部から少し上までを「インク」とみなす
  const hi = white;
  if (lo >= hi) throw new Error("白地に黒の画像ではないようです（最暗部が明るすぎる）");
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = v >= hi ? 0 : v <= lo ? 255 : Math.trunc(((hi - v) * 255) / (hi - lo));
  let a = new Uint8Array(L.length);
  for (let i = 0; i < L.length; i++) a[i] = lut[L[i]];
  if (thin > 0) {
    // 線を細らせる（最小値フィルタ。端は端の画素を伸ばして扱う）
    const r = thin;
    const tmp = new Uint8Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          if (a[y * w + xx] < m) m = a[y * w + xx];
        }
        tmp[y * w + x] = m;
      }
    const out = new Uint8Array(a.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let dy = -r; dy <= r; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          if (tmp[yy * w + x] < m) m = tmp[yy * w + x];
        }
        out[y * w + x] = m;
      }
    a = out;
  }
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (a[y * w + x] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  const empty = x1 < 0;
  let cx0 = 0, cy0 = 0, cx1 = w, cy1 = h;
  if (!empty) {
    cx0 = Math.max(0, x0 - pad);
    cy0 = Math.max(0, y0 - pad);
    cx1 = Math.min(w, x1 + 1 + pad);
    cy1 = Math.min(h, y1 + 1 + pad);
  }
  const ow = cx1 - cx0, oh = cy1 - cy0;
  const rgba = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const p = (y * ow + x) * 4;
      rgba[p] = color[0];
      rgba[p + 1] = color[1];
      rgba[p + 2] = color[2];
      rgba[p + 3] = a[(y + cy0) * w + (x + cx0)];
    }
  return { w: ow, h: oh, rgba, empty };
}

/** @param {string} file */
function dataUrl(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`;
}

/**
 * ブラウザで画像を読む。壊れた画像・画像でないファイルは、例外のまま落とさずに案内して止める
 * @template T
 * @param {string} src @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function readInPage(src, fn) {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    die(`${src}: 画像として読めません（${msg}）。生成し直すか、jobs.json の adopt / out の指定を確かめてください`);
  }
}

/** @param {any} page @param {string} src @param {string} dst @param {{ color: string, pad: number, white: number, thin: number }} o */
async function runMask(page, src, dst, o) {
  if (!fs.existsSync(src)) die(`見つかりません: ${src}`);
  const color = hexRgb(o.color);
  /** @type {{ w: number, h: number, data: string }} */
  const r = await readInPage(src, () => page.evaluate((s) => window.luma(s), dataUrl(src)));
  const L = new Uint8Array(Buffer.from(r.data, "base64"));
  let m;
  try {
    m = computeMask({ w: r.w, h: r.h, L }, { color, pad: o.pad, white: o.white, thin: o.thin });
  } catch (e) {
    die(`${src}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (m.empty) console.error(`注意: ${src} にインク部分が見つかりません（真っ白）`);
  fs.mkdirSync(path.dirname(path.resolve(dst)), { recursive: true });
  fs.writeFileSync(dst, encodePngRgba(m.w, m.h, m.rgba));
  console.log(`${dst} (${m.w}, ${m.h})`);
}

/** @param {any} page @param {string} src @param {string} dst @param {{ maxWidth: number, quality: number }} o */
async function runPhoto(page, src, dst, o) {
  if (!fs.existsSync(src)) die(`見つかりません: ${src}`);
  const ext = path.extname(dst).toLowerCase();
  const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
  if (!type) die(`書き出し先の拡張子は .jpg / .jpeg / .png / .webp にしてください: ${dst}`);
  const url = dataUrl(src);
  /** @type {[number, number]} */
  const [sw, sh] = await readInPage(src, () => page.evaluate((s) => window.imageSize(s), url));
  let w = sw, h = sh;
  if (sw > o.maxWidth) {
    w = o.maxWidth;
    h = pyRound((sh * o.maxWidth) / sw);
  }
  /** @type {{ w: number, h: number, data: string }} */
  const r = await readInPage(src, () => page.evaluate((a) => window.photo(a), { src: url, w, h, type, quality: o.quality / 100 }));
  fs.mkdirSync(path.dirname(path.resolve(dst)), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(r.data, "base64"));
  console.log(`${dst} (${r.w}, ${r.h})`);
}

// ---- 実行 ----
const { opts, rest } = parseArgs(process.argv.slice(2));
const mode = rest[0];
if (mode !== "mask" && mode !== "photo" && mode !== "batch") die("使い方: node mask.mjs mask|photo|batch ...（ファイル先頭の usage を参照）");

/** @type {Array<() => Promise<void>>} */
let work = [];
/** @type {any} */
let page = null;
/** @type {string} */
let startFile;
let summary = "";

if (mode === "mask" || mode === "photo") {
  const [, src, dst] = rest;
  if (!src || !dst || rest.length > 3) die(`使い方: node mask.mjs ${mode} <src> <dst> [オプション]`);
  const s = path.resolve(src), d = path.resolve(dst);
  // 鍵のファイル（.env で始まる名前）は、読むのも書くのも拒否する
  if (hasEnvSegment(s) || hasEnvSegment(d)) die("名前が .env で始まるファイルは読み書きできません");
  startFile = s;
  if (mode === "mask") {
    const o = {
      color: typeof opts.color === "string" ? opts.color : "#000000",
      pad: intOpt(opts.pad ?? 8, "--pad", 0),
      white: intOpt(opts.white ?? 232, "--white", 1),
      thin: intOpt(opts.thin ?? 0, "--thin", 0),
    };
    hexRgb(o.color);
    work.push(() => runMask(page, s, d, o));
  } else {
    const o = { maxWidth: intOpt(opts["max-width"] ?? 1600, "--max-width", 1), quality: intOpt(opts.quality ?? 88, "--quality", 1) };
    if (o.quality > 100) die("--quality は 1〜100 で指定してください");
    work.push(() => runPhoto(page, s, d, o));
  }
} else {
  if (typeof opts.jobs !== "string") die("--jobs <jobs.json> を指定してください");
  if (typeof opts.config !== "string") die("--config <comp.config.json> を指定してください");
  const cfgPath = path.resolve(opts.config);
  if (!fs.existsSync(cfgPath)) die(`設定ファイルが見つかりません: ${cfgPath}`);
  const jobsPath = path.resolve(opts.jobs);
  if (!fs.existsSync(jobsPath)) die(`jobs.json が見つかりません: ${jobsPath}`);
  const base = path.dirname(cfgPath);
  startFile = cfgPath;
  /** @type {any} */
  let cfg, jobs;
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  } catch (e) {
    die(`JSON として読めません: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!Array.isArray(jobs)) die("jobs.json は [ ... ] の配列にしてください");
  const rawDir = cfg?.images?.rawDir ?? "assets/raw";
  // 生成元（adopt・out・rawDir）と書き出し先（final[].out）は、設定ファイルのあるフォルダ（lp/）の中だけ
  /** @param {string} p @param {string} label */
  const r = (p, label) => resolveInside(base, p, label);
  resolveInside(base, rawDir, "images.rawDir");
  const force = Boolean(opts.force);
  let doneN = 0, missing = 0, kept = 0, nofinal = 0;
  for (const j of jobs) {
    const finals = Array.isArray(j.final) ? j.final : [];
    if (!finals.length) {
      nofinal++;
      continue;
    }
    // 作り直し版（-v2 など）を採用したときは adopt にそのファイルを書く
    const src = r(j.adopt || j.out || path.join(rawDir, `${j.name}.png`), `${j.name} の生成元`);
    if (!fs.existsSync(src)) {
      missing++;
      console.log(`生成元なし: ${j.name} (${src})`);
      continue;
    }
    const prefix = String(j.name).split("-")[0];
    const transparent = j.transparent ?? (MASK_KINDS.has(j.kind) || MASK_KINDS.has(prefix));
    for (const o of finals) {
      if (!o || typeof o.out !== "string") die(`${j.name}: final の各項目に out を書いてください`);
      const dst = r(o.out, `${j.name} の final の書き出し先`);
      if (!force && fs.existsSync(dst)) {
        kept++;
        continue;
      }
      if (transparent) {
        const mo = {
          color: o.color ?? "#000000",
          pad: intOpt(o.pad ?? 8, `${j.name} の pad`, 0),
          white: intOpt(o.white ?? 232, `${j.name} の white`, 1),
          thin: intOpt(o.thin ?? 0, `${j.name} の thin`, 0),
        };
        hexRgb(mo.color);
        work.push(() => runMask(page, src, dst, mo));
      } else {
        const po = { maxWidth: intOpt(o.maxWidth ?? 1600, `${j.name} の maxWidth`, 1), quality: intOpt(o.quality ?? 88, `${j.name} の quality`, 1) };
        work.push(() => runPhoto(page, src, dst, po));
      }
      doneN++;
    }
  }
  summary = `書き出し ${doneN} / 既存のため飛ばした ${kept}（--force で上書き）/ 生成元なし ${missing} / final 未指定 ${nofinal}`;
}

if (work.length) {
  const pw = await loadPlaywright(opts["pw-root"], /** @type {any} */ ({ html: startFile }));
  const browser = await pw.chromium.launch();
  try {
    page = await browser.newPage();
    await page.setContent(fs.readFileSync(COMPOSE_HTML, "utf8"));
    for (const w of work) await w();
  } finally {
    await browser.close();
  }
}
if (summary) console.log(summary);
