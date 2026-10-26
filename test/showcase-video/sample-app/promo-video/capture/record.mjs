// showcase-video: アプリの画面を録画する（Playwright。ブラウザは HyperFrames の書き出し用のものか、パソコンの Google Chrome の窓）。
//
// 使い方（promo-video/capture/record.mjs に写して、REPLACE の所を埋めてから）:
//   node promo-video/capture/record.mjs --login <名前>   ログインが要る画面のとき、最初に 1 回だけ。Chrome の窓が開くので、
//                                                       受講生が自分でログインする（パスワードをこのファイルやチャットに書かない）。
//                                                       ログインが済むと、その状態を capture/credentials/<名前>.json に保存して窓が閉じる
//   node promo-video/capture/record.mjs                 全部の場面を撮る
//   node promo-video/capture/record.mjs --only user     1 つの場面だけ撮り直す
// 出力: capture/takes/<場面>.mp4（h264・30fps）・<場面>-first.png / <場面>-last.png（最初と最後の画面。カーソル無し）・<場面>.json（区切りの時刻）
//
// 守っていること（消さない）:
//   - 繋ぐのは自分のパソコンの中（http://localhost / http://127.0.0.1）だけ
//   - 書き込み（GET 以外の通信）は全部止める。止めた通信が 1 つでもあれば、そのテイクは捨てる（本物のデータを書き換えない）
//   - 文字の置き換えは画面の文字（テキストと一部の属性）だけ。<script>・<style> の中は書き換えない（アプリのデータが壊れる）
//   - 撮影中 0.2 秒ごとに禁止語（本物の名前・電話番号・住所など）を探し、1 つでも出たらそのテイクを捨てる
//   - ログイン状態のファイル（capture/credentials/）は Claude が開かない・表示しない・Git に入れない

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------- 設定（REPLACE: アプリに合わせる） ----------
const BASE = process.env.SHOWCASE_BASE_URL || "http://127.0.0.1:4173"; // DONE: アプリを開く URL（npm run dev で出る URL）
const LOGIN_PATH = "/login"; // REPLACE: ログイン画面のパス（ログインの無いアプリならそのまま）
/** 画面の大きさ。スマホの画面は 390x844、PC の画面は 1280x800（動画の端末の枠に合わせてある） */
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  pc: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};
/**
 * 画面の文字の置き換え（長いものから）。[正規表現, 置き換え後]。REPLACE: 本物の名前・電話番号・住所・メールが出る画面なら必ず書く。
 * 置き換え後の文字に置き換え前の語を含めない
 */
const WORDS = [
  // [/山田 太郎/g, "見本 花子"],
  // [/0\d{1,4}-\d{1,4}-\d{3,4}/g, "000-0000-0000"],
];
/** 見えなくする要素（CSS）。開発用の表示などは既定で隠す */
const HIDE_CSS = ["nextjs-portal{display:none !important}", "[data-nextjs-toast]{display:none !important}", "#__next-build-watcher{display:none !important}"];
/** 画面に 1 つでも出たらテイクを捨てる語（置き換え漏れの検出）。REPLACE: WORDS の置き換え前の語を全部 */
const FORBIDDEN = [
  // "山田 太郎",
];
/**
 * 書き込みを通してよい通信（既定は空＝全部止める）。[メソッド, URL のパスの正規表現]。
 * 予約の確定など「押すとデータが 1 件増える」場面を撮るときだけ足す。足す前に受講生に
 * 「撮影で本物のデータに 1 件増えます。撮ったあと消します」と伝えて OK をもらう（references/capture.md「書き込みが要る場面」）
 */
const ALLOW_WRITES = [
  // ["POST", /^\/api\/reservations$/],
];

// ---------- 場面（REPLACE: アプリの画面に合わせて書く。1 場面 = 1 本の動画） ----------
// device: "phone" か "pc" / login: --login で保存した名前（ログイン不要なら null）
// ready: 画面が出そろったことの確認 / run: 操作。mark("…") で区切りの時刻を残す（組み立てで録画を切り出す目印）
const SCENES = {
  user: {
    device: "phone",
    login: null,
    url: "/",
    ready: async (page) => {
      await page.getByRole("heading", { name: "教室をえらぶ" }).waitFor();
    },
    run: async (page, mark) => {
      await hold(page, 900);
      mark("教室");
      await moveAndClick(page, await one(page.getByRole("button", { name: /パン教室/ }), "パン教室"), { after: 500 });
      await moveAndClick(page, await one(page.getByRole("button", { name: "日にちをえらぶ" }), "次へ"), { after: 700 });
      mark("日にち");
      await moveAndClick(page, await one(page.getByRole("button", { name: /11\/8/ }), "11/8"), { after: 300 });
      await moveAndClick(page, await one(page.getByRole("button", { name: "13:30" }), "13:30"), { after: 400 });
      await moveAndClick(page, await one(page.getByRole("button", { name: "入力へすすむ" }), "次へ"), { after: 600 });
      mark("名前");
      await typeSlow(page, page.getByLabel("お名前"), "見本 花子", { delay: 110 });
      await hold(page, 400);
      await moveAndClick(page, await one(page.getByRole("button", { name: "予約する" }), "予約する"), { after: 300 });
      mark("完了");
      await hold(page, 1800);
    },
  },
  admin: {
    device: "pc",
    login: null,
    url: "/admin?demo=1",
    ready: async (page) => {
      await page.getByRole("heading", { name: "予約一覧" }).waitFor();
    },
    run: async (page, mark) => {
      await hold(page, 1500);
      mark("一覧");
      await moveAndClick(page, await one(page.getByRole("button", { name: "パン", exact: true }), "パン"), { moveMs: 900, after: 1200 });
      mark("絞り込み");
      await moveAndClick(page, await one(page.getByRole("button", { name: "すべて" }), "すべて"), { moveMs: 900, after: 1500 });
      mark("戻す");
      await hold(page, 1000);
    },
  },
};

// ---------- ここから下は変えない ----------
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "takes");
const CRED = path.join(HERE, "credentials");
const isLocal = (u) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u);
if (!isLocal(BASE)) throw new Error(`自分のパソコンの中（http://localhost）以外には繋ぎません: ${BASE}`);
const hold = (page, ms) => page.waitForTimeout(ms);

/** 通信 1 件の判定。GET・OPTIONS・ログインの更新（/auth/v1/token）・ALLOW_WRITES に書いたものだけ通す。ほかは止める */
function classifyRequest(method, url) {
  const m = String(method || "").toUpperCase();
  if (m === "GET") return { allow: true, reason: "get" };
  if (m === "OPTIONS") return { allow: true, reason: "cors-preflight" };
  let p;
  try {
    p = new URL(url);
  } catch {
    return { allow: false, reason: "unparsable-url" };
  }
  if (p.pathname.includes("/auth/v1/token")) return { allow: true, reason: "auth-token-refresh" };
  if (ALLOW_WRITES.some(([wm, re]) => wm.toUpperCase() === m && re.test(p.pathname))) return { allow: true, reason: "allowed-write" };
  return { allow: false, reason: "write-blocked" };
}

async function installWriteGuard(ctx) {
  const routed = [];
  const seen = new Map();
  const key = (m, u) => `${String(m).toUpperCase()} ${u}`;
  ctx.on("request", (req) => {
    const k = key(req.method(), req.url());
    seen.set(k, (seen.get(k) ?? 0) + 1);
  });
  await ctx.route("**/*", async (route, request) => {
    const v = classifyRequest(request.method(), request.url());
    routed.push({ method: request.method().toUpperCase(), url: request.url(), allow: v.allow });
    if (v.allow) await route.continue();
    else await route.abort();
  });
  return {
    blocked: () => routed.filter((r) => !r.allow),
    allowedWrites: () => routed.filter((r) => r.allow && !["GET", "OPTIONS"].includes(r.method) && !new URL(r.url).pathname.includes("/auth/v1/token")).map((r) => `${r.method} ${new URL(r.url).pathname}`),
    escaped: () => {
      const counts = new Map();
      for (const r of routed) counts.set(key(r.method, r.url), (counts.get(key(r.method, r.url)) ?? 0) + 1);
      const out = [];
      for (const [k, n] of seen) {
        const method = k.slice(0, k.indexOf(" "));
        if (method === "GET" || method === "OPTIONS") continue;
        if (n > (counts.get(k) ?? 0)) out.push(k);
      }
      return out;
    },
  };
}

function loadPlaywright() {
  for (let dir = HERE; ; ) {
    try {
      return createRequire(path.join(dir, "package.json")).resolve("playwright");
    } catch {
      /* 上のフォルダへ */
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error("Playwright が見つかりません。promo-video フォルダで npm install を実行してください（references/setup.md「道具をそろえる」）");
}

/**
 * 録画に使うブラウザ。パソコンの Chrome を画面なし（headless）で使うと、録画のコマが小さく欠けて下に灰色の帯が出る
 * （Chrome 155・Playwright 1.61 で確認）。そこで、HyperFrames が書き出し用に入れる chrome-headless-shell があればそれを使い、
 * 無ければパソコンの Chrome を窓ありで使う（窓が開く。撮り終わるまで触らない）
 */
function findHeadlessShell() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const exe = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  const found = [];
  for (const root of [path.join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), path.join(home, ".cache", "puppeteer", "chrome-headless-shell")]) {
    if (!fs.existsSync(root)) continue;
    for (const ver of fs.readdirSync(root)) {
      const vdir = path.join(root, ver);
      if (!fs.statSync(vdir).isDirectory()) continue;
      for (const sub of fs.readdirSync(vdir)) {
        const p = path.join(vdir, sub, exe);
        if (fs.existsSync(p)) found.push({ ver, p });
      }
    }
  }
  const num = (v) => (v.split("-").pop() || "").split(".").map((n) => Number(n) || 0);
  found.sort((a, b) => {
    const x = num(a.ver), y = num(b.ver);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  });
  return found[0]?.p ?? null;
}

async function launch(chromium, headless) {
  if (headless) {
    const shell = findHeadlessShell();
    if (shell) {
      try {
        return await chromium.launch({ executablePath: shell, headless: true });
      } catch (e) {
        console.warn(`[注意] 書き出し用のブラウザを起動できなかったので、Chrome の窓を開いて撮ります（${String(e.message).split("\n")[0]}）`);
      }
    } else {
      console.log("Chrome の窓を開いて撮ります。撮り終わるまで窓に触らないでください（先に npx --yes hyperframes@0.8.77 browser ensure を 1 回実行すると、窓を開かずに撮れます）");
    }
  }
  try {
    return await chromium.launch({ channel: "chrome", headless: false });
  } catch (e) {
    throw new Error(`Google Chrome を起動できません。Chrome を入れてから、もう一度実行してください（${String(e.message).split("\n")[0]}）`);
  }
}

// ---------- ページに差し込むもの（読み込みの最初・全フレーム） ----------
const CURTAIN = `(() => {
  const CSS = 'html::before{content:"";position:fixed;inset:0;background:#fff;z-index:2147483647;pointer-events:none}';
  const put = () => { if (window.__scReleased || !document.head || document.getElementById('__sc_curtain')) return;
    const s = document.createElement('style'); s.id = '__sc_curtain'; s.textContent = CSS; document.head.appendChild(s); };
  put();
  const mo = new MutationObserver(() => { if (window.__scReleased) { mo.disconnect(); return; } put(); });
  mo.observe(document, { childList: true, subtree: true });
  window.__scRelease = () => { window.__scReleased = true; mo.disconnect(); const el = document.getElementById('__sc_curtain'); if (el) el.remove(); };
})();`;

const REPLACER = `(() => {
  if (window.__scReplacer) return; window.__scReplacer = true;
  const WORDS = ${JSON.stringify(WORDS.map(([re, to]) => [re.source, re.flags, to]))}.map(([s, f, to]) => [new RegExp(s, f), to]);
  const FORBIDDEN = ${JSON.stringify(FORBIDDEN)};
  const HIDE = ${JSON.stringify(HIDE_CSS.join("\n"))};
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'value'];
  const fix = (s) => { let o = s; for (const [re, to] of WORDS) { re.lastIndex = 0; o = o.replace(re, to); } return o; };
  const fixText = (n) => { const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || !n.nodeValue) return;
    const f = fix(n.nodeValue); if (f !== n.nodeValue) n.nodeValue = f; };
  const fixEl = (el) => { if (SKIP.has(el.nodeName)) return; for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a);
    if (v) { const f = fix(v); if (f !== v) el.setAttribute(a, f); } } };
  const walk = (root) => { if (root.nodeType === 3) return fixText(root); if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) fixEl(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) n.nodeType === 3 ? fixText(n) : fixEl(n); };
  const hide = () => { if (document.head && !document.getElementById('__sc_hide')) { const s = document.createElement('style');
    s.id = '__sc_hide'; s.textContent = HIDE; document.head.appendChild(s); } };
  new MutationObserver((list) => { for (const m of list) { if (m.type === 'characterData') fixText(m.target);
    else if (m.type === 'attributes') fixEl(m.target); else m.addedNodes.forEach(walk); } hide(); })
    .observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', () => { walk(document); hide(); });
  window.__scLeakScan = () => { const tw = document.createTreeWalker(document.body || document, NodeFilter.SHOW_TEXT); let text = '';
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.parentNode && !SKIP.has(n.parentNode.nodeName)) text += n.nodeValue + '\\n'; }
    document.querySelectorAll('input,textarea').forEach((el) => { text += (el.value || '') + '\\n'; });
    return FORBIDDEN.filter((w) => text.includes(w)); };
})();`;

/** 見えるカーソル（録画にはマウスの矢印が映らないので、丸い印を描く）。押した瞬間に波紋が出る */
const CURSOR = `(() => {
  if (window.__scCursor) return; window.__scCursor = true;
  const make = () => {
    if (!document.body || document.getElementById('__sc_cur')) return;
    const st = document.createElement('style');
    st.textContent = '#__sc_cur{position:fixed;left:-100px;top:-100px;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;'
      + 'background:rgba(255,255,255,.35);border:3px solid rgba(20,20,24,.75);box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:2147483646;pointer-events:none;'
      + 'transition:transform .12s ease-out}#__sc_cur.down{transform:scale(.78)}'
      + '.__sc_ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(20,20,24,.6);z-index:2147483645;'
      + 'pointer-events:none;animation:__sc_r .5s ease-out forwards}@keyframes __sc_r{to{transform:scale(2.4);opacity:0}}'
      + 'html.__sc_nocur #__sc_cur,html.__sc_nocur .__sc_ripple{display:none}';
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = '__sc_cur'; document.body.appendChild(c);
  };
  const at = (x, y) => { make(); const c = document.getElementById('__sc_cur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } };
  addEventListener('mousemove', (e) => at(e.clientX, e.clientY), true);
  addEventListener('mousedown', (e) => { at(e.clientX, e.clientY); const c = document.getElementById('__sc_cur'); if (c) c.classList.add('down');
    const r = document.createElement('div'); r.className = '__sc_ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
    document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  addEventListener('mouseup', () => { const c = document.getElementById('__sc_cur'); if (c) c.classList.remove('down'); }, true);
  document.addEventListener('DOMContentLoaded', make);
})();`;

// ---------- 操作の部品（場面の run で使う） ----------

/** ちょうど 1 つに当たることを確かめてから返す（当たらない・2 つ以上は止める） */
async function one(locator, what) {
  const n = await locator.count();
  if (n !== 1) throw new Error(`${what} が ${n} 個です（1 個であること）`);
  return locator;
}

/** カーソルを動かしてから押す（動きが見えるように） */
async function moveAndClick(page, locator, { moveMs = 700, after = 400 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (!b) throw new Error("押す対象の位置が取れません");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: Math.max(1, Math.round(moveMs / 16)) });
  await hold(page, 150);
  await page.mouse.down();
  await hold(page, 90);
  await page.mouse.up();
  await hold(page, after);
}

/** 1 文字ずつ打つ（人が打っているように見える）。打つのはダミーの文字だけ */
async function typeSlow(page, locator, text, { delay = 90 } = {}) {
  await moveAndClick(page, locator, { after: 200 });
  await locator.pressSequentially(text, { delay });
}

/** ゆっくりスクロール（selector が null ならページ全体） */
async function smoothScroll(page, { selector = null, top = null, left = null, ms = 1500 }) {
  await page.evaluate(async ({ selector, top, left, ms }) => {
    const el = selector ? document.querySelector(selector) : document.scrollingElement;
    if (!el) throw new Error(`スクロールする枠がありません: ${selector}`);
    const sy = el.scrollTop, sx = el.scrollLeft, ty = top ?? sy, tx = left ?? sx, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    await new Promise((res) => { const step = (now) => { const t = Math.min(1, (now - t0) / ms);
      el.scrollTop = sy + (ty - sy) * ease(t); el.scrollLeft = sx + (tx - sx) * ease(t); t < 1 ? requestAnimationFrame(step) : res(); };
      requestAnimationFrame(step); });
  }, { selector, top, left, ms });
}

async function shot(page, file) {
  await page.evaluate(() => document.documentElement.classList.add("__sc_nocur"));
  await page.screenshot({ path: file });
  await page.evaluate(() => document.documentElement.classList.remove("__sc_nocur"));
}

/** webm → mp4。Playwright の録画は 128 コマごとの 1 コマだけ大きくぼけるので、そのコマを落として前のコマで埋める（時刻はずれない） */
function toMp4(src, dst) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-vf", "select='not(eq(mod(n\\,128)\\,0)*gt(n\\,0))',fps=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-an", dst], { encoding: "utf8" });
  if (r.error) throw new Error(`ffmpeg を起動できません（入っていない可能性。references/setup.md）: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`mp4 への変換に失敗しました: ${String(r.stderr).slice(-400)}`);
}

// ---------- 引数 ----------
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`--${name} には値が必要です`);
  return v;
};
for (const a of args) if (a.startsWith("--") && !["--only", "--login"].includes(a)) throw new Error(`不明なオプションです: ${a}（--only <場面> / --login <名前>）`);
const ONLY = opt("only");
const LOGIN = opt("login");
if (LOGIN !== undefined && !/^[\w-]+$/.test(LOGIN)) throw new Error("--login の名前は英数字・_・- だけにしてください");

const pw = await import(pathToFileURL(loadPlaywright()).href);
const chromium = (pw.chromium ?? pw.default?.chromium);

// ---------- ログインの保存（受講生が自分の手でログインする） ----------
if (LOGIN) {
  fs.mkdirSync(CRED, { recursive: true });
  const browser = await launch(chromium, false);
  const ctx = await browser.newContext({ viewport: DEVICES.pc.viewport, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${LOGIN_PATH}`);
  console.log("Chrome の窓でログインしてください。ログインが済むと自動で保存して閉じます（10 分まで待ちます）");
  await page.waitForURL((u) => isLocal(u.href) && !u.pathname.startsWith(LOGIN_PATH), { timeout: 600000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const file = path.join(CRED, `${LOGIN}.json`);
  await ctx.storageState({ path: file });
  await browser.close();
  console.log(`ログインの状態を保存しました: capture/credentials/${LOGIN}.json（中身は開かない・Git に入れない）`);
  process.exit(0);
}

// ---------- 撮影 ----------
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch(chromium, true);
let failed = 0;
for (const id of ONLY ? [ONLY] : Object.keys(SCENES)) {
  const sc = SCENES[id];
  if (!sc) {
    console.error(`✗ 知らない場面です: ${id}（${Object.keys(SCENES).join(" / ")}）`);
    failed++;
    continue;
  }
  const dev = DEVICES[sc.device];
  if (!dev) {
    console.error(`✗ ${id}: device は phone か pc です（${sc.device}）`);
    failed++;
    continue;
  }
  let state;
  if (sc.login) {
    state = path.join(CRED, `${sc.login}.json`);
    if (!fs.existsSync(state)) {
      console.error(`✗ ${id}: ログインの状態がありません。先に node capture/record.mjs --login ${sc.login} を実行して、受講生がログインする`);
      failed++;
      continue;
    }
  }
  const tmp = path.join(OUT, `_rec-${id}-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const ctx = await browser.newContext({
    ...(state ? { storageState: state } : {}),
    ...dev,
    serviceWorkers: "block",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    recordVideo: { dir: tmp, size: dev.viewport },
  });
  await ctx.addInitScript({ content: CURTAIN });
  await ctx.addInitScript({ content: REPLACER });
  await ctx.addInitScript({ content: CURSOR });
  const guard = await installWriteGuard(ctx);
  const page = await ctx.newPage();
  const video = page.video();
  const t0 = Date.now();
  const marks = [];
  const mark = (label) => marks.push({ label, t: Number(((Date.now() - t0) / 1000).toFixed(2)) });
  let ok = false;
  try {
    await page.goto(`${BASE}${sc.url}`);
    if (new URL(page.url()).pathname.startsWith(LOGIN_PATH) && sc.url !== LOGIN_PATH) throw new Error("ログイン画面に戻されました。--login でログインし直してください");
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await sc.ready(page);
    const pre = await page.evaluate(() => window.__scLeakScan());
    if (pre.length) throw new Error(`禁止語が画面にあります: ${pre.join(", ")}（WORDS で置き換える）`);
    await page.evaluate(() => {
      window.__scLeakLog = [];
      setInterval(() => {
        const h = window.__scLeakScan();
        if (h.length) window.__scLeakLog.push(h);
      }, 200);
    });
    await page.evaluate(() => window.__scRelease());
    await hold(page, 300);
    mark("始まり");
    await shot(page, path.join(OUT, `${id}-first.png`));
    await sc.run(page, mark);
    await shot(page, path.join(OUT, `${id}-last.png`));
    const leaks = await page.evaluate(() => [...window.__scLeakLog, window.__scLeakScan()].flat());
    if (leaks.length) throw new Error(`録画中に禁止語が出ました: ${[...new Set(leaks)].join(", ")}`);
    mark("終わり");
    ok = true;
  } catch (e) {
    console.error(`✗ ${id}: ${e.message}`);
    failed++;
  }
  const blocked = guard.blocked().map((b) => `${b.method} ${new URL(b.url).pathname}`);
  const escaped = guard.escaped();
  const allowed = guard.allowedWrites();
  if (allowed.length) console.log(`  ${id}: 書き込みを ${allowed.length} 件通しました（ALLOW_WRITES）。撮影のあと、増えたデータを消します: ${allowed.join(" / ")}`);
  await ctx.close();
  const vpath = await video.path();
  if (ok && blocked.length === 0 && escaped.length === 0) {
    toMp4(vpath, path.join(OUT, `${id}.mp4`));
    fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify({ id, device: sc.device, marks, recordedAt: new Date().toISOString() }, null, 1) + "\n");
    console.log(`✓ ${id}: capture/takes/${id}.mp4 ${JSON.stringify(marks)}`);
  } else if (ok) {
    console.error(`✗ ${id}: 書き込みの通信を止めたので、このテイクは捨てました（本物のデータは書き換わっていません）: ${JSON.stringify({ blocked, escaped })}`);
    for (const f of [`${id}-first.png`, `${id}-last.png`]) fs.rmSync(path.join(OUT, f), { force: true });
    failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
await browser.close();
process.exit(failed ? 3 : 0);
