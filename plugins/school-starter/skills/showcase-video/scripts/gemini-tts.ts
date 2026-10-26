// Gemini の読み上げ（Gemini 3.8 Flash TTS・Interactions API）で、紹介動画のナレーションを WAV に書き出す。
// 出力の置き場・名前・形（<id>.wav 24kHz mono 16bit・−16 LUFS と <id>.json）は eleven-tts.ts と同じ。後の手順はそのまま使える。
//
// 実行（Node 22.18 以降。npm の依存なし。要 ffmpeg / ffprobe）:
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gemini-tts.ts" --help
//
// 公式ドキュメント（呼び出しの形は 2026-09-26 に確認したもの）:
//   https://ai.google.dev/gemini-api/docs/speech-generation
//   https://ai.google.dev/gemini-api/docs/pricing
//   https://ai.google.dev/gemini-api/docs/rate-limits
//
// 方針:
//   - キーは 環境変数 → 共通の置き場（~/.config/school-starter/credentials.env）の GEMINI_API_KEY。
//     このプロセスの中で使うだけで、画面・ログ・記録 JSON には出さない（出口は redact の 1 つ）。
//     URL の ?key= は使わず x-goog-api-key ヘッダで渡す（エラーで URL が出ても漏れない）
//   - 台本の {{credit}} は、設定（showcase.config.json）の credit.kana（読み）に置き換えてから送る
//   - 呼び出しは 1 本ずつ・6.5 秒あける（1 分あたりの回数の上限対策）
//   - 1 日の上限（429）に当たったら、長く待たずにすぐ止まる（終了コード 5）。Retry-After が長いときも待たない
//   - 無料枠では、送った原稿が Google の品質改善に使われる。お客様の実名や秘密は台本に入れない

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic, tmpPathFor } from "./lib/atomic.ts";
import { ensureFfmpegOnPath } from "./lib/ffpath.mjs";
import {
  measureSpeech,
  probeSeconds,
  AudioMeasureError,
  EFFECTIVE_NOISE_DB,
  EFFECTIVE_MIN_SILENCE_SEC,
  TAIL_NOISE_MAX_SEC,
  TAIL_NOISE_MAX_PEAK_DB,
} from "./lib/audio.ts";
import { loudnessProblems, measureLoudness, normalizeLoudness } from "./lib/eleven-client.ts";
import { SAVE_HINT, findKey, redactKeys } from "./lib/keys.ts";
import { UsageError, applyCreditToken, creditKanaFromConfig } from "./eleven-tts.ts";

// 引数・台本の誤りは eleven-tts.ts と同じ型で止める（{{credit}} の置き換えを共有しているため）
export { UsageError };

export const PREMISE_EXIT = 5;
export const OUTPUT_SAMPLE_RATE = 24000;
export const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_GEMINI = { voice: "ja-jp-advisor-3", model: "gemini-3.8-flash-tts" };
/** 1 分あたりの回数の上限に当たらないよう、生成の呼び出しのあいだを 6.5 秒あける */
export const MIN_INTERVAL_MS = 6500;
/** 分単位の 429・5xx を取り直す回数 */
export const MAX_RETRIES = 3;
/** 取り直しで待つのは最大これだけ。Retry-After がこれより長ければ 1 日の上限とみなして止まる */
export const MAX_WAIT_MS = 60000;
/** --dry-run の見込みの読む速さ（字/秒）。最初の 1 本を作ったら実際の字/秒で引き直す */
export const CHARS_PER_SEC = 6;
const ERROR_BODY_MAX = 600;

/** 前提の問題（キーが無い・1 日の上限・無料枠が使えない・キーが無効）。終了コード 5 */
export class GeminiStop extends Error {}

const SWITCH_HINT =
  "選べること: ① 明日もう一度同じコマンドを実行する（作り終えた場面は作り直さないので、続きから作れます） " +
  "② ElevenLabs の Starter（月 6 ドル）以上に切り替える（設定と台本を ElevenLabs 用にして全場面を作り直す。references/script-and-voice.md「声を選ぶ」）。どちらにするかは受講生が決めます";

// ---------- 鍵（値はこのプロセスの中だけ） ----------

let activeKey: string | null = null;
export function redact(x: unknown): string {
  const s = x instanceof Error ? x.message : String(x);
  return redactKeys(s, [activeKey]);
}

// ---------- 引数 ----------

const FLAGS = new Set(["help", "h", "force", "dry-run"]);
const VALUED = new Set(["script", "config"]);

export type Args = { script: string | null; config: string | null; force: boolean; dryRun: boolean; help: boolean };

export function parseArgs(argv: string[]): Args {
  const a: Args = { script: null, config: null, force: false, dryRun: false, help: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--") && raw !== "-h") throw new UsageError(`不明な引数です: ${raw}（--help で一覧）`);
    const name = raw === "-h" ? "h" : raw.slice(2);
    if (seen.has(name)) throw new UsageError(`--${name} が 2 回指定されています`);
    seen.add(name);
    if (FLAGS.has(name)) {
      if (name === "help" || name === "h") a.help = true;
      if (name === "force") a.force = true;
      if (name === "dry-run") a.dryRun = true;
      continue;
    }
    if (!VALUED.has(name)) throw new UsageError(`不明なオプションです: --${name}（声・model は台本 JSON に書きます。--help で一覧）`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new UsageError(`--${name} には値が必要です`);
    i++;
    if (name === "script") a.script = v;
    if (name === "config") a.config = v;
  }
  if (!a.help && !a.script) throw new UsageError("--script <台本.json> が必要です（--help で使い方）");
  return a;
}

// ---------- 台本 ----------

export type GeminiSpec = { model: string; voice: string; style: string };
export type Job = { id: string; index: number; text: string; out: string; spec: GeminiSpec };

export const SCRIPT_KEYS = ["provider", "model", "voice", "style", "outDir", "items"];

export function jobsFromScript(scriptPath: string, creditKana: string | null = null): { jobs: Job[]; outDir: string } {
  const abs = path.resolve(scriptPath);
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(fs.readFileSync(abs, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new UsageError(`台本 JSON を読めません: ${abs}\n${(e as Error).message}`);
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new UsageError(`台本 JSON の形が違います: ${abs}`);
  if (spec.provider !== "gemini") {
    throw new UsageError(
      `この台本は Gemini 用ではありません（provider が ${JSON.stringify(spec.provider ?? null)}）。` +
        'Gemini の台本は templates/narration.script.gemini.example.json を写して作ります（"provider": "gemini"）。ElevenLabs の台本なら eleven-tts.ts を使います',
    );
  }
  const unknownKeys = Object.keys(spec).filter((k) => !SCRIPT_KEYS.includes(k));
  if (unknownKeys.length > 0) throw new UsageError(`台本 JSON に知らない項目があります: ${unknownKeys.join(", ")}`);
  if (typeof spec.model !== "string" || !spec.model.trim()) throw new UsageError("台本 JSON の model が空です");
  if (spec.style !== undefined && typeof spec.style !== "string") throw new UsageError("台本 JSON の style は文字です（英語の演技の指示。空でよい）");
  const items = spec.items;
  if (!Array.isArray(items) || items.length === 0) throw new UsageError("台本 JSON に items がありません");
  const outDir = path.resolve(path.dirname(abs), typeof spec.outDir === "string" ? spec.outDir : ".");
  const ids = new Set<string>();
  const jobs: Job[] = [];
  for (const [i, it] of (items as Array<Record<string, unknown>>).entries()) {
    if (!it || typeof it !== "object") throw new UsageError(`items[${i}] が正しくありません`);
    const bad = Object.keys(it).filter((k) => !["id", "text", "voice", "style"].includes(k));
    if (bad.length > 0) throw new UsageError(`items[${i}] に知らない項目があります: ${bad.join(", ")}`);
    const id = it.id;
    if (typeof id !== "string" || !/^[\w.-]+$/.test(id)) throw new UsageError(`items[${i}].id が不正です（英数字・_ . - のみ）: ${String(id)}`);
    if (ids.has(id)) throw new UsageError(`items の id が重複しています: ${id}`);
    ids.add(id);
    if (typeof it.text !== "string" || !it.text.trim()) throw new UsageError(`items[${i}].text が空です`);
    if (/[〔〕]/.test(it.text)) throw new UsageError(`items[${i}]（${id}）に〔 〕の仮の原稿が残っています。原稿を書いてから送ります（1 回も呼んでいません）`);
    const text = applyCreditToken(it.text, creditKana, `items[${i}]（${id}）`);
    const voice = typeof it.voice === "string" && it.voice ? it.voice : spec.voice;
    if (typeof voice !== "string" || !voice) throw new UsageError(`items[${i}] の声が決まっていません（voice を指定してください）`);
    const style = typeof it.style === "string" ? it.style : typeof spec.style === "string" ? spec.style : "";
    jobs.push({ id, index: i, text, out: path.join(outDir, `${id}.wav`), spec: { model: spec.model, voice, style } });
  }
  return { jobs, outDir };
}

/** 原稿と、読みと出力に効く設定を全部入れたキャッシュキー */
export function cacheKey(job: Job): string {
  const material = JSON.stringify({
    provider: "gemini",
    model: job.spec.model,
    voice: job.spec.voice,
    style: job.spec.style,
    text: job.text,
    format: "audio/wav",
    sampleRate: OUTPUT_SAMPLE_RATE,
  });
  return createHash("sha256").update(material).digest("hex");
}

export const metaPath = (out: string) => out.replace(/\.wav$/i, "") + ".json";
export const charsOf = (s: string) => [...s].length;

export type CacheState = { kind: "hit" } | { kind: "generate"; reason: string };

/** キャッシュの状態。壊れた記録は黙って作り直さず止める（--force で作り直し） */
export function inspectCache(out: string, key: string, force: boolean): CacheState {
  const mp = metaPath(out);
  const hasWav = fs.existsSync(out);
  const hasMeta = fs.existsSync(mp);
  if (force) return { kind: "generate", reason: "--force" };
  if (!hasWav && !hasMeta) return { kind: "generate", reason: "未生成" };
  if (hasWav && !hasMeta) throw new UsageError(`${out} はあるのに記録 ${mp} がありません。作り直すなら --force（1 日の回数を使います）`);
  if (!hasWav && hasMeta) throw new UsageError(`記録 ${mp} はあるのに ${out} がありません。作り直すなら --force（1 日の回数を使います）`);
  let meta: { cacheKey?: unknown };
  try {
    meta = JSON.parse(fs.readFileSync(mp, "utf8")) as { cacheKey?: unknown };
  } catch {
    throw new UsageError(`記録 ${mp} が壊れています。作り直すなら --force（1 日の回数を使います）`);
  }
  if (typeof meta?.cacheKey !== "string") throw new UsageError(`記録 ${mp} に cacheKey がありません。作り直すなら --force`);
  return meta.cacheKey === key ? { kind: "hit" } : { kind: "generate", reason: "原稿か設定が変わった" };
}

// ---------- API の返事の分け方（純粋関数・テストあり） ----------

/** 429 の本文が「1 日の上限」を指しているか（per day / daily / PerDay） */
export function isDaily429(body: string): boolean {
  if (/per.?day|daily/i.test(body)) return true;
  const i = body.indexOf("{");
  if (i < 0) return false;
  try {
    const j = JSON.parse(body.slice(i)) as { error?: { details?: Array<{ violations?: Array<{ quotaId?: unknown; quotaMetric?: unknown }> }> } };
    for (const d of j?.error?.details ?? [])
      for (const v of d?.violations ?? []) {
        if (String(v?.quotaId ?? "").includes("PerDay") || String(v?.quotaMetric ?? "").includes("PerDay")) return true;
      }
  } catch {
    /* JSON でない本文は上の正規表現だけで決める */
  }
  return false;
}

/** 無料枠でこのモデルを使えない（上限が 0）ことを指しているか */
export function isZeroLimit(body: string): boolean {
  return /limit:\s*0\b|free.?tier.*(not|unavailable)|not available.*free/i.test(body);
}

/** Retry-After（秒 or 日付）を ms にする。読めなければ null */
export function retryAfterMs(h: string | null, now = Date.now()): number | null {
  if (!h) return null;
  const s = Number(h);
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(0, t - now) : null;
}

export type Decision = { kind: "retry"; waitMs: number } | { kind: "stop-premise"; message: string } | { kind: "fail"; message: string };

/**
 * 失敗した返事を受けて、次にどうするかを決める。tries = この場面でこれまでに受けた失敗の回数（今回を含む）
 * 1 日の上限・無料枠が使えない・キーの問題は「止まる（終了コード 5）」。分単位の 429・5xx だけ短く待って取り直す
 */
export function decideFailure(status: number, body: string, retryAfter: string | null, tries: number): Decision {
  const short = body.slice(0, ERROR_BODY_MAX);
  if (status === 429) {
    if (isZeroLimit(body)) {
      return {
        kind: "stop-premise",
        message:
          `Gemini: このキーでは読み上げのモデルの上限が 0 回でした（HTTP 429）。無料枠でこのモデルが使えない可能性があります。` +
          `Google AI Studio の「Rate limit」の画面（https://aistudio.google.com/rate-limit）で、このモデルの 1 日の回数を確かめてください。\n${SWITCH_HINT}\n${short}`,
      };
    }
    const wait = retryAfterMs(retryAfter);
    const daily = isDaily429(body) || (wait !== null && wait > MAX_WAIT_MS) || tries > MAX_RETRIES;
    if (daily) {
      return {
        kind: "stop-premise",
        message:
          `Gemini: 今日の読み上げの回数の上限に達しました（HTTP 429）。待たずに止めます。上限は太平洋時間の 0 時（日本時間の夕方 16〜17 時）に戻ります。\n${SWITCH_HINT}\n${short}`,
      };
    }
    return { kind: "retry", waitMs: Math.min(wait ?? MIN_INTERVAL_MS * 2 ** (tries - 1), MAX_WAIT_MS) };
  }
  if (status === 400 && /api.?key.*(not valid|invalid)|API_KEY_INVALID/i.test(body)) {
    return { kind: "stop-premise", message: "Gemini: キーが無効です（HTTP 400）。Google AI Studio で新しいキーを作り、保存し直してください（references/setup.md「鍵を保存する」）" };
  }
  if (status === 401 || status === 403) {
    return {
      kind: "stop-premise",
      message: `Gemini: このキーでは使えませんでした（HTTP ${status}）。キーを作り直して保存し直すか、Google AI Studio でこのキーのプロジェクトが使える状態かを確かめてください\n${short}`,
    };
  }
  if (status >= 500 && status <= 599) {
    if (tries > MAX_RETRIES) return { kind: "fail", message: `Gemini: HTTP ${status} が ${MAX_RETRIES} 回続いたので止めます。しばらくしてからもう一度実行してください\n${short}` };
    return { kind: "retry", waitMs: Math.min(MIN_INTERVAL_MS * 2 ** (tries - 1), MAX_WAIT_MS) };
  }
  return { kind: "fail", message: `Gemini: HTTP ${status} で止めます\n${short}` };
}

// ---------- 呼び出し（テストで fetch・sleep・now を差し替える） ----------

export type RequestDeps = { fetch: typeof fetch; sleep: (ms: number) => Promise<void>; now: () => number; log: (s: string) => void };
const defaultDeps = (): RequestDeps => ({
  fetch: (...a) => fetch(...a),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  log: (s) => console.error(s),
});

export type CallState = { lastCallAt: number };

/** 1 場面を 1 回呼ぶ（間隔・取り直しつき）。返事の JSON を返す */
export async function requestSpeech(
  o: { base: string; key: string; body: unknown; timeoutMs: number; state: CallState },
  deps: RequestDeps = defaultDeps(),
): Promise<unknown> {
  for (let tries = 1; ; tries++) {
    const wait = o.state.lastCallAt + MIN_INTERVAL_MS - deps.now();
    if (o.state.lastCallAt > 0 && wait > 0) await deps.sleep(wait);
    o.state.lastCallAt = deps.now();
    let res: Response;
    try {
      res = await deps.fetch(`${o.base}/interactions`, {
        method: "POST",
        headers: { "x-goog-api-key": o.key, "Content-Type": "application/json" },
        body: JSON.stringify(o.body),
        signal: AbortSignal.timeout(o.timeoutMs),
      });
    } catch (e) {
      if (tries <= 1) {
        deps.log(`  … つながりませんでした。${(MIN_INTERVAL_MS / 1000).toFixed(1)} 秒後に 1 回だけ取り直します`);
        await deps.sleep(MIN_INTERVAL_MS);
        continue;
      }
      throw new Error(`Gemini に接続できませんでした（ネットワークを確かめてください）: ${redact(e)}`);
    }
    const text = await res.text();
    if (res.ok) {
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Gemini の返事が JSON ではありません（HTTP ${res.status}）`);
      }
    }
    const d = decideFailure(res.status, text, res.headers.get("retry-after"), tries);
    if (d.kind === "stop-premise") throw new GeminiStop(d.message);
    if (d.kind === "fail") throw new Error(d.message);
    deps.log(`  … HTTP ${res.status}。${(d.waitMs / 1000).toFixed(1)} 秒後に取り直します（${tries}/${MAX_RETRIES}）`);
    await deps.sleep(d.waitMs);
  }
}

/** 送る本文（Interactions API）。演技の指示 style は英語で annotations に入れる */
export function requestBody(job: Job): Record<string, unknown> {
  const content: Record<string, unknown> = { type: "text", text: job.text };
  if (job.spec.style) content.annotations = [{ type: "speech_metadata", style: job.spec.style }];
  return {
    model: job.spec.model,
    input: [{ type: "user_input", content: [content] }],
    response_format: { type: "audio", mime_type: "audio/wav" },
    generation_config: { speech_config: [{ voice: job.spec.voice }] },
  };
}

type Step = { type?: string; content?: Array<{ type?: string; data?: string }> };

/** 返事から音声（最後の audio）を取り出す */
export function extractAudio(resp: unknown): Buffer {
  const steps = (resp as { steps?: Step[] } | null)?.steps;
  if (!Array.isArray(steps)) throw new Error("Gemini の返事に steps がありません（呼び出しの形が変わった可能性）");
  const audios = steps
    .filter((s) => s?.type === "model_output")
    .flatMap((s) => s.content ?? [])
    .filter((c) => c?.type === "audio" && typeof c.data === "string");
  const last = audios[audios.length - 1];
  if (!last?.data) throw new Error("Gemini の返事に音声がありません（原稿が安全のための制限に当たった可能性。原稿を言い換えて 1 回だけ試す）");
  return Buffer.from(last.data, "base64");
}

/** 返ってきた WAV の形を確かめる（PCM・モノラル・16bit） */
export function parseWav(buf: Buffer): { sampleRate: number; seconds: number } {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("返ってきた音声が WAV ではありません");
  let off = 12;
  let fmt: { format: number; channels: number; sampleRate: number; bits: number } | null = null;
  let dataBytes = -1;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      fmt = { format: buf.readUInt16LE(body), channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      dataBytes = size === 0 || size === 0xffffffff || body + size > buf.length ? buf.length - body : size;
      break;
    }
    off = body + size + (size % 2);
  }
  if (!fmt) throw new Error("WAV に fmt がありません");
  if (dataBytes <= 0) throw new Error("WAV に音のデータがありません");
  if (fmt.format !== 1 || fmt.channels !== 1 || fmt.bits !== 16) throw new Error(`WAV の形が想定と違います（format=${fmt.format}・channels=${fmt.channels}・bits=${fmt.bits}）`);
  return { sampleRate: fmt.sampleRate, seconds: dataBytes / (fmt.sampleRate * 2) };
}

// ---------- 生成 ----------

type RunCtx = { key: string; base: string; timeoutMs: number; state: CallState };

async function generate(job: Job, ctx: RunCtx): Promise<void> {
  const key = cacheKey(job);
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  const started = Date.now();
  const resp = await requestSpeech({ base: ctx.base, key: ctx.key, body: requestBody(job), timeoutMs: ctx.timeoutMs, state: ctx.state });
  const wav = extractAudio(resp);
  const info = parseWav(wav);
  const tmpApi = tmpPathFor(job.out) + ".api.wav";
  const tmpWav = tmpPathFor(job.out);
  try {
    fs.writeFileSync(tmpApi, wav);
    // 音量を ElevenLabs の声と同じ −16 LUFS にそろえ、24kHz mono 16bit で書く
    normalizeLoudness(tmpApi, tmpWav, { sampleRate: OUTPUT_SAMPLE_RATE, channels: 1 });
    const seconds = probeSeconds(tmpWav);
    const span = measureSpeech(tmpWav);
    const loud = measureLoudness(tmpWav);
    const bad = loudnessProblems(loud, seconds);
    if (bad.length > 0) throw new Error(`${job.id}: 音量の正規化が効いていません（${bad.join("・")}）`);
    const usage = (resp as { usage?: unknown }).usage ?? null;
    const meta = {
      cacheKey: key,
      provider: "gemini",
      model: job.spec.model,
      voice: job.spec.voice,
      style: job.spec.style,
      text: job.text,
      textChars: charsOf(job.text),
      apiSampleRate: info.sampleRate,
      outputSampleRate: OUTPUT_SAMPLE_RATE,
      channels: 1,
      seconds: Number(seconds.toFixed(3)),
      speechStart: Number(span.speechStart.toFixed(3)),
      speechEnd: Number(span.speechEnd.toFixed(3)),
      effectiveSeconds: span.effectiveSeconds,
      effectiveBasis:
        `silencedetect noise=${EFFECTIVE_NOISE_DB}dB d=${EFFECTIVE_MIN_SILENCE_SEC}s の末尾の無音の始まり` +
        `（その後ろの ${TAIL_NOISE_MAX_SEC} 秒以下・ピーク ${TAIL_NOISE_MAX_PEAK_DB}dB 以下の音は雑音として無視）`,
      ignoredTailNoise: span.ignoredTail,
      usage,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      loudnessI: Number(loud.loudnessI.toFixed(2)),
      samplePeakDb: Number(loud.samplePeakDb.toFixed(2)),
      truePeakDb: Number(loud.truePeakDb.toFixed(2)),
    };
    // wav を先に置き、記録を後に置く（記録だけ新しい＝古い音声でキャッシュ命中、を作らない）
    fs.renameSync(tmpWav, job.out);
    writeFileAtomic(metaPath(job.out), JSON.stringify(meta, null, 2) + "\n");
    console.log(`[ok] ${job.out}  ${seconds.toFixed(2)} 秒（話している長さ ${span.effectiveSeconds.toFixed(2)} 秒）  ${meta.textChars} 字  ${loud.loudnessI.toFixed(1)} LUFS`);
  } finally {
    for (const f of [tmpApi, tmpWav]) fs.rmSync(f, { force: true });
  }
}

// ---------- 入口 ----------

const HELP = `gemini-tts.ts — Gemini の読み上げで紹介動画のナレーションを WAV に書き出す（既定の声 ${DEFAULT_GEMINI.voice}・${DEFAULT_GEMINI.model}）

使い方:
  node gemini-tts.ts --script <narration.script.json> [--config <showcase.config.json>] [--dry-run] [--force]
      台本の items を 1 件ずつ生成し、outDir/<id>.wav（24kHz mono 16bit・−16 LUFS）と <id>.json を出す（eleven-tts.ts と同じ形）

  --config <file>   台本の {{credit}} を、この設定の credit.kana（読み）に置き換えてから送る
  --dry-run         API を呼ばず、キーも読まず、呼び出しの回数・文字数・見込みの長さだけ出す
  --force           作ってある音声を使わず作り直す（1 日の回数を使う）

台本 JSON（templates/narration.script.gemini.example.json）:
  { "provider": "gemini", "model": "${DEFAULT_GEMINI.model}", "voice": "${DEFAULT_GEMINI.voice}", "style": "",
    "outDir": ".", "items": [ { "id": "s1-hook", "text": "読みをかなで書いた原稿" } ] }

回数: 1 場面 = 1 回の呼び出し。呼び出しのあいだを ${MIN_INTERVAL_MS / 1000} 秒あける。
  分単位の 429・5xx は最大 ${MAX_RETRIES} 回だけ短く待って取り直す。1 日の上限の 429 は待たずに止まる（終了コード ${PREMISE_EXIT}）
無料枠: 送った原稿が Google の品質改善に使われる。お客様の実名や秘密は台本に入れない
キー: 環境変数 GEMINI_API_KEY → 共通の置き場（~/.config/school-starter/credentials.env）。値は画面に出さない
終了コード: 0 成功 / 1 失敗 / ${PREMISE_EXIT} キーが無い・1 日の上限・無料枠で使えない・キーが無効`;

async function main(): Promise<number> {
  ensureFfmpegOnPath(); // ffmpeg を入れたあとアプリが古い PATH のままでも動くように（lib/ffpath.mjs）
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const kana = args.config ? creditKanaFromConfig(args.config) : null;
  const { jobs } = jobsFromScript(args.script as string, kana);
  // 先に全部のキャッシュを調べる（壊れた記録があれば、1 回も呼ぶ前に止まる）
  const plan = jobs.map((job) => ({ job, state: inspectCache(job.out, cacheKey(job), args.force) }));
  const toGenerate = plan.filter((p) => p.state.kind === "generate");
  const needChars = toGenerate.reduce((n, p) => n + charsOf(p.job.text), 0);

  if (args.dryRun) {
    for (const { job, state } of plan) {
      console.log(state.kind === "hit" ? `[作成済み] ${job.out}` : `[生成] ${job.out}（${state.reason}・${charsOf(job.text)} 字・見込み ${(charsOf(job.text) / CHARS_PER_SEC).toFixed(1)} 秒）`);
    }
    console.log(
      `dry-run: 生成 ${toGenerate.length} 本（呼び出し ${toGenerate.length} 回。取り直しがあれば 1 回ずつ増える）・作成済み ${plan.length - toGenerate.length} 本・` +
        `送る文字数 ${needChars}・見込みの長さ 約 ${(needChars / CHARS_PER_SEC).toFixed(1)} 秒・呼び出しの間隔を入れて最短 ${((Math.max(0, toGenerate.length - 1) * MIN_INTERVAL_MS) / 1000).toFixed(1)} 秒`,
    );
    console.log("無料枠では、送った原稿が Google の品質改善に使われます（お客様の実名や秘密を台本に入れない）。1 日の回数には上限があります");
    return 0;
  }

  let ctx: RunCtx | null = null;
  if (toGenerate.length > 0) {
    const found = findKey("GEMINI_API_KEY");
    if (!found) throw new GeminiStop(SAVE_HINT.GEMINI_API_KEY);
    activeKey = found.value;
    const t = Number(process.env.SHOWCASE_GEMINI_TIMEOUT_MS);
    ctx = {
      key: found.value,
      base: (process.env.SHOWCASE_GEMINI_API_BASE || GEMINI_DEFAULT_BASE).replace(/\/+$/, ""),
      timeoutMs: Number.isFinite(t) && t > 0 ? t : 120000,
      state: { lastCallAt: 0 },
    };
    console.log(`Gemini のキー: ${found.source}で見つけました`);
    console.log(`今回の生成 ${toGenerate.length} 本・${needChars} 字（1 本ずつ ${MIN_INTERVAL_MS / 1000} 秒あけて呼びます）`);
  }

  let total = 0;
  const generated: string[] = [];
  for (const { job, state } of plan) {
    if (state.kind === "generate" && ctx) {
      await generate(job, ctx);
      generated.push(job.id);
    } else {
      console.log(`[作成済み] ${job.out}  原稿と設定が同じなので作り直しません（--force で作り直し）`);
    }
    total += probeSeconds(job.out);
  }
  if (jobs.length > 1) console.log(`合計 ${jobs.length} 本 / ${total.toFixed(2)} 秒`);
  console.log(generated.length ? `今回生成した場面（読み間違いを確かめる対象）: ${generated.join(", ")}` : "今回生成した場面: なし（全部作成済み）");
  return 0;
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
  main()
    .then((code) => process.exit(code))
    .catch((e: unknown) => {
      // 出口は 1 つ。キーの値と AIza… を伏せてから出す
      if (e instanceof GeminiStop) {
        console.error(`[gemini-tts] ${redact(e.message)}`);
        process.exit(PREMISE_EXIT);
      }
      if (e instanceof UsageError || e instanceof AudioMeasureError) console.error(`[gemini-tts] ${redact(e.message)}`);
      else console.error(`[gemini-tts] 止めました: ${redact(e)}`);
      process.exit(1);
    });
}
