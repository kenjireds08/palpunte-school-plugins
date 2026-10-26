// showcase-video の検査（読み取り専用。どのファイルも書き換えない）。
//
//   tts      : 声の設定と台本がそろっているか・声の種類（tts.provider）に合う鍵（Gemini か ElevenLabs）があるか（値は見ない）。声を作る前に回す
//   template : テンプレートの埋め残し（〔 〕・REPLACE の印）・色が設定と同じか・素材がそろっているか・制作クレジットが入っているか。書き出しの前に回す
//   timing   : ナレーションの話している長さ（正本）と HTML・書き出した mp4 の突き合わせ
//   thumb    : サムネイル（final/thumb-ogp.png）が 1200x630 か・配置の検査に合格しているか・その後に元ファイルを直していないか
//
// 実行: node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/showcase-check.ts" --help

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measureSpeech, probeSeconds, round, AudioMeasureError } from "./lib/audio.ts";
import { ensureFfmpegOnPath } from "./lib/ffpath.mjs";
import { keyStatus } from "./lib/keys.ts";
import { DEFAULT_VOICE } from "./lib/eleven-client.ts";
import { DEFAULT_GEMINI } from "./gemini-tts.ts";

export class CheckError extends Error {}

/** 許容誤差 */
export const TOL = {
  /** HTML の data-duration（2 桁）と話している長さ */
  html: 0.02,
  /** 書き出した mp4 と #root（30fps の丸め・音の先頭の詰め物） */
  mp4: 0.1,
};

// ---------- 引数 ----------

type Args = { cmd: string; single: Map<string, string>; multi: Map<string, string[]> };

const SPEC: Record<string, { single: string[]; multi: string[] }> = {
  tts: { single: ["config", "script"], multi: [] },
  template: { single: ["config"], multi: ["dir"] },
  timing: { single: ["config", "html", "meta-dir"], multi: ["mp4"] },
  thumb: { single: ["config", "dir"], multi: [] },
};

export function parseArgs(argv: string[]): Args {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "--help" || cmd === "-h") return { cmd: "help", single: new Map(), multi: new Map() };
  const spec = SPEC[cmd];
  if (!spec) throw new CheckError(`知らないサブコマンドです: ${cmd}（tts / template / timing / thumb）`);
  const single = new Map<string, string>();
  const multi = new Map<string, string[]>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--help" || a === "-h") return { cmd: "help", single, multi };
    if (!a.startsWith("--")) throw new CheckError(`知らない引数です: ${a}`);
    const name = a.slice(2);
    const isSingle = spec.single.includes(name);
    const isMulti = spec.multi.includes(name);
    if (!isSingle && !isMulti) throw new CheckError(`${cmd} では使えないオプションです: --${name}（--help で一覧）`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) throw new CheckError(`--${name} には値が必要です`);
    i++;
    if (isMulti) multi.set(name, [...(multi.get(name) ?? []), next]);
    else {
      if (single.has(name)) throw new CheckError(`--${name} が 2 回指定されています`);
      single.set(name, next);
    }
  }
  return { cmd, single, multi };
}

// ---------- 結果の集計 ----------

type Finding = { level: "NG" | "注意"; where: string; msg: string };

export class Report {
  items: Finding[] = [];
  ng(where: string, msg: string): void {
    this.items.push({ level: "NG", where, msg });
  }
  warn(where: string, msg: string): void {
    this.items.push({ level: "注意", where, msg });
  }
  get ngCount(): number {
    return this.items.filter((i) => i.level === "NG").length;
  }
  print(title: string): void {
    for (const i of this.items) console.log(`[${i.level}] ${i.where}: ${i.msg}`);
    console.log(`${title}: NG ${this.ngCount} 件 / 注意 ${this.items.length - this.ngCount} 件`);
  }
}

// ---------- 設定 ----------

type Json = Record<string, unknown>;

/** 設定を読む。動画のフォルダ（cm.dir など）は設定ファイルのあるフォルダ（promo-video）から数える */
function loadConfig(file: string): { cfg: Json; file: string; base: string } {
  const abs = path.resolve(file);
  let cfg: Json;
  try {
    cfg = JSON.parse(fs.readFileSync(abs, "utf8")) as Json;
  } catch (e) {
    throw new CheckError(`設定ファイルを読めません: ${abs}（${(e as Error).message}）`);
  }
  return { cfg, file: abs, base: path.dirname(abs) };
}

function get(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const k of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

/** 設定の中の埋め残し（〔 〕） */
export function configPlaceholders(cfg: Json): string[] {
  const out: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (p === "$comment") return;
    if (typeof v === "string") {
      if (/[〔〕]/.test(v)) out.push(`${p} = ${v}`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, p ? `${p}.${k}` : k);
  };
  walk(cfg, "");
  return out;
}

// ---------- HTML の読み取り（依存なしの簡易パーサ。テンプレートの書式に合わせてある） ----------

export function stripComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

export function attrsOf(tag: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) m.set(x[1], x[2]);
  return m;
}

export function tagsOf(html: string, name: string): Array<Map<string, string>> {
  return [...stripComments(html).matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((x) => attrsOf(x[0]));
}

/** 「REPLACE」の印の行。説明文の「REPLACE」（かぎ括弧で囲んだもの）は数えない */
export function replaceMarkers(src: string): number[] {
  const lines: number[] = [];
  src.split("\n").forEach((line, i) => {
    const hits = [...line.matchAll(/REPLACE/g)].filter((x) => line[(x.index ?? 0) - 1] !== "「");
    if (hits.length > 0) lines.push(i + 1);
  });
  return lines;
}

/** コメントを除いた本文から語を探し、行番号を返す */
export function findInBody(src: string, re: RegExp): number[] {
  const aligned = src
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines: number[] = [];
  aligned.split("\n").forEach((line, i) => {
    if (re.test(line)) lines.push(i + 1);
    re.lastIndex = 0;
  });
  return lines;
}

/** :root（dark なら html[data-theme="dark"] で上書き）の CSS 変数 */
export function themeVars(src: string, theme: "light" | "dark"): Map<string, string> {
  const m = new Map<string, string>();
  const put = (body: string) => {
    for (const x of body.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) m.set(x[1], x[2].trim().toLowerCase());
  };
  const root = /:root\s*{([^}]*)}/.exec(src);
  if (root) put(root[1]);
  if (theme === "dark") {
    const dark = /html\[data-theme=["']?dark["']?\]\s*{([^}]*)}/.exec(src);
    if (dark) put(dark[1]);
  }
  return m;
}

export function htmlTheme(src: string): "light" | "dark" {
  const tag = /<html\b[^>]*>/i.exec(stripComments(src));
  return tag && /\bdata-theme\s*=\s*["']?dark["']?/i.test(tag[0]) ? "dark" : "light";
}

/** WCAG 2 のコントラスト比（#rrggbb 2 つ） */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** data-credit-name の要素の中身（タグを除いた文字） */
export function creditTexts(src: string): string[] {
  return [...stripComments(src).matchAll(/<([a-z][\w-]*)\b[^>]*\bdata-credit-name\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2].replace(/<[^>]+>/g, "").trim());
}

// ---------- tts ----------

function cmdTts(a: Args): number {
  const rep = new Report();
  const cfgPath = a.single.get("config");
  if (!cfgPath) throw new CheckError("tts には --config <showcase.config.json> が必要です");
  const { cfg, base } = loadConfig(cfgPath);
  // 声の種類。tts.provider が無い設定（1.29.2 まで）は ElevenLabs とみなす
  const rawProvider = get(cfg, "tts.provider");
  if (rawProvider !== undefined && rawProvider !== "gemini" && rawProvider !== "elevenlabs") {
    rep.ng("設定 tts.provider", `gemini か elevenlabs です（今 ${JSON.stringify(rawProvider)}）。voice-choice.ts save で書き直す`);
  }
  const provider: "gemini" | "elevenlabs" = rawProvider === "gemini" ? "gemini" : "elevenlabs";
  const defaults = provider === "gemini" ? { id: DEFAULT_GEMINI.voice, model: DEFAULT_GEMINI.model } : { id: DEFAULT_VOICE.id, model: DEFAULT_VOICE.model };
  const voice = (get(cfg, "tts.voice") as string | undefined) ?? defaults.id;
  const model = (get(cfg, "tts.model") as string | undefined) ?? defaults.model;
  const label = provider === "gemini" ? "Gemini" : "ElevenLabs";
  const isDefault = provider === "elevenlabs" ? voice === DEFAULT_VOICE.id : voice === DEFAULT_GEMINI.voice;
  console.log(`[info] 設定の声: ${label}・voice ${voice}・model ${model}${isDefault ? `（既定の声${provider === "elevenlabs" ? ` ${DEFAULT_VOICE.name}` : ""}）` : ""}`);
  let scripts: string[] = [];
  const one = a.single.get("script");
  if (one) scripts = [path.resolve(one)];
  else {
    const nd = get(cfg, "intro.narrationDir");
    if (typeof nd !== "string") rep.ng("設定 intro.narrationDir", "未設定です（--script で台本を指定するか、設定に書く）");
    else {
      const dir = path.resolve(base, nd);
      if (!fs.existsSync(dir)) rep.ng("台本", `ナレーションのフォルダがありません: ${dir}`);
      else scripts = fs.readdirSync(dir).filter((f) => f.endsWith(".script.json")).sort().map((f) => path.join(dir, f));
      if (fs.existsSync(dir) && scripts.length === 0) rep.ng("台本", `${dir} に *.script.json がありません`);
    }
  }
  for (const s of scripts) {
    const where = path.basename(s);
    let spec: Json;
    try {
      spec = JSON.parse(fs.readFileSync(s, "utf8")) as Json;
    } catch (e) {
      rep.ng(where, `台本 JSON を読めません: ${(e as Error).message}`);
      continue;
    }
    const sp = spec.provider;
    const scriptProvider = sp === "gemini" ? "gemini" : sp === undefined || sp === "eleven" || sp === "elevenlabs" ? "elevenlabs" : null;
    if (scriptProvider === null) rep.ng(where, `台本の provider が分かりません（${JSON.stringify(sp)}）。Gemini なら "gemini"、ElevenLabs なら書かない`);
    else if (scriptProvider !== provider) {
      const tpl = provider === "gemini" ? "narration.script.gemini.example.json" : "narration.script.example.json";
      rep.ng(where, `台本の声の種類（${scriptProvider}）が設定（tts.provider ${provider}）と違います。templates/${tpl} の形で書き直す`);
    }
    const voices = new Set<string>();
    if (typeof spec.voice === "string") voices.add(spec.voice);
    const items = Array.isArray(spec.items) ? (spec.items as Json[]) : [];
    for (const it of items) if (typeof it?.voice === "string") voices.add(it.voice as string);
    if (voices.size === 0) rep.ng(where, "台本に voice がありません");
    for (const v of voices) if (v !== voice) rep.ng(where, `voice が設定と違います（台本 ${v} / 設定 tts.voice ${voice}）`);
    if (spec.model !== model) rep.ng(where, `model が設定と違います（台本 ${String(spec.model)} / 設定 tts.model ${model}）`);
    const unfilled = items.filter((it) => typeof it?.text === "string" && /[〔〕]/.test(it.text as string)).map((it) => String(it.id));
    if (unfilled.length > 0) rep.ng(where, `〔 〕の仮の原稿が残っています（${unfilled.join(", ")}）。そのまま送ると有料で読み上げてしまう`);
    const usesCredit = items.some((it) => typeof it?.text === "string" && (it.text as string).includes("{{credit}}"));
    const kana = get(cfg, "credit.kana");
    if (usesCredit && (typeof kana !== "string" || !kana.trim())) rep.ng(where, "台本に {{credit}} があるのに、設定の credit.kana がありません（credit.ts save）");
    if (!usesCredit) rep.warn(where, "台本に {{credit}} がありません（最後の場面で「せいさく、{{credit}}。」と読むのが決まり）");
    const chars = items.reduce((n, it) => n + (typeof it?.text === "string" ? [...(it.text as string)].length : 0), 0);
    if (rep.items.filter((i) => i.where === where && i.level === "NG").length === 0) console.log(`[OK] ${where}: ${items.length} 場面・約 ${chars} 字`);
  }
  const k = keyStatus(provider === "gemini" ? "GEMINI_API_KEY" : "ELEVENLABS_API_KEY");
  if (k.found) console.log(`[OK] ${label} のキー: ${k.source}にある（値は見ない）`);
  else rep.ng(`${label} のキー`, `見つかりません。references/setup.md「鍵を保存する」の ${label} の保存用コマンドを、受講生がアプリの中のターミナルで実行する`);
  rep.print("tts");
  return rep.ngCount > 0 ? 1 : 0;
}

// ---------- template ----------

function cmdTemplate(a: Args): number {
  const rep = new Report();
  const cfgPath = a.single.get("config");
  const loaded = cfgPath ? loadConfig(cfgPath) : null;
  const cfg = loaded?.cfg ?? {};
  const dirs = new Map<string, string>();
  if (loaded) {
    for (const p of configPlaceholders(cfg)) rep.ng("設定", `埋め残し: ${p}`);
    for (const role of ["cm", "intro", "stills"]) {
      const d = get(cfg, `${role}.dir`);
      if (typeof d === "string") dirs.set(path.resolve(loaded.base, d), role);
    }
  }
  for (const d of a.multi.get("dir") ?? []) dirs.set(path.resolve(d), "指定");
  if (dirs.size === 0) throw new CheckError("--config か --dir が必要です（--help）");
  const brand = (get(cfg, "brand") as Json | undefined) ?? {};
  const stTheme = get(cfg, "stills.theme") === "dark" ? "dark" : "light";
  const stBrand = stTheme === "dark" ? brand : ((get(cfg, "stills.brand") as Json | undefined) ?? {});
  if (loaded && stTheme === "light") {
    const bg = stBrand["--bg"];
    for (const k of ["--accent", "--ink"]) {
      const c = stBrand[k];
      if (typeof bg === "string" && typeof c === "string" && /^#[0-9a-f]{6}$/i.test(bg) && /^#[0-9a-f]{6}$/i.test(c)) {
        const r = contrastRatio(c, bg);
        if (r < 4.5) rep.ng("設定", `stills.brand の ${k}（${c}）と --bg（${bg}）のコントラスト比が ${r.toFixed(2)}（4.5 以上にする）`);
      }
    }
  }
  const credit = get(cfg, "credit.display");

  for (const [dir, role] of dirs) {
    if (!fs.existsSync(dir)) {
      rep.ng(dir, "フォルダがありません");
      continue;
    }
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(html|css)$/i.test(f))
      .map((f) => path.join(dir, f));
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      const rel = path.relative(loaded?.base ?? dir, f);
      const rm = replaceMarkers(src);
      if (rm.length > 0) rep.ng(rel, `REPLACE が残っています（行 ${rm.join(", ")}）。済んだ所は印を DONE に書き換える`);
      const ph = findInBody(src, /[〔〕]/g);
      if (ph.length > 0) rep.ng(rel, `〔 〕の仮の文言が残っています（行 ${ph.join(", ")}）`);
      const isStills = role === "stills";
      const vars = themeVars(src, isStills ? stTheme : "light");
      const want = isStills ? stBrand : brand;
      for (const [k, v] of Object.entries(want)) {
        if (typeof v !== "string" || v.includes("〔")) continue;
        const got = vars.get(k);
        if (got !== undefined && got !== v.toLowerCase()) rep.ng(rel, `色 ${k} が設定（${isStills ? (stTheme === "dark" ? "brand" : "stills.brand") : "brand"}）と違います（HTML ${got} / 設定 ${v}）`);
      }
      if (!/\.html$/i.test(f)) continue;
      if (isStills && /thumb\.css/.test(src) && htmlTheme(src) !== stTheme) {
        rep.ng(rel, `明暗が設定の stills.theme（${stTheme}）と違います（暗い地は <html lang="ja" data-theme="dark">、明るい地は data-theme を付けない）`);
      }
      const missing = new Set<string>();
      for (const tag of ["img", "video", "audio", "script", "link"]) {
        for (const at of tagsOf(src, tag)) {
          const ref = at.get("src") ?? at.get("href");
          if (!ref || /^(https?:|data:|#)/.test(ref)) continue;
          if (!fs.existsSync(path.resolve(dir, ref))) missing.add(ref);
        }
      }
      if (missing.size > 0) rep.ng(rel, `素材がありません（${missing.size} 件）: ${[...missing].join(" ")}`);
      if (role === "intro") {
        const texts = creditTexts(src);
        if (texts.length === 0) rep.ng(rel, "制作クレジット（data-credit-name）がありません。テンプレートの S6 を消さない");
        else if (typeof credit !== "string" || !credit.trim()) rep.ng("設定", "credit.display が空です（credit.ts save で会社名・屋号を入れる）");
        else for (const t of texts) if (t !== credit.trim()) rep.ng(rel, `制作クレジットが設定と違います（HTML「${t}」/ 設定「${credit}」）。credit.ts apply をやり直す`);
      }
      const root = tagsOf(src, "div").find((t) => t.get("id") === "root");
      if (role === "cm" && root) {
        const want = get(cfg, "cm.durationSeconds");
        const dur = Number(root.get("data-duration"));
        if (typeof want === "number" && dur !== want) rep.ng(rel, `#root の data-duration ${dur} が設定の cm.durationSeconds ${want} と違います`);
      }
    }
  }
  rep.print("template");
  return rep.ngCount > 0 ? 1 : 0;
}

// ---------- timing ----------

type Scene = { key: string; src: string; start: number; htmlDur: number; seconds: number; effective: number; basis: string };

function cmdTiming(a: Args): number {
  const rep = new Report();
  const loaded = a.single.get("config") ? loadConfig(a.single.get("config") as string) : null;
  const cfg = loaded?.cfg ?? {};
  const fromCfg = (k: string) => {
    const v = get(cfg, k);
    return typeof v === "string" && loaded ? path.resolve(loaded.base, v) : undefined;
  };
  const htmlPath = a.single.get("html") ? path.resolve(a.single.get("html") as string) : fromCfg("intro.dir") && path.join(fromCfg("intro.dir") as string, "index.html");
  if (!htmlPath) throw new CheckError("--html か --config が必要です");
  const metaDir = a.single.get("meta-dir") ? path.resolve(a.single.get("meta-dir") as string) : fromCfg("intro.narrationDir");
  const mp4s = (a.multi.get("mp4") ?? []).map((m) => path.resolve(m));
  if (!fs.existsSync(htmlPath)) throw new CheckError(`HTML がありません: ${htmlPath}`);
  const html = fs.readFileSync(htmlPath, "utf8");
  const htmlDir = path.dirname(htmlPath);
  const root = tagsOf(html, "div").find((t) => t.get("id") === "root");
  const videoSec = root ? Number(root.get("data-duration")) : NaN;
  if (!Number.isFinite(videoSec)) rep.ng("HTML", "#root の data-duration を読めません");

  const scenes: Scene[] = [];
  for (const t of tagsOf(html, "audio")) {
    const id = t.get("id") ?? "";
    if (!id.startsWith("vo-")) continue;
    const key = id.slice(3);
    const src = t.get("src") ?? "";
    const base = path.basename(src).replace(/\.wav$/i, "");
    const htmlWav = path.resolve(htmlDir, src);
    const metaFile = metaDir ? path.join(metaDir, `${base}.json`) : htmlWav.replace(/\.wav$/i, ".json");
    const wav = metaDir && fs.existsSync(path.join(metaDir, `${base}.wav`)) ? path.join(metaDir, `${base}.wav`) : htmlWav;
    let meta: Json = {};
    if (fs.existsSync(metaFile)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as Json;
      } catch (e) {
        rep.ng(key, `記録 JSON が壊れています: ${metaFile}（${(e as Error).message}）`);
        continue;
      }
    } else rep.warn(key, `記録 JSON がありません（${metaFile}）。wav から測ります`);
    if (!fs.existsSync(wav)) {
      rep.ng(key, `wav がありません: ${wav}`);
      continue;
    }
    const seconds = typeof meta.seconds === "number" ? meta.seconds : probeSeconds(wav);
    const effective = typeof meta.effectiveSeconds === "number" ? meta.effectiveSeconds : measureSpeech(wav).effectiveSeconds;
    if (fs.existsSync(htmlWav) && Math.abs(probeSeconds(htmlWav) - seconds) > 0.05) {
      rep.ng(key, `HTML の ${src}（${probeSeconds(htmlWav).toFixed(2)} 秒）と記録の wav（${seconds} 秒）が別物です（ナレーションのフォルダから写し直す）`);
    }
    scenes.push({ key, src, start: Number(t.get("data-start")), htmlDur: Number(t.get("data-duration")), seconds, effective, basis: typeof meta.effectiveSeconds === "number" ? "記録" : "wav から計算" });
  }
  if (scenes.length === 0) throw new CheckError(`ナレーションの <audio id="vo-…"> が見つかりません: ${htmlPath}`);
  console.log("場面 | data-start | 全長 | 話している長さ（正本） | HTML data-duration | 判定");
  let total = 0;
  let lastEnd = 0;
  const sorted = [...scenes].sort((x, y) => x.start - y.start);
  for (const [i, s] of sorted.entries()) {
    total += s.effective;
    lastEnd = Math.max(lastEnd, s.start + s.effective);
    const ok = Math.abs(s.htmlDur - s.effective) <= TOL.html;
    if (!ok) rep.ng(s.key, `HTML の data-duration ${s.htmlDur} 秒が、話している長さ ${s.effective} 秒と違います（<id>.json の effectiveSeconds に合わせる）`);
    const next = sorted[i + 1];
    if (next && s.start + s.effective > next.start + 0.001) rep.ng(s.key, `声が次の場面 ${next.key} の声（${next.start} 秒）と重なっています（${(s.start + s.effective).toFixed(2)} 秒まで話す）`);
    console.log(`${s.key} | ${s.start} | ${s.seconds} | ${s.effective}（${s.basis}） | ${s.htmlDur} | ${ok ? "OK" : "NG"}`);
  }
  console.log(`ナレーションの合計（話している長さの和）: ${round(total, 2)} 秒`);
  console.log(`動画の長さ（#root の data-duration）: ${videoSec} 秒`);
  if (lastEnd > videoSec + TOL.html) rep.ng("動画の長さ", `最後の声の終わり ${lastEnd.toFixed(2)} 秒が動画の長さ ${videoSec} 秒を超えています`);
  for (const m of mp4s) {
    if (!fs.existsSync(m)) {
      rep.ng("書き出し", `mp4 がありません: ${m}`);
      continue;
    }
    const d = probeSeconds(m);
    const ok = Math.abs(d - videoSec) <= TOL.mp4;
    console.log(`書き出し（${m}）: ${d.toFixed(3)} 秒 ${ok ? "OK" : "NG"}`);
    if (!ok) rep.ng("書き出し", `${path.basename(m)} の長さ ${d.toFixed(3)} 秒が動画の長さ ${videoSec} 秒と ±${TOL.mp4} 秒で合いません`);
  }
  rep.print("timing");
  return rep.ngCount > 0 ? 1 : 0;
}

// ---------- thumb ----------

export const THUMB = { file: "thumb-ogp.png", w: 1200, h: 630, layout: "thumb-layout.json", sources: ["thumb.html", "thumb.css", "thumb.js"] };

function probeSize(file: string): { w: number; h: number } | null {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  const [w, h] = r.stdout.trim().split(",").map(Number);
  return w && h ? { w, h } : null;
}

const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function cmdThumb(a: Args): number {
  const rep = new Report();
  const loaded = a.single.get("config") ? loadConfig(a.single.get("config") as string) : null;
  const stillsRel = loaded ? get(loaded.cfg, "stills.dir") : undefined;
  const dir = a.single.get("dir") ? path.resolve(a.single.get("dir") as string) : loaded && typeof stillsRel === "string" ? path.resolve(loaded.base, stillsRel) : null;
  if (!dir) throw new CheckError("--config（stills.dir を使う）か --dir <stills のフォルダ> が必要です");
  const final = path.join(dir, "final");
  const f = path.join(final, THUMB.file);
  if (!fs.existsSync(f)) rep.ng(THUMB.file, `ありません（${f}）。node tools/render.ts で書き出す`);
  else {
    const s = probeSize(f);
    if (!s) rep.ng(THUMB.file, "ffprobe で寸法を読めません");
    else if (s.w !== THUMB.w || s.h !== THUMB.h) rep.ng(THUMB.file, `${s.w}x${s.h} です（${THUMB.w}x${THUMB.h} にする）`);
    else console.log(`[OK] ${THUMB.file} ${s.w}x${s.h} ${(fs.statSync(f).size / 1024).toFixed(1)}KB`);
  }
  const lf = path.join(final, THUMB.layout);
  if (!fs.existsSync(lf)) rep.ng(THUMB.layout, `ありません（${lf}）。node tools/render.ts で書き出す`);
  else {
    let rec: { sources?: Record<string, string>; layout?: { pass?: boolean; issues?: string[] } } = {};
    try {
      rec = JSON.parse(fs.readFileSync(lf, "utf8"));
    } catch (e) {
      rep.ng(THUMB.layout, `読めません（${(e as Error).message}）`);
    }
    if (rec.layout?.pass !== true) rep.ng(THUMB.layout, `配置の検査が不合格か、結果がありません: ${(rec.layout?.issues ?? []).join(" / ")}`);
    else console.log("[OK] 配置の検査（端末が枠内・文字と端末が重ならない・画面の中身を隠さない）");
    for (const s of THUMB.sources) {
      const want = rec.sources?.[s];
      const p = path.join(dir, s);
      if (!want) rep.ng(THUMB.layout, `${s} の指紋がありません`);
      else if (!fs.existsSync(p)) rep.ng(s, `ありません（${p}）`);
      else if (sha256(p) !== want) rep.ng(s, "書き出しの後に直されています。node tools/render.ts をやり直す");
    }
  }
  rep.print("thumb");
  return rep.ngCount > 0 ? 1 : 0;
}

// ---------- 入口 ----------

const HELP = `showcase-check.ts — showcase-video の検査（読み取り専用。ファイルを書き換えない）

  node showcase-check.ts tts --config <showcase.config.json> [--script <台本.json>]
      声を作る前に回す。NG: 台本の声の種類・voice・model が設定と違う／{{credit}} があるのに credit.kana が無い／声の種類（tts.provider）に合うキーが無い（値は見ない）

  node showcase-check.ts template --config <showcase.config.json> [--dir <フォルダ> ...]
      書き出しの前に回す。NG: 設定の〔 〕／REPLACE の印／本文の〔 〕／色が設定と違う／
      素材が無い／紹介動画の制作クレジットが無い・設定と違う／15 秒動画の長さが設定と違う

  node showcase-check.ts timing (--config <json> | --html <紹介動画の index.html>) [--meta-dir <narration のフォルダ>] [--mp4 <書き出した mp4> ...]
      正本 = 各 <audio id="vo-sN"> の wav の話している長さ（<id>.json の effectiveSeconds）。
      NG: HTML の data-duration が正本と ±${TOL.html} 秒で合わない／声が次の場面の声と重なる／最後の声が動画の長さを超える／mp4 の長さが動画の長さと ±${TOL.mp4} 秒で合わない

  node showcase-check.ts thumb (--config <json> | --dir <stills のフォルダ>)
      NG: final/${THUMB.file} が無い・${THUMB.w}x${THUMB.h} でない／配置の検査が不合格／書き出しの後に ${THUMB.sources.join("・")} を直した

終了コード: 0 NG なし / 1 NG あり・引数の誤り`;

function main(): number {
  ensureFfmpegOnPath(); // ffmpeg を入れたあとアプリが古い PATH のままでも動くように（lib/ffpath.mjs）
  const a = parseArgs(process.argv.slice(2));
  switch (a.cmd) {
    case "help":
      console.log(HELP);
      return 0;
    case "tts":
      return cmdTts(a);
    case "template":
      return cmdTemplate(a);
    case "timing":
      return cmdTiming(a);
    case "thumb":
      return cmdThumb(a);
    default:
      throw new CheckError(`知らないサブコマンドです: ${a.cmd}`);
  }
}

function isEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return fs.realpathSync(argv1) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (isEntry()) {
  try {
    process.exit(main());
  } catch (e) {
    if (e instanceof CheckError || e instanceof AudioMeasureError) console.error(`[showcase-check] ${e.message}`);
    else console.error(`[showcase-check] 想定外のエラー: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(1);
  }
}
