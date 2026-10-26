// ElevenLabs（読み上げ）を呼ぶための部品（eleven-tts.ts・voices.ts・showcase-check.ts が使う）。
//
// 🚨 キーの値は画面・ログ・記録 JSON・エラー本文のどこにも出さない。出口は redact() の 1 つ。
// 🚨 失敗しても別の声へは勝手に落とさない（止まって理由を日本語で伝え、受講生に選び直してもらう）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findKey, redactKeys } from "./keys.ts";

export const ELEVEN_DEFAULT_BASE = "https://api.elevenlabs.io";
export const DEFAULT_TIMEOUT_MS = 120000;
export const DEFAULT_RETRY_WAIT_MS = 10000;
/** 429 は総 3 回（待ち 2 回）・5xx と接続断・タイムアウトは総 2 回（待たずに再試行） */
export const MAX_429 = 3;
export const MAX_5XX = 2;
export const MAX_NET = 2;
/** 音量の固定仕様 */
export const TARGET_LUFS = -16;
export const MAX_SAMPLE_PEAK_DB = -2;
export const MAX_TRUE_PEAK_DB = -1;
export const LUFS_TOLERANCE = 1;
export const LUFS_MIN_SEC = 3;
const LIMIT_DB = -2.5;
const OVERSAMPLE = 96000;

/** 既定の声（Voice Library の声。無料プランでは API から使えない可能性がある） */
export const DEFAULT_VOICE = { id: "EHMH9cyd1z3rXm4z0Jja", name: "Yuma Uchida", model: "eleven_v4" };

/** 声を選び直すときの道具（エラーの案内に出す） */
export const VOICES_HINT = 'node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voices.ts"';

// ---------- キーとマスク ----------

let activeKey: string | null = null;
export function setActiveKey(k: string | null): void {
  activeKey = k || null;
}

/** キーの値そのものと、鍵らしい文字列（sk_…・sk-…）を *** にする */
export function redactText(s: unknown, key: string | null = activeKey): string {
  return redactKeys(s, [key]);
}

/** Error（message・stack・cause の連鎖）・文字列・オブジェクトを 1 つの伏せ字済み文字列にする */
export function redact(x: unknown, key: string | null = activeKey): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): void => {
    if (v === undefined || v === null || depth > 6) return;
    if (typeof v !== "object") {
      parts.push(String(v));
      return;
    }
    if (seen.has(v)) return;
    seen.add(v);
    if (v instanceof Error) {
      parts.push(v.stack ?? `${v.name}: ${v.message}`);
      if (v.stack && !String(v.stack).includes(v.message)) parts.push(v.message);
      const errs = (v as { errors?: unknown }).errors;
      if (Array.isArray(errs)) for (const e of errs) walk(e, depth + 1);
      const cause = (v as { cause?: unknown }).cause;
      if (cause !== undefined) {
        parts.push("原因:");
        walk(cause, depth + 1);
      }
      return;
    }
    try {
      parts.push(JSON.stringify(v));
    } catch {
      parts.push(String(v));
    }
  };
  walk(x, 0);
  return redactText(parts.join("\n"), key);
}

/** キーを読む（環境変数 → 共通の置き場）。無ければ null */
export function readElevenKey(): { value: string; source: string } | null {
  const k = findKey("ELEVENLABS_API_KEY");
  return k ? { value: k.value, source: k.source } : null;
}

// ---------- 本文 ----------

export type TextNormalization = { key: string; value: unknown };
export type ElevenSpec = {
  voice: string;
  model: string;
  languageCode: string;
  textNormalization: TextNormalization;
  voiceSettings: Record<string, unknown> | null;
  outputFormat: string;
};

export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) o[k] = sortKeys((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

/** 送る本文。voiceSettings が null のときは voice_settings をキーごと送らない */
export function requestBody(text: string, s: ElevenSpec): Record<string, unknown> {
  const body: Record<string, unknown> = { text, model_id: s.model, language_code: s.languageCode };
  if (s.textNormalization?.key) body[s.textNormalization.key] = s.textNormalization.value;
  if (s.voiceSettings !== null && s.voiceSettings !== undefined) body.voice_settings = s.voiceSettings;
  return body;
}

// ---------- 残り（subscription） ----------

export type Subscription = { count: number; limit: number; resetUnix: number | null; tier: string | null };

/** GET /v1/user/subscription を 1 回読む。読めなければ null（鍵に「ユーザー情報の読み取り」の権限が無いときなど） */
export async function readSubscription(o: { base: string; key: string; timeoutMs: number }): Promise<Subscription | null> {
  try {
    const res = await fetch(`${o.base}/v1/user/subscription`, {
      headers: { "xi-api-key": o.key },
      signal: AbortSignal.timeout(o.timeoutMs),
    });
    if (!res.ok) {
      await res.text().catch(() => "");
      return null;
    }
    const j = (await res.json()) as Record<string, unknown>;
    const n = (k: string): number | null => (typeof j?.[k] === "number" && Number.isFinite(j[k]) ? (j[k] as number) : null);
    const count = n("character_count");
    const limit = n("character_limit");
    if (count === null || limit === null || limit <= 0) return null;
    return { count, limit, resetUnix: n("next_character_count_reset_unix"), tier: typeof j.tier === "string" ? j.tier : null };
  } catch {
    return null;
  }
}

// ---------- 呼び出し ----------

/**
 * 止まる理由。
 *   voice   = この声を API で使えない（無料プランで Voice Library の声・声が見つからない）。声を選び直す（終了コード 6）
 *   premise = 鍵・残り・上限の前提が崩れた（終了コード 5）
 *   failed  = それ以外の失敗（終了コード 1）
 */
export class ElevenStop extends Error {
  kind: "voice" | "premise" | "failed";
  constructor(kind: "voice" | "premise" | "failed", message: string) {
    super(message);
    this.kind = kind;
  }
}

export type LedgerAction = "confirmed" | "refunded" | "uncertain";
export type Gate = {
  reserve: (attempt: number) => Promise<void> | void;
  settle: (attempt: number, result: string, ledger: LedgerAction) => Promise<void> | void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 4xx の本文から、受講生に伝える言葉を決める（純粋関数・テストあり）。
 * 無料プランの「Voice Library の声は API で使えない」の返事の形は、有料プランの鍵では確かめられていない。
 * そのため決まった 1 つのコードだけに頼らず、声に関係しそうな 4xx はまとめて「声を選び直す」に倒す。
 */
export function classify4xx(status: number, body: string, voiceId: string): { kind: "voice" | "premise" | "failed"; message: string } {
  const t = body.toLowerCase();
  const voiceHint =
    `声を選び直してください。ElevenLabs の公式の声（無料プランでも API で使える）で日本語に対応しているものは、次のコマンドで一覧にできます（課金なし）:\n  ${VOICES_HINT}\n` +
    "選んだら、台本 JSON（narration.script.json）の voice と model と、設定（showcase.config.json）の tts.voice・tts.model を書き換えて、もう一度実行します";
  // 無料プランで止まったときは 2 択だけを出す（無料プランの公式の声は英語なまりで、日本語の紹介動画には使えなかった）
  const planChoice =
    "選べること（どちらにするかは受講生が決める）:\n" +
    "  ① ElevenLabs を Starter（月 6 ドル）以上にして、同じコマンドをもう一度実行する（選んだ声のまま・商用に使える）\n" +
    "  ② Gemini の声に切り替える: voice-choice.ts save --config <showcase.config.json> --provider gemini → 台本を templates/narration.script.gemini.example.json の形にして gemini-tts.ts で作る（無料枠あり）\n" +
    "  無料プランの公式の声（voices.ts の一覧）は英語なまりなので、日本語の紹介動画には使わない";
  if (/free_users_not_allowed|free users|library voice|voice library|upgrade your subscription|subscription.*(required|upgrade)|paid plan/.test(t)) {
    return {
      kind: "voice",
      message:
        `ElevenLabs: この声（${voiceId}）は、いまのプランでは API から使えません（HTTP ${status}）。\n` +
        "このスキルの ElevenLabs の声（おすすめの Yuma Uchida も、ほかの候補も）は Voice Library（みんなが公開している声の棚）の声で、無料プランでは API から使えません。\n" +
        planChoice,
    };
  }
  if (status === 401) {
    if (/missing_permissions|permission/.test(t)) {
      return {
        kind: "premise",
        message:
          "ElevenLabs: この鍵に「Text to Speech（読み上げ）」の権限がありません（HTTP 401）。ElevenLabs の画面の API Keys で、鍵の権限に Text to Speech を付けて作り直し、保存し直してください",
      };
    }
    return { kind: "premise", message: "ElevenLabs: 鍵が無効です（HTTP 401）。ElevenLabs の画面で新しい鍵を作り、保存し直してください" };
  }
  if (/quota_exceeded|not enough credits|insufficient|credits? (remaining|left)|quota/.test(t)) {
    return { kind: "premise", message: `ElevenLabs: 今月の文字数（クレジット）が足りません（HTTP ${status}）。来月まで待つか、プランを見直してください` };
  }
  if (status === 404 || /voice_not_found|voice not found|does not exist/.test(t)) {
    return { kind: "voice", message: `ElevenLabs: 声（${voiceId}）が見つかりません（HTTP ${status}）。ID の打ち間違いか、この鍵のアカウントでは使えない声です。\n${voiceHint}` };
  }
  if (status === 402 || status === 403) {
    return { kind: "voice", message: `ElevenLabs: この声（${voiceId}）を API で使えませんでした（HTTP ${status}）。プランの制限の可能性があります。\n${planChoice}` };
  }
  if (/model/.test(t) && /(not supported|unsupported|invalid|not available)/.test(t)) {
    return { kind: "voice", message: `ElevenLabs: この声とモデルの組み合わせは使えません（HTTP ${status}）。\n${voiceHint}` };
  }
  return { kind: "failed", message: `ElevenLabs: HTTP ${status} で止めます` };
}

/** 1 文を送って音声（mp3）のバイト列を返す。再試行・止まり方を決める */
export async function elevenFetch(o: {
  text: string;
  spec: ElevenSpec;
  key: string;
  base: string;
  timeoutMs: number;
  retryWaitMs: number;
  gate: Gate;
}): Promise<Buffer> {
  const { spec, key, gate } = o;
  const url = `${o.base}/v1/text-to-speech/${encodeURIComponent(spec.voice)}?output_format=${encodeURIComponent(spec.outputFormat)}`;
  const body = JSON.stringify(requestBody(o.text, spec));
  let n429 = 0;
  let n5xx = 0;
  let nNet = 0;
  for (let attempt = 1; ; attempt++) {
    await gate.reserve(attempt);
    let res: Response;
    let buf: Buffer | null = null;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body,
        signal: AbortSignal.timeout(o.timeoutMs),
      });
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      const err = e as { name?: string; cause?: { code?: string } | unknown; message?: string };
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      nNet++;
      await gate.settle(attempt, timedOut ? "timeout" : "connect", "uncertain");
      const causeCode = (err?.cause as { code?: string } | undefined)?.code ?? err?.cause ?? err?.message;
      const why = timedOut ? `タイムアウト（${o.timeoutMs} ms）` : `接続できません（${redact(causeCode, key).split("\n")[0]}）`;
      if (nNet < MAX_NET) {
        console.error(`  … ElevenLabs: ${why}。もう 1 回だけ送ります`);
        continue;
      }
      throw new ElevenStop("failed", `ElevenLabs: ${why}が ${nNet} 回続いたので止めます。インターネットの接続を確かめ、時間を置いてもう一度実行してください`);
    }
    if (res.ok && buf) {
      const ct = res.headers.get("content-type") ?? "";
      if (!/^audio\/|application\/octet-stream/i.test(ct) || buf.length < 1000) {
        await gate.settle(attempt, "bad-body", "confirmed");
        throw new ElevenStop("failed", `ElevenLabs が音声でない応答を返しました（content-type=${ct || "なし"}・${buf.length} バイト）\n${redact(buf.subarray(0, 300).toString("utf8"), key)}`);
      }
      await gate.settle(attempt, "HTTP 200", "confirmed");
      return buf;
    }
    const text = redact(await res.text().catch(() => ""), key).slice(0, 800);
    const status = res.status;
    if (status === 429) {
      n429++;
      await gate.settle(attempt, "HTTP 429", "refunded");
      if (n429 < MAX_429) {
        console.error(`  … ElevenLabs: HTTP 429（混雑）。${(o.retryWaitMs / 1000).toFixed(1)} 秒待ってから送り直します（${n429}/${MAX_429 - 1}）`);
        await sleep(o.retryWaitMs);
        continue;
      }
      throw new ElevenStop("failed", `ElevenLabs: HTTP 429 が ${n429} 回続いたので止めます。無料プランは同時に作れる数が少ないので、時間を置いてからもう一度実行してください\n${text}`);
    }
    if (status >= 500) {
      n5xx++;
      await gate.settle(attempt, "HTTP 5xx", "refunded");
      if (n5xx < MAX_5XX) {
        console.error(`  … ElevenLabs: HTTP ${status}。もう 1 回だけ送ります`);
        continue;
      }
      throw new ElevenStop("failed", `ElevenLabs: HTTP ${status} が ${n5xx} 回続いたので止めます。ElevenLabs 側の障害の可能性があります\n${text}`);
    }
    await gate.settle(attempt, `HTTP ${status}`, "refunded");
    const c = classify4xx(status, text, spec.voice);
    throw new ElevenStop(c.kind, `${c.message}\n（ElevenLabs の返事: ${text}）`);
  }
}

// ---------- 音量（固定仕様） ----------

function ff(args: string[]) {
  const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
  if (r.error) throw new Error(`ffmpeg を起動できませんでした（ffmpeg が入っていない可能性。references/setup.md）: ${r.error.message}`);
  return r;
}

export type Loudness = { loudnessI: number; truePeakDb: number; samplePeakDb: number };

/** integrated loudness・サンプル峰・true peak を測る */
export function measureLoudness(file: string): Loudness {
  const ln = ff(["-hide_banner", "-nostats", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"]);
  if (ln.status !== 0) throw new Error(`loudnorm で測れませんでした: ${file}\n${redact(ln.stderr).slice(-800)}`);
  const s = String(ln.stderr);
  const i = s.lastIndexOf("{");
  let j: Record<string, string>;
  try {
    j = JSON.parse(s.slice(i, s.indexOf("}", i) + 1)) as Record<string, string>;
  } catch {
    throw new Error(`loudnorm の出力を読めませんでした: ${file}`);
  }
  const num = (v: string) => (v === "-inf" ? -Infinity : Number(v));
  const st = ff(["-hide_banner", "-nostats", "-i", file, "-af", "astats=measure_perchannel=none:measure_overall=Peak_level", "-f", "null", "-"]);
  if (st.status !== 0) throw new Error(`astats で測れませんでした: ${file}\n${redact(st.stderr).slice(-800)}`);
  const m = [...String(st.stderr).matchAll(/Peak level dB:\s*(-?[\d.]+|-inf)/g)].pop();
  return { loudnessI: num(j.input_i), truePeakDb: num(j.input_tp), samplePeakDb: m ? num(m[1]) : NaN };
}

/** −16 LUFS を目標に音量をそろえ、サンプル峰 ≤ −2 dBFS・true peak ≤ −1 dBTP に収めた 16bit wav を書く */
export function normalizeLoudness(src: string, dest: string, { sampleRate = 24000, channels = 1 } = {}): void {
  const limit = (10 ** (LIMIT_DB / 20)).toFixed(4);
  const render = (from: string, gainDb: number, to: string) => {
    const r = ff([
      "-y", "-v", "error", "-i", from,
      "-af", `aformat=sample_fmts=flt,volume=${gainDb.toFixed(2)}dB,aresample=${OVERSAMPLE},alimiter=limit=${limit}:level=false:latency=1,aresample=${sampleRate}`,
      "-ar", String(sampleRate), "-ac", String(channels), "-c:a", "pcm_s16le", to,
    ]);
    if (r.status !== 0) throw new Error(`音量の正規化に失敗しました\n${redact(r.stderr).slice(-800)}`);
  };
  const first = measureLoudness(src);
  const gain1 = Number.isFinite(first.loudnessI) ? TARGET_LUFS - first.loudnessI : 0;
  render(src, gain1, dest);
  const second = measureLoudness(dest);
  if (Number.isFinite(second.loudnessI) && Math.abs(second.loudnessI - TARGET_LUFS) > 0.3) {
    const tmp = dest.replace(/\.wav$/i, "") + ".pass2.wav";
    render(src, gain1 + (TARGET_LUFS - second.loudnessI), tmp);
    fs.renameSync(tmp, dest);
  }
}

/** 正規化後の音が固定仕様に入っているか */
export function loudnessProblems(m: Loudness, seconds: number): string[] {
  const out: string[] = [];
  if (!(m.samplePeakDb <= MAX_SAMPLE_PEAK_DB)) out.push(`サンプル峰 ${m.samplePeakDb.toFixed(2)} dBFS（上限 ${MAX_SAMPLE_PEAK_DB}）`);
  if (!(m.truePeakDb <= MAX_TRUE_PEAK_DB)) out.push(`true peak ${m.truePeakDb.toFixed(2)} dBTP（上限 ${MAX_TRUE_PEAK_DB}）`);
  if (seconds >= LUFS_MIN_SEC && !(Math.abs(m.loudnessI - TARGET_LUFS) <= LUFS_TOLERANCE)) {
    out.push(`integrated ${m.loudnessI.toFixed(2)} LUFS（目標 ${TARGET_LUFS} ± ${LUFS_TOLERANCE}）`);
  }
  return out;
}

// ---------- 手元の記録（試行単位。何文字使ったかを後で数えるため） ----------

export type LogRow = { at: string; id: string; index: number; attempt: number; chars: number; result: string; ledger: LedgerAction };

export function readCreditsLog(file: string): { calls: LogRow[] } {
  if (!fs.existsSync(file)) return { calls: [] };
  let j: { calls?: unknown };
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8")) as { calls?: unknown };
  } catch (e) {
    throw new Error(`手元の記録が壊れています: ${file}（${(e as Error).message}）`);
  }
  return { calls: Array.isArray(j?.calls) ? (j.calls as LogRow[]) : [] };
}

export function appendCreditsLog(file: string, row: LogRow): void {
  const log = readCreditsLog(file);
  log.calls.push(row);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(log, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

/** 記録の中で課金された（されたかもしれない）文字数の合計 */
export function usedChars(file: string): number {
  return readCreditsLog(file)
    .calls.filter((c) => c.ledger === "confirmed" || c.ledger === "uncertain")
    .reduce((n, c) => n + (Number(c.chars) || 0), 0);
}
