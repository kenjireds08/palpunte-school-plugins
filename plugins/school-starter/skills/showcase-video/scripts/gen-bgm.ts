// 動画用の BGM（音楽の下地）をサイン波とシード固定のノイズだけで合成し、WAV に書き出す。
//
// 出どころ: 元の制作スクリプト（15 秒 CM 用）と
//   紹介動画用のものを 1 本にまとめた。
//   楽器・コード進行（Am-F-C-G）・シードは 2 本とも同じで、違いは曲の組み立て（編成）だけだったので
//   --style で選び、長さ・テンポ・ロゴの着地時刻を引数で受ける。
//
// なぜ自前合成か: 第三者の音源を 1 つも使わないのでライセンスの確認が要らない。同じ引数なら
//   毎回同じ波形になる（シード固定）ので、映像を直したあとに作り直しても音がずれない。
//
// 実行:
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-bgm.ts" --style cm --duration 15 --logo-at 12.5 --out assets/audio/bgm.wav
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-bgm.ts" --style narrated --duration 42 --logo-at 34.6 --out assets/audio/bgm.wav
//
// 組み立て（beat = 60 / bpm、1 小節 = 4 beat、ギャップ = 1 beat）:
//   cm       : 頭の打ち込み（--hits の時刻にキック）→ groove（4 つ打ち・裏拍ハット・クラップ・ベース＋パッド）
//              → push（ロゴ前 4 beat: キック連打＋ライザー）→ 無音 1 beat → ロゴで大きいキック → パッドの余韻 → フェード
//   narrated : 柔らかい入り（パッドがゆっくり立ち上がり、軽いキック）→ groove（声の下で控えめ）
//              → push（ロゴ前 3 beat: 8 分キック＋ライザー）→ 無音 1 beat → ロゴで大きいキック → 余韻 → 長めのフェード

import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./lib/atomic.ts";

class BgmError extends Error {}

const HELP = `gen-bgm.ts — 自前合成の BGM を WAV（44.1kHz・16bit・ステレオ）で書き出す

  node gen-bgm.ts --style cm|narrated --duration <秒> --logo-at <秒> --out <出力.wav>
                  [--bpm 120] [--groove-from <秒>] [--hits "0,0.5,1.5,2"] [--fade <秒>] [--force]

  --style        cm = 15 秒 CM（無音再生でも成立する勢い重視）／ narrated = ナレーション付き紹介動画（声の下で控えめ）
  --duration     曲の長さ（動画の長さと同じにする）
  --logo-at      ロゴが着地する時刻。ここに大きいキック、直前 1 beat は無音
  --bpm          テンポ（既定 120。beat = 60/bpm 秒。コードは 1 小節 = 4 beat ごとに変わる）
  --groove-from  4 つ打ちが始まる時刻（既定 cm 2.5 / narrated 4.0 = 最初の場面が終わる時刻に合わせる）
  --hits         cm だけ: groove 前に単発キックを置く時刻（既定 "0,0.5,1.5,2" = 15 秒のテンプレートの文字の叩きつけ）
                 既定のときの強さは 0.8/1.0/1.0/0.7。
                 指定したときは全部 強さ 1.0
  --fade         終わりのフェード秒（既定 cm 0.7 / narrated 1.6）
  --force        既存の出力を上書きする（無いと上書きせず終了コード 1）。書き出しは一時ファイル経由
  知らないオプション・値の抜け・同じオプションの重複は終了コード 1

終了コード: 0 成功 / 1 失敗`;

const FLAGS = new Set(["help", "force"]);
const VALUED = new Set(["style", "duration", "logo-at", "out", "bpm", "groove-from", "hits", "fade"]);

function parseArgs(argv: string[]): Map<string, string | true> {
  const m = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new BgmError(`不明な引数です: ${a}（オプションは --名前 の形。--help で一覧）`);
    const name = a.slice(2);
    if (m.has(name)) throw new BgmError(`--${name} が 2 回指定されています`);
    if (FLAGS.has(name)) {
      m.set(name, true);
    } else if (VALUED.has(name)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new BgmError(`--${name} には値が必要です`);
      m.set(name, next);
      i++;
    } else {
      throw new BgmError(`不明なオプションです: --${name}（打ち間違いの可能性。--help で一覧）`);
    }
  }
  return m;
}

function num(m: Map<string, string | true>, name: string, def?: number): number {
  const v = m.get(name);
  if (v === undefined) {
    if (def === undefined) throw new BgmError(`--${name} が必要です（--help で使い方）`);
    return def;
  }
  if (v === true) throw new BgmError(`--${name} には値が必要です`);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new BgmError(`--${name} が数値ではありません: ${v}`);
  return n;
}

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[gen-bgm] ${(e as Error).message}`);
    process.exit(1);
  }
})();

if (args.get("help") === true) {
  console.log(HELP);
  process.exit(0);
}

function run(): void {
  const style = args.get("style");
  if (style !== "cm" && style !== "narrated") throw new BgmError("--style は cm か narrated を指定してください");
  const DUR = num(args, "duration");
  const LOGO = num(args, "logo-at");
  const BPM = num(args, "bpm", 120);
  const outArg = args.get("out");
  if (typeof outArg !== "string" || !/\.wav$/i.test(outArg)) throw new BgmError("--out に .wav のパスが必要です");
  const OUT = path.resolve(outArg);
  if (fs.existsSync(OUT) && args.get("force") !== true) throw new BgmError(`出力が既にあります（上書きするなら --force）: ${OUT}`);

  if (DUR <= 0 || DUR > 600) throw new BgmError(`--duration は 0〜600 秒で指定してください: ${DUR}`);
  if (BPM < 60 || BPM > 200) throw new BgmError(`--bpm は 60〜200 で指定してください: ${BPM}`);
  const BEAT = 60 / BPM;
  const BAR = BEAT * 4;
  const GROOVE = num(args, "groove-from", style === "cm" ? 2.5 : 4.0);
  const FADE = num(args, "fade", style === "cm" ? 0.7 : 1.6);
  const GAP0 = LOGO - BEAT; // ロゴ直前の無音の始まり
  const PUSH0 = GAP0 - (style === "cm" ? 4 : 3) * BEAT;
  if (!(LOGO < DUR - 0.3)) throw new BgmError(`--logo-at（${LOGO}）は --duration（${DUR}）より 0.3 秒以上前にしてください`);
  if (!(GROOVE >= 0 && GROOVE + BEAT <= PUSH0)) {
    throw new BgmError(`groove（${GROOVE} 秒〜）がロゴ前の盛り上げ（${PUSH0.toFixed(2)} 秒〜）と重なります。--groove-from か --logo-at を見直してください`);
  }
  if (FADE <= 0 || FADE > DUR - LOGO) throw new BgmError(`--fade（${FADE}）はロゴ以降の長さ（${(DUR - LOGO).toFixed(2)} 秒）以内にしてください`);
  const hitsArg = args.get("hits");
  if (hitsArg === true) throw new BgmError("--hits には値が必要です");
  if (hitsArg !== undefined && style !== "cm") throw new BgmError("--hits は --style cm のときだけ使えます");
  // 既定は試作 CM と同じ時刻・強さ（同じ引数なら試作の bgm-120bpm.wav とバイト一致する）。
  // --hits で渡した時刻は強さ 1.0 で打つ
  const HITS: Array<[number, number]> =
    hitsArg === undefined
      ? [
          [0, 0.8],
          [0.5, 1.0],
          [1.5, 1.0],
          [2.0, 0.7],
        ].filter(([t]) => t < GROOVE) as Array<[number, number]>
      : hitsArg
          .split(",")
          .filter((s) => s.trim() !== "")
          .map((s) => {
            const n = Number(s);
            if (!Number.isFinite(n) || n < 0 || n >= GROOVE) throw new BgmError(`--hits の時刻は 0 以上 groove 開始（${GROOVE}）未満にしてください: ${s}`);
            return [n, 1.0] as [number, number];
          });

  const SR = 44100;
  const N = Math.round(SR * DUR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);

  // seeded PRNG (mulberry32) — 試作 2 本と同じシード
  let seed = 0x9e3779b9;
  function rand(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const NOISE = new Float32Array(SR);
  for (let i = 0; i < NOISE.length; i++) NOISE[i] = rand() * 2 - 1;

  function add(buf: Float32Array, i: number, v: number): void {
    if (i >= 0 && i < N) buf[i] += v;
  }
  const duck = new Float32Array(N).fill(1); // サイドチェイン: キックの直後だけ下げる

  function kick(t: number, gain = 1, big = false): void {
    const s0 = Math.round(t * SR);
    const len = Math.round((big ? 1.4 : 0.45) * SR);
    let phase = 0;
    for (let k = 0; k < len; k++) {
      const tt = k / SR;
      const f = 42 + (big ? 190 : 150) * Math.exp(-tt * (big ? 22 : 30));
      phase += (2 * Math.PI * f) / SR;
      const env = Math.exp(-tt * (big ? 3.2 : 9));
      const click = k < 90 ? NOISE[k] * 0.35 * (1 - k / 90) : 0;
      const v = (Math.sin(phase) * env + click) * gain;
      add(L, s0 + k, v);
      add(R, s0 + k, v);
      const d = 1 - 0.75 * Math.exp(-tt * 7);
      if (s0 + k < N) duck[s0 + k] = Math.min(duck[s0 + k], d);
    }
  }

  function hat(t: number, gain = 0.18): void {
    const s0 = Math.round(t * SR);
    const len = Math.round(0.06 * SR);
    let prev = 0;
    for (let k = 0; k < len; k++) {
      const n = NOISE[(k * 7 + s0) % NOISE.length];
      const hp = n - prev;
      prev = n;
      const v = hp * Math.exp(-(k / SR) * 70) * gain;
      add(L, s0 + k, v * 0.8);
      add(R, s0 + k, v);
    }
  }

  function clap(t: number, gain = 0.32): void {
    const s0 = Math.round(t * SR);
    const len = Math.round(0.22 * SR);
    let lp = 0;
    for (let k = 0; k < len; k++) {
      const tt = k / SR;
      const n = NOISE[(k * 13 + 101) % NOISE.length];
      lp += 0.45 * (n - lp);
      const burst = tt < 0.03 ? (Math.floor(tt / 0.01) % 2 === 0 ? 1 : 0.4) : 1;
      const v = (lp * 1.6 + Math.sin(2 * Math.PI * 190 * tt) * 0.25) * Math.exp(-tt * 18) * burst * gain;
      add(L, s0 + k, v);
      add(R, s0 + k, v * 0.9);
    }
  }

  // 1 小節ごとに Am - F - C - G
  const ROOTS = [55, 43.65, 65.41, 49.0];
  const PADS = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 261.63, 329.63],
    [196, 246.94, 293.66],
  ];

  function bassAndPad(t0: number, t1: number, padGain: number, bassGain: number, fadeInSec = 0.4): void {
    const s0 = Math.round(t0 * SR);
    const s1 = Math.round(t1 * SR);
    for (let i = s0; i < s1 && i < N; i++) {
      const t = i / SR;
      const bar = Math.floor(t / BAR) % 4;
      const f = ROOTS[bar];
      const fadeIn = Math.min(1, (t - t0) / fadeInSec);
      const bass = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t)) * bassGain;
      let pad = 0;
      for (const pf of PADS[bar]) {
        pad += Math.sin(2 * Math.PI * pf * t) + Math.sin(2 * Math.PI * pf * 1.004 * t) * 0.8;
        pad += (Math.sin(2 * Math.PI * pf * 3 * t) / 9) * 0.6;
      }
      pad *= padGain / 3;
      const v = (bass + pad) * fadeIn;
      L[i] += v * 0.95;
      R[i] += v;
    }
  }

  function riser(t0: number, t1: number, gain: number): void {
    const s0 = Math.round(t0 * SR);
    const s1 = Math.round(t1 * SR);
    let lp = 0;
    for (let i = s0; i < s1 && i < N; i++) {
      const p = (i - s0) / (s1 - s0);
      const n = NOISE[(i * 3) % NOISE.length];
      const a = 0.05 + 0.6 * p;
      lp += a * (n - lp);
      const v = lp * p * p * gain;
      L[i] += v;
      R[i] += v * 0.85;
    }
  }

  // 浮動小数の積み上げで 1 本ずれないよう、個数で回す
  function grid(t0: number, t1: number, step: number): number[] {
    const out: number[] = [];
    for (let k = 0; t0 + k * step < t1 - 1e-6; k++) out.push(t0 + k * step);
    return out;
  }

  if (style === "cm") {
    for (const [t, g] of HITS) kick(t, g);
    for (const t of grid(GROOVE, PUSH0, BEAT)) kick(t, 0.85);
    for (const t of grid(GROOVE, PUSH0, BEAT)) hat(t + BEAT / 2);
    // クラップ: groove 開始の次の偶数 beat から 2 beat おき（試作と同じ位置）
    const firstClap = Math.ceil((GROOVE + BEAT) / (2 * BEAT) - 1e-9) * 2 * BEAT;
    for (const t of grid(firstClap, PUSH0, 2 * BEAT)) clap(t);
    bassAndPad(GROOVE, GAP0, 0.035, 0.22);
    for (const t of grid(PUSH0, GAP0, BEAT)) kick(t, 0.9);
    for (const t of grid(GAP0 - 2 * BEAT, GAP0, BEAT / 2)) kick(t, 0.75);
    for (const t of grid(PUSH0 + BEAT / 2, GAP0, BEAT / 2)) hat(t, 0.22);
    riser(PUSH0, GAP0, 0.35);
    kick(LOGO, 1.25, true);
    bassAndPad(LOGO, DUR, 0.05, 0.12);
  } else {
    bassAndPad(0, GAP0, 0.03, 0.18, 1.5);
    for (const t of grid(0, GROOVE, BEAT)) kick(t, 0.55);
    for (const t of grid(GROOVE, PUSH0, BEAT)) kick(t, 0.75);
    for (const t of grid(GROOVE + BEAT / 2, GAP0, BEAT)) hat(t, 0.14);
    for (const t of grid(GROOVE + 2 * BEAT, PUSH0, 2 * BEAT)) clap(t, 0.22);
    for (const t of grid(PUSH0, GAP0, BEAT / 2)) kick(t, 0.7);
    riser(GAP0 - 4 * BEAT, GAP0, 0.3);
    kick(LOGO, 1.2, true);
    bassAndPad(LOGO, DUR, 0.05, 0.12);
  }

  for (let i = 0; i < N; i++) {
    const d = duck[i];
    L[i] *= 0.55 + 0.45 * d;
    R[i] *= 0.55 + 0.45 * d;
  }
  // ロゴ直前の無音（キックの尾だけ短く残して切る）
  for (let i = Math.round((GAP0 + 0.05) * SR); i < Math.round(LOGO * SR) && i < N; i++) {
    const p = Math.min(1, (i - (GAP0 + 0.05) * SR) / (0.05 * SR));
    L[i] *= 1 - p;
    R[i] *= 1 - p;
  }
  const FADE0 = DUR - FADE;
  for (let i = Math.round(FADE0 * SR); i < N; i++) {
    const g = 1 - (i - FADE0 * SR) / (FADE * SR);
    L[i] *= Math.max(0, g);
    R[i] *= Math.max(0, g);
  }

  // ソフトクリップ → -3 dBFS に正規化
  let peak = 0;
  for (let i = 0; i < N; i++) {
    L[i] = Math.tanh(L[i] * 1.2);
    R[i] = Math.tanh(R[i] * 1.2);
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  if (peak === 0) throw new BgmError("無音のバッファになりました（引数を見直してください）");
  const norm = 0.708 / peak;

  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), i * 4);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  // 一時ファイルに書いてから置き換える（途中で落ちても前の bgm.wav が壊れない）
  writeFileAtomic(OUT, Buffer.concat([header, data]));
  console.log(
    `[ok] ${OUT}  ${DUR} 秒 / style=${style} / ${BPM} BPM / groove ${GROOVE} 秒〜 / 盛り上げ ${PUSH0.toFixed(2)} 秒〜 / ` +
      `無音 ${GAP0.toFixed(2)}〜${LOGO} 秒 / ロゴ ${LOGO} 秒（ピーク ${peak.toFixed(3)} から正規化）`,
  );
}

try {
  run();
} catch (e) {
  if (e instanceof BgmError) console.error(`[gen-bgm] ${e.message}`);
  else console.error(`[gen-bgm] 想定外のエラー: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
}
