// 尺の正本（ナレーション wav の実効長）を計算する共有部品。
// eleven-tts.ts（生成時に <id>.json へ書く）と showcase-check.ts（HTML・VTT・mp4 との突き合わせ）が同じ定義を使う。
// 定義の説明は references/spec.md §1。ここの定数を変えたら spec.md も直す。

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

/** 実効長を測る無音検出のしきい値（固定）。場面内の文の区切り（字幕用の -35dB / 0.18s）とは別物 */
export const EFFECTIVE_NOISE_DB = -45;
export const EFFECTIVE_MIN_SILENCE_SEC = 0.15;
/**
 * 末尾の雑音として無視する音の区間の上限（長さとピークの両方を満たすものだけ）。
 * 無音（上のしきい値）の後ろでファイルが終わる、または無音に挟まれた、短く小さい音は発話ではない
 * （在庫管理の紹介動画 2026-09-26: 末尾の -45dB を少し超える雑音で、実効長が全長まで伸びた）。
 * ピークが TAIL_NOISE_MAX_PEAK_DB を超える音は短くても発話として残す＝声を切らない側に倒す。
 */
export const TAIL_NOISE_MAX_SEC = 0.25;
export const TAIL_NOISE_MAX_PEAK_DB = -30;
/** 実効長の丸め（HTML の data-duration と同じ 2 桁） */
export const EFFECTIVE_DECIMALS = 2;

export type SpeechSpan = {
  /** ファイル全体の長さ（秒） */
  seconds: number;
  /** 発話の始まり（先頭の無音の終わり。先頭に無音が無ければ 0） */
  speechStart: number;
  /** 発話の終わり（末尾の無音の始まり。末尾に無音が無ければ seconds） */
  speechEnd: number;
  /** 実効長 = speechEnd を 2 桁に丸めたもの。data-start からこの秒数で場面の声が終わる */
  effectiveSeconds: number;
  /** 発話の終わりより後ろで、末尾の雑音として無視した音の区間（無ければ空） */
  ignoredTail: TailNoise[];
};

export type TailNoise = { start: number; end: number; peakDb: number | null };

/** 音のある区間が末尾の雑音かどうか（長さ・ピーク）。純関数 */
export function isTailNoise(seg: { start: number; end: number }, peakDb: number | null): boolean {
  if (seg.end - seg.start > TAIL_NOISE_MAX_SEC) return false;
  // ピークが測れないときは雑音とみなさない（声を切らない側に倒す）
  return peakDb !== null && peakDb <= TAIL_NOISE_MAX_PEAK_DB;
}

export class AudioMeasureError extends Error {}

export function round(n: number, d = EFFECTIVE_DECIMALS): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** ffprobe で長さ（秒）を測る */
export function probeSeconds(file: string): number {
  if (!fs.existsSync(file)) throw new AudioMeasureError(`ファイルがありません: ${file}`);
  let out: string;
  try {
    out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], {
      encoding: "utf8",
    });
  } catch (e) {
    throw new AudioMeasureError(`ffprobe で長さを測れませんでした（${file}）: ${(e as Error).message}`);
  }
  const s = Number(out.trim());
  if (!Number.isFinite(s) || s <= 0) throw new AudioMeasureError(`ffprobe の結果が不正です（${file}）: ${out.trim()}`);
  return s;
}

/** silencedetect の出力（stderr）から区間を読む。純関数（テスト・確認用に export） */
export function parseSilences(stderr: string): Array<{ start: number; end: number | null }> {
  const out: Array<{ start: number; end: number | null }> = [];
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) {
      out.push({ start: Math.max(0, Number(s[1])), end: null });
      continue;
    }
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && out.length > 0 && out[out.length - 1].end === null) out[out.length - 1].end = Number(e[1]);
  }
  return out;
}

/**
 * 無音区間と全長から発話区間を出す。純関数。
 * peakOf は音のある区間のピーク（dB。測れなければ null）を返す関数。渡さなければ末尾の雑音は判定しない（無音だけで決める）。
 * 末尾から見て「最後の無音の後ろの音」「無音と無音に挟まれた音」が短く小さい（isTailNoise）あいだは雑音として飛ばし、
 * その手前の無音の始まりを発話の終わりにする。
 */
export function spanFromSilences(
  seconds: number,
  silences: Array<{ start: number; end: number | null }>,
  peakOf?: (seg: { start: number; end: number }) => number | null,
): SpeechSpan {
  const EPS = 0.02;
  let speechStart = 0;
  let speechEnd = seconds;
  const ignoredTail: TailNoise[] = [];
  const first = silences[0];
  if (first && first.start <= EPS && (first.end === null || first.end >= seconds - EPS)) {
    throw new AudioMeasureError(`発話区間が見つかりません（全体が無音）`);
  }
  if (first && first.start <= EPS && first.end !== null && first.end < seconds - EPS) speechStart = first.end;
  let k = silences.length - 1;
  const last = silences[k];
  if (last && last.start > speechStart) {
    const reachesEnd = last.end === null || last.end >= seconds - EPS;
    const tail = reachesEnd ? null : { start: last.end as number, end: seconds };
    const tailPeak = tail && peakOf ? peakOf(tail) : null;
    if (tail === null || (peakOf !== undefined && isTailNoise(tail, tailPeak))) {
      if (tail) ignoredTail.push({ ...tail, peakDb: tailPeak });
      speechEnd = last.start;
      // さらに手前の「無音に挟まれた短く小さい音」も雑音として飛ばす
      while (peakOf && k > 0) {
        const prev = silences[k - 1];
        if (prev.end === null || prev.start <= speechStart) break;
        const seg = { start: prev.end, end: silences[k].start };
        const peak = peakOf(seg);
        if (!isTailNoise(seg, peak)) break;
        ignoredTail.unshift({ ...seg, peakDb: peak });
        speechEnd = prev.start;
        k--;
      }
    }
  }
  if (speechEnd <= speechStart) throw new AudioMeasureError(`発話区間が見つかりません（全体が無音）`);
  return { seconds, speechStart, speechEnd, effectiveSeconds: round(speechEnd), ignoredTail };
}

/** 区間のピーク（dB）を ffmpeg の volumedetect で測る。無音（-inf）や測れないときは null */
export function measurePeakDb(file: string, seg: { start: number; end: number }): number | null {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-ss", seg.start.toFixed(3), "-to", seg.end.toFixed(3), "-i", file, "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (r.error) throw new AudioMeasureError(`ffmpeg を起動できませんでした: ${r.error.message}`);
  if (r.status !== 0) throw new AudioMeasureError(`ffmpeg のピーク測定に失敗しました（${file}・終了コード ${r.status}）\n${r.stderr}`);
  const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m || m[1] === "-inf") return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/** wav を測って発話区間と実効長を返す（ffmpeg / ffprobe が必要。ファイルは書き換えない） */
export function measureSpeech(file: string): SpeechSpan {
  const seconds = probeSeconds(file);
  // silencedetect の結果は stderr に出る。-f null で何も書き出さない
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${EFFECTIVE_NOISE_DB}dB:d=${EFFECTIVE_MIN_SILENCE_SEC}`, "-f", "null", "-"],
    { encoding: "utf8" },
  );
  if (r.error) throw new AudioMeasureError(`ffmpeg を起動できませんでした: ${r.error.message}`);
  if (r.status !== 0) throw new AudioMeasureError(`ffmpeg の無音検出に失敗しました（${file}・終了コード ${r.status}）\n${r.stderr}`);
  return spanFromSilences(seconds, parseSilences(r.stderr), (seg) => measurePeakDb(file, seg));
}
