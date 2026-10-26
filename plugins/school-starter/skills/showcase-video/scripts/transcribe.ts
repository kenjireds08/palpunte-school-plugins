// 音声・動画を OpenAI の文字起こし（whisper-1）にかけ、書き起こしと語の時刻を JSON に書く。Mac / Windows 共通。
//
// 使いみち:
//   1. 読み間違いの確認: ナレーションの wav を書き起こして、原稿と読みが合っているかを見る
//   2. 動きを声に合わせる: tokens[].at（語の始まりの秒）を見て、場面の中の動きの時刻を決める
//   3. 書き出した動画の確認: 本物の名前・電話番号・住所を読み上げていないかを見る（--media に mp4 を渡す）
//
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/transcribe.ts" --media <ファイル> [--out <json>] [--prompt "<用語>"]
//   → 既定の出力: <ファイルのフォルダ>/<名前>.words.json
//
// 料金: 1 分あたり 約 0.006 ドル（約 1 円）。30 秒のナレーションなら 1 円未満。
// キー: 環境変数 → 共通の置き場 → 補講2 の image-studio の OPENAI_API_KEY。値は画面に出さない。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic.ts";
import { ensureFfmpegOnPath } from "./lib/ffpath.mjs";
import { SAVE_HINT, findKey, redactKeys } from "./lib/keys.ts";

export const MODEL = "whisper-1";
export const USD_PER_MINUTE = 0.006;
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

class TranscribeError extends Error {}

export type Token = { text: string; at: number; to: number };
export type WordsOut = { source: string; model: string; seconds: number; transcript: string; tokens: Token[]; segments: Array<{ from: number; to: number; text: string }>; costUsd: number };

/** API の verbose_json を出力の形にする（純粋関数・テストあり） */
export function shapeResponse(j: unknown, source: string): WordsOut {
  const o = j as { text?: unknown; duration?: unknown; words?: unknown; segments?: unknown };
  if (!o || typeof o !== "object" || typeof o.text !== "string") throw new TranscribeError("文字起こしの返事の形が想定と違います（text がありません）");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toFixed(3)) : 0);
  const tokens: Token[] = Array.isArray(o.words)
    ? (o.words as Array<{ word?: unknown; start?: unknown; end?: unknown }>)
        .filter((w) => typeof w?.word === "string")
        .map((w) => ({ text: String(w.word), at: num(w.start), to: num(w.end) }))
    : [];
  const segments = Array.isArray(o.segments)
    ? (o.segments as Array<{ start?: unknown; end?: unknown; text?: unknown }>).map((s) => ({ from: num(s.start), to: num(s.end), text: typeof s.text === "string" ? s.text.trim() : "" }))
    : [];
  const seconds = num(o.duration);
  return { source, model: MODEL, seconds, transcript: o.text.trim(), tokens, segments, costUsd: Number(((seconds / 60) * USD_PER_MINUTE).toFixed(5)) };
}

function parseArgs(argv: string[]): { media?: string; out?: string; prompt?: string; help: boolean } {
  const a: { media?: string; out?: string; prompt?: string; help: boolean } = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--help" || k === "-h") {
      a.help = true;
      continue;
    }
    if (!["--media", "--out", "--prompt"].includes(k)) throw new TranscribeError(`不明な引数です: ${k}（--help で一覧）`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new TranscribeError(`${k} には値が必要です`);
    i++;
    if (k === "--media") a.media = v;
    if (k === "--out") a.out = v;
    if (k === "--prompt") a.prompt = v;
  }
  if (!a.help && !a.media) throw new TranscribeError("--media <音声か動画のファイル> が必要です");
  return a;
}

const HELP = `transcribe.ts — 音声・動画を書き起こし、語の時刻を <名前>.words.json に書く（OpenAI whisper-1・1 分 約 1 円）

  node transcribe.ts --media <wav / mp3 / mp4 など> [--out <json>] [--prompt "<固有名詞など>"]

出力: transcript（書き起こし）・tokens[]（{ text, at（始まりの秒）, to }）・segments[]・seconds・costUsd
  同じ音の別の漢字で書き起こされることがある（「神」→「紙」など）。読みが合っていれば誤読ではない`;

async function main(argv: string[]): Promise<number> {
  ensureFfmpegOnPath(); // ffmpeg を入れたあとアプリが古い PATH のままでも動くように（lib/ffpath.mjs）
  const args = parseArgs(argv);
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const media = path.resolve(args.media as string);
  if (!fs.existsSync(media)) throw new TranscribeError(`ファイルがありません: ${media}`);
  const out = path.resolve(args.out ?? path.join(path.dirname(media), `${path.basename(media).replace(/\.[^.]+$/, "")}.words.json`));
  const key = findKey("OPENAI_API_KEY");
  if (!key) throw new TranscribeError(SAVE_HINT.OPENAI_API_KEY);

  // 小さく軽い音声（16kHz・mono・mp3）にしてから送る（動画も音だけ取り出す）
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "showcase-transcribe-"));
  try {
    const mp3 = path.join(work, "audio.mp3");
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", media, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", mp3], { encoding: "utf8" });
    if (r.error) throw new TranscribeError(`ffmpeg を起動できませんでした（ffmpeg が入っていない可能性。references/setup.md）: ${r.error.message}`);
    if (r.status !== 0) throw new TranscribeError(`音声を取り出せませんでした（音の無い動画かもしれません）: ${String(r.stderr).slice(-400)}`);
    const bytes = fs.readFileSync(mp3);
    if (bytes.length > MAX_UPLOAD_BYTES) throw new TranscribeError(`音声が長すぎます（${(bytes.length / 1024 / 1024).toFixed(1)} MB）。動画を分けてから書き起こしてください`);
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "audio/mpeg" }), "audio.mp3");
    form.append("model", MODEL);
    form.append("language", "ja");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    form.append("timestamp_granularities[]", "segment");
    if (args.prompt) form.append("prompt", args.prompt);
    const base = (process.env.SHOWCASE_OPENAI_API_BASE || "https://api.openai.com").replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key.value}` },
        body: form,
        signal: AbortSignal.timeout(180000),
      });
    } catch (e) {
      throw new TranscribeError(`OpenAI に接続できませんでした: ${redactKeys((e as Error).message, [key.value])}`);
    }
    const text = await res.text();
    if (!res.ok) {
      const hint =
        res.status === 401
          ? "鍵が無効です。保存し直してください"
          : res.status === 429
            ? "混雑か、OpenAI の残高（クレジット）が足りません。時間を置くか、OpenAI の画面の Billing を確かめてください"
            : "時間を置いてもう一度実行してください";
      throw new TranscribeError(`OpenAI の文字起こしが HTTP ${res.status} で失敗しました。${hint}\n${redactKeys(text, [key.value]).slice(0, 400)}`);
    }
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      throw new TranscribeError("文字起こしの返事を JSON として読めませんでした");
    }
    const shaped = shapeResponse(j, path.basename(media));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    writeFileAtomic(out, `${JSON.stringify(shaped, null, 2)}\n`);
    console.log(`[ok] ${out}  ${shaped.seconds.toFixed(1)} 秒・語 ${shaped.tokens.length} 個・約 ${(shaped.costUsd * 150).toFixed(2)} 円`);
    console.log(`書き起こし: ${shaped.transcript}`);
    return 0;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
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
  main(process.argv.slice(2))
    .then((c) => process.exit(c))
    .catch((e: unknown) => {
      console.error(`[transcribe] ${redactKeys(e instanceof Error ? e.message : String(e))}`);
      process.exit(1);
    });
}
