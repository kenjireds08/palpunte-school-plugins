// ElevenLabs で紹介動画のナレーションを WAV に書き出す（既定の声 Yuma Uchida・Eleven v4）。
//
// 実行（Node 22.18 以降。npm の依存なし。要 ffmpeg / ffprobe）:
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/eleven-tts.ts" --help
//
// 方針:
//   - キーは 環境変数 → 共通の置き場（~/.config/school-starter/credentials.env）の ELEVENLABS_API_KEY。
//     このプロセスの中で使うだけで、画面・ログ・記録 JSON には出さない（出口は redact の 1 つ）
//   - 台本の {{credit}} は、設定（showcase.config.json）の credit.kana（読み）に置き換えてから送る
//   - 残りは ElevenLabs の API（subscription）で確かめ、足りなければ 1 字も送らずに止まる（終了コード 5）
//   - 声が使えない（無料プランで Voice Library の声など）ときは止まって選び直しを案内する（終了コード 6）。
//     別の声へ勝手に切り替えない

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic, tmpPathFor } from "./lib/atomic.ts";
import {
  measureSpeech,
  probeSeconds,
  EFFECTIVE_NOISE_DB,
  EFFECTIVE_MIN_SILENCE_SEC,
  TAIL_NOISE_MAX_SEC,
  TAIL_NOISE_MAX_PEAK_DB,
} from "./lib/audio.ts";
import {
  DEFAULT_RETRY_WAIT_MS,
  DEFAULT_TIMEOUT_MS,
  ELEVEN_DEFAULT_BASE,
  ElevenStop,
  appendCreditsLog,
  elevenFetch,
  loudnessProblems,
  measureLoudness,
  normalizeLoudness,
  readElevenKey,
  readSubscription,
  redact,
  setActiveKey,
  sortKeys,
  usedChars,
  type ElevenSpec,
  type Subscription,
} from "./lib/eleven-client.ts";
import { SAVE_HINT } from "./lib/keys.ts";

export const PREMISE_EXIT = 5;
export const VOICE_EXIT = 6;
export const API_FORMAT = "mp3_44100_128";
export const OUTPUT_SAMPLE_RATE = 24000;
export const CREDIT_TOKEN = "{{credit}}";

export class UsageError extends Error {}

// ---------- 引数 ----------

const FLAGS = new Set(["help", "h", "force", "dry-run"]);
const VALUED = new Set(["script", "config", "max-credits"]);

export type Args = { script: string | null; config: string | null; force: boolean; dryRun: boolean; maxCredits: number | null; help: boolean };

export function parseArgs(argv: string[]): Args {
  const a: Args = { script: null, config: null, force: false, dryRun: false, maxCredits: null, help: false };
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
    if (name === "max-credits") {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0) throw new UsageError(`--max-credits は 1 以上の整数です: ${v}`);
      a.maxCredits = n;
    }
  }
  if (!a.help && !a.script) throw new UsageError("--script <台本.json> が必要です（--help で使い方）");
  return a;
}

// ---------- 制作クレジットの読み ----------

/** 設定から credit.kana（ナレーションで読む形）を取り出す。無ければ null */
export function creditKanaFromConfig(configPath: string): string | null {
  let c: { credit?: { kana?: unknown } };
  try {
    c = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8")) as typeof c;
  } catch (e) {
    throw new UsageError(`設定（showcase.config.json）を読めません: ${configPath}\n${(e as Error).message}`);
  }
  const k = c?.credit?.kana;
  return typeof k === "string" && k.trim() ? k.trim() : null;
}

/** 原稿の {{credit}} を読みに置き換える。{{credit}} があるのに読みが無ければ止める */
export function applyCreditToken(text: string, kana: string | null, where: string): string {
  if (!text.includes(CREDIT_TOKEN)) return text;
  if (!kana) {
    throw new UsageError(
      `${where} に ${CREDIT_TOKEN} がありますが、読み（credit.kana）が決まっていません。` +
        "設定（showcase.config.json）の credit.kana に会社名・屋号（と名前）の読みをひらがな・カタカナで書き、--config で渡してください",
    );
  }
  return text.split(CREDIT_TOKEN).join(kana);
}

// ---------- 台本 ----------

export type Job = { id: string; index: number; text: string; out: string; spec: ElevenSpec };

type ScriptSpec = {
  model?: unknown;
  voice?: unknown;
  languageCode?: unknown;
  textNormalization?: unknown;
  voiceSettings?: unknown;
  outDir?: unknown;
  items?: Array<Record<string, unknown>>;
};

export const SCRIPT_KEYS = ["provider", "model", "voice", "languageCode", "textNormalization", "voiceSettings", "outDir", "items"];

export function jobsFromScript(scriptPath: string, creditKana: string | null = null): { jobs: Job[]; outDir: string } {
  const abs = path.resolve(scriptPath);
  let spec: ScriptSpec & { provider?: unknown };
  try {
    spec = JSON.parse(fs.readFileSync(abs, "utf8")) as ScriptSpec;
  } catch (e) {
    throw new UsageError(`台本 JSON を読めません: ${abs}\n${(e as Error).message}`);
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new UsageError(`台本 JSON の形が違います: ${abs}`);
  if (spec.provider !== undefined && spec.provider !== "eleven") {
    throw new UsageError(`この台本は provider が ${JSON.stringify(spec.provider)} です。このスキルの読み上げは ElevenLabs だけです（provider は書かないか "eleven"）`);
  }
  const unknownKeys = Object.keys(spec).filter((k) => !SCRIPT_KEYS.includes(k));
  if (unknownKeys.length > 0) throw new UsageError(`台本 JSON に知らない項目があります: ${unknownKeys.join(", ")}`);
  const str = (v: unknown, name: string): string => {
    if (typeof v !== "string" || !v.trim()) throw new UsageError(`台本 JSON の ${name} が空です`);
    return v;
  };
  const model = str(spec.model, "model");
  const languageCode = str(spec.languageCode, "languageCode");
  const tn = spec.textNormalization as { key?: unknown; value?: unknown } | undefined;
  if (!tn || typeof tn !== "object" || typeof tn.key !== "string" || !tn.key || !("value" in tn)) {
    throw new UsageError('台本 JSON の textNormalization は { "key": "apply_text_normalization", "value": "off" } の形です');
  }
  const vs = spec.voiceSettings === undefined ? null : spec.voiceSettings;
  if (vs !== null && (typeof vs !== "object" || Array.isArray(vs))) {
    throw new UsageError("台本 JSON の voiceSettings は null か { stability, similarity_boost } です（null＝送らない）");
  }
  if (!Array.isArray(spec.items) || spec.items.length === 0) throw new UsageError("台本 JSON に items がありません");
  const outDir = path.resolve(path.dirname(abs), typeof spec.outDir === "string" ? spec.outDir : ".");
  const ids = new Set<string>();
  const jobs: Job[] = [];
  for (const [i, it] of spec.items.entries()) {
    if (!it || typeof it !== "object") throw new UsageError(`items[${i}] が正しくありません`);
    const bad = Object.keys(it).filter((k) => !["id", "text", "voice"].includes(k));
    if (bad.length > 0) throw new UsageError(`items[${i}] に知らない項目があります: ${bad.join(", ")}`);
    const id = it.id;
    if (typeof id !== "string" || !/^[\w.-]+$/.test(id)) throw new UsageError(`items[${i}].id が不正です（英数字・_ . - のみ）: ${String(id)}`);
    if (ids.has(id)) throw new UsageError(`items の id が重複しています: ${id}`);
    ids.add(id);
    if (typeof it.text !== "string" || !it.text.trim()) throw new UsageError(`items[${i}].text が空です`);
    if (/[〔〕]/.test(it.text)) throw new UsageError(`items[${i}]（${id}）に〔 〕の仮の原稿が残っています。原稿を書いてから送ります（1 字も送っていません）`);
    const text = applyCreditToken(it.text, creditKana, `items[${i}]（${id}）`);
    const voice = typeof it.voice === "string" && it.voice ? it.voice : spec.voice;
    if (typeof voice !== "string" || !voice) throw new UsageError(`items[${i}] の声が決まっていません（voice を指定してください）`);
    jobs.push({
      id,
      index: i,
      text,
      out: path.join(outDir, `${id}.wav`),
      spec: {
        voice,
        model,
        languageCode,
        textNormalization: { key: tn.key, value: tn.value },
        voiceSettings: (vs as Record<string, unknown> | null) ?? null,
        outputFormat: API_FORMAT,
      },
    });
  }
  return { jobs, outDir };
}

/** 原稿と、読みと出力に効く設定を全部入れたキャッシュキー */
export function cacheKey(job: Job): string {
  const s = job.spec;
  const material = JSON.stringify({
    provider: "eleven",
    model: s.model,
    voice: s.voice,
    languageCode: s.languageCode,
    textNormalization: sortKeys(s.textNormalization),
    voiceSettings: sortKeys(s.voiceSettings),
    text: job.text,
    apiFormat: s.outputFormat,
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
  if (hasWav && !hasMeta) throw new UsageError(`${out} はあるのに記録 ${mp} がありません。作り直すなら --force（クレジットを使います）`);
  if (!hasWav && hasMeta) throw new UsageError(`記録 ${mp} はあるのに ${out} がありません。作り直すなら --force（クレジットを使います）`);
  let meta: { cacheKey?: unknown };
  try {
    meta = JSON.parse(fs.readFileSync(mp, "utf8")) as { cacheKey?: unknown };
  } catch {
    throw new UsageError(`記録 ${mp} が壊れています。作り直すなら --force（クレジットを使います）`);
  }
  if (typeof meta?.cacheKey !== "string") throw new UsageError(`記録 ${mp} に cacheKey がありません。作り直すなら --force`);
  return meta.cacheKey === key ? { kind: "hit" } : { kind: "generate", reason: "原稿か設定が変わった" };
}

/** 残りと上限から、送ってよいかを決める（純粋関数・テストあり）。null なら送ってよい */
export function stopReason(o: { sub: Subscription | null; usedThisRun: number; need: number; maxCredits: number | null; usedTotal: number }): string | null {
  if (o.maxCredits !== null && o.usedTotal + o.need > o.maxCredits) {
    return (
      `上限（--max-credits ${o.maxCredits}）を超えるので送りません。この台本で使った分 ${o.usedTotal} 字＋次に送る ${o.need} 字。` +
      "増やすかどうかは、受講生本人に確かめてから決めます"
    );
  }
  if (o.sub) {
    const remaining = o.sub.limit - o.sub.count - o.usedThisRun;
    if (o.need > remaining) {
      return (
        `ElevenLabs の今月の残りが足りないので送りません（残り ${Math.max(0, remaining).toLocaleString("en-US")} 字・必要 ${o.need} 字）。` +
        "台本を短くするか、文字数が戻る日（ElevenLabs の画面の Subscription に出ます）まで待ちます。プランを上げるかどうかは本人が決めます"
      );
    }
  }
  return null;
}

// ---------- 生成 ----------

type RunCtx = {
  key: string;
  base: string;
  timeoutMs: number;
  retryWaitMs: number;
  gapMs: number;
  sub: Subscription | null;
  runChars: number;
  maxCredits: number | null;
  logFile: string;
  force: boolean;
  lastCallAt: number;
};

function makeGate(job: Job, chars: number, ctx: RunCtx) {
  return {
    reserve: async () => {
      const why = stopReason({ sub: ctx.sub, usedThisRun: ctx.runChars, need: chars, maxCredits: ctx.maxCredits, usedTotal: usedChars(ctx.logFile) });
      if (why) throw new ElevenStop("premise", why);
    },
    settle: async (attempt: number, result: string, ledger: "confirmed" | "refunded" | "uncertain") => {
      if (ledger === "confirmed" || ledger === "uncertain") ctx.runChars += chars;
      appendCreditsLog(ctx.logFile, { at: new Date().toISOString(), id: job.id, index: job.index, attempt, chars, result, ledger });
    },
  };
}

function ffmpegToWav(src: string, dst: string): void {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-ar", String(OUTPUT_SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", dst], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg での変換に失敗しました\n${redact(r.stderr ?? r.error?.message ?? "")}`);
}

async function generate(job: Job, ctx: RunCtx): Promise<void> {
  const key = cacheKey(job);
  fs.mkdirSync(path.dirname(job.out), { recursive: true });
  // 1 本ずつ・1 秒あける（無料プランは同時に作れる数が少ない）
  const wait = ctx.lastCallAt + ctx.gapMs - Date.now();
  if (ctx.lastCallAt > 0 && wait > 0) await new Promise((r) => setTimeout(r, wait));
  const chars = charsOf(job.text);
  const started = Date.now();
  ctx.lastCallAt = Date.now();
  const mp3 = await elevenFetch({
    text: job.text,
    spec: job.spec,
    key: ctx.key,
    base: ctx.base,
    timeoutMs: ctx.timeoutMs,
    retryWaitMs: ctx.retryWaitMs,
    gate: makeGate(job, chars, ctx),
  });
  const tmpMp3 = tmpPathFor(job.out) + ".api.mp3";
  const tmpRaw = tmpPathFor(job.out) + ".raw.wav";
  const tmpWav = tmpPathFor(job.out);
  try {
    fs.writeFileSync(tmpMp3, mp3);
    ffmpegToWav(tmpMp3, tmpRaw);
    normalizeLoudness(tmpRaw, tmpWav, { sampleRate: OUTPUT_SAMPLE_RATE, channels: 1 });
    const seconds = probeSeconds(tmpWav);
    const span = measureSpeech(tmpWav);
    const loud = measureLoudness(tmpWav);
    const bad = loudnessProblems(loud, seconds);
    if (bad.length > 0) throw new ElevenStop("failed", `${job.id}: 音量の正規化が効いていません（${bad.join("・")}）`);
    const meta = {
      cacheKey: key,
      provider: "eleven",
      model: job.spec.model,
      voice: job.spec.voice,
      text: job.text,
      textChars: chars,
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
      credits: chars,
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      languageCode: job.spec.languageCode,
      textNormalization: job.spec.textNormalization,
      voiceSettings: job.spec.voiceSettings,
      apiFormat: job.spec.outputFormat,
      loudnessI: Number(loud.loudnessI.toFixed(2)),
      samplePeakDb: Number(loud.samplePeakDb.toFixed(2)),
      truePeakDb: Number(loud.truePeakDb.toFixed(2)),
    };
    // wav を先に置き、記録を後に置く（記録だけ新しい＝古い音声でキャッシュ命中、を作らない）
    fs.renameSync(tmpWav, job.out);
    writeFileAtomic(metaPath(job.out), JSON.stringify(meta, null, 2) + "\n");
    console.log(`[ok] ${job.out}  ${seconds.toFixed(2)} 秒（話している長さ ${span.effectiveSeconds.toFixed(2)} 秒）  ${chars} 字  ${loud.loudnessI.toFixed(1)} LUFS`);
  } finally {
    for (const f of [tmpMp3, tmpRaw, tmpWav]) fs.rmSync(f, { force: true });
  }
}

// ---------- 入口 ----------

const HELP = `eleven-tts.ts — ElevenLabs で紹介動画のナレーションを WAV に書き出す（既定の声 Yuma Uchida・eleven_v4）

使い方:
  node eleven-tts.ts --script <narration.script.json> [--config <showcase.config.json>] [--max-credits <n>] [--dry-run] [--force]
      台本の items を 1 件ずつ生成し、outDir/<id>.wav（24kHz mono 16bit・−16 LUFS）と <id>.json を出す

  --config <file>     台本の {{credit}} を、この設定の credit.kana（読み）に置き換えてから送る
  --max-credits <n>   この台本で使う文字数の上限（これまでの分も足す）。超える前に送らずに止まる
  --dry-run           API を呼ばず、キーも読まず、生成する本数と文字数だけ出す
  --force             作ってある音声を使わず作り直す（文字数を使う）

台本 JSON:
  { "model": "eleven_v4", "voice": "EHMH9cyd1z3rXm4z0Jja", "languageCode": "ja",
    "textNormalization": { "key": "apply_text_normalization", "value": "off" }, "voiceSettings": null,
    "outDir": ".", "items": [ { "id": "s1-hook", "text": "読みをかなで書いた原稿" } ] }

文字数: 1 字 = 1 クレジットで数える。送る前に ElevenLabs の API で今月の残りを確かめ、足りなければ止まる
キー: 環境変数 ELEVENLABS_API_KEY → 共通の置き場（~/.config/school-starter/credentials.env）。値は画面に出さない
終了コード: 0 成功 / 1 失敗 / ${PREMISE_EXIT} 鍵・残り・上限の問題 / ${VOICE_EXIT} この声を使えない（voices.ts で選び直す）`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const kana = args.config ? creditKanaFromConfig(args.config) : null;
  const { jobs, outDir } = jobsFromScript(args.script as string, kana);
  const logFile = path.join(outDir, "credits-log.json");
  // 先に全部のキャッシュを調べる（壊れた記録があれば、1 字も使う前に止まる）
  const plan = jobs.map((job) => ({ job, state: inspectCache(job.out, cacheKey(job), args.force) }));
  const toGenerate = plan.filter((p) => p.state.kind === "generate");
  const needChars = toGenerate.reduce((n, p) => n + charsOf(p.job.text), 0);

  if (args.dryRun) {
    for (const { job, state } of plan) {
      console.log(state.kind === "hit" ? `[作成済み] ${job.out}` : `[生成] ${job.out}（${state.reason}・${charsOf(job.text)} 字）`);
    }
    console.log(`dry-run: 生成 ${toGenerate.length} 本・作成済み ${plan.length - toGenerate.length} 本・送る文字数 ${needChars}（この台本でこれまで使った分 ${usedChars(logFile)} 字）`);
    return 0;
  }

  let ctx: RunCtx | null = null;
  if (toGenerate.length > 0) {
    const found = readElevenKey();
    if (!found) throw new ElevenStop("premise", SAVE_HINT.ELEVENLABS_API_KEY);
    setActiveKey(found.value);
    const envMs = (name: string, fb: number) => {
      const v = Number(process.env[name]);
      return process.env[name] !== undefined && Number.isFinite(v) && v >= 0 ? v : fb;
    };
    ctx = {
      key: found.value,
      base: (process.env.SHOWCASE_ELEVEN_API_BASE || ELEVEN_DEFAULT_BASE).replace(/\/+$/, ""),
      timeoutMs: envMs("SHOWCASE_ELEVEN_TIMEOUT_MS", DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
      retryWaitMs: envMs("SHOWCASE_ELEVEN_RETRY_WAIT_MS", DEFAULT_RETRY_WAIT_MS),
      gapMs: envMs("SHOWCASE_ELEVEN_GAP_MS", 1000),
      sub: null,
      runChars: 0,
      maxCredits: args.maxCredits,
      logFile,
      force: args.force,
      lastCallAt: 0,
    };
    console.log(`ElevenLabs のキー: ${found.source}で見つけました`);
    ctx.sub = await readSubscription({ base: ctx.base, key: found.value, timeoutMs: Math.min(ctx.timeoutMs, 30000) });
    if (ctx.sub) {
      console.log(
        `ElevenLabs の今月の文字数: 使用 ${ctx.sub.count.toLocaleString("en-US")} / ${ctx.sub.limit.toLocaleString("en-US")}` +
          `（残り ${Math.max(0, ctx.sub.limit - ctx.sub.count).toLocaleString("en-US")}${ctx.sub.tier ? `・プラン ${ctx.sub.tier}` : ""}）`,
      );
    } else {
      console.log("ElevenLabs の残りを読めませんでした（鍵に「ユーザー情報の読み取り」の権限が無いなど）。残りは確かめずに進みます。--max-credits で上限を付けられます");
    }
    console.log(`今回の生成 ${toGenerate.length} 本・${needChars} 字`);
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
      // 🚨 出口は 1 つ。キーの値と sk_… を伏せてから出す
      if (e instanceof ElevenStop) {
        console.error(`[eleven-tts] ${redact(e.message)}`);
        process.exit(e.kind === "premise" ? PREMISE_EXIT : e.kind === "voice" ? VOICE_EXIT : 1);
      }
      if (e instanceof UsageError) console.error(`[eleven-tts] ${redact(e.message)}`);
      else console.error(`[eleven-tts] 想定外のエラー: ${redact(e)}`);
      process.exit(1);
    });
}
