// 効果音（シュッ・ドン・カチッ・ポン・チャイム）を計算で作り、wav に書く。素材のダウンロードは要らない。
// 同じ引数なら毎回同じ音になる（雑音も決まった種から作る）。外部のプログラムは使わない。
//
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-sfx.ts" --out <動画のフォルダ>/assets/audio
//   → whoosh.wav / whoosh-short.wav / whoosh-cinematic.wav / impact.wav / click.wav / pop.wav / chime.wav / ping.wav
//
// 作ったのは自分なので、著作権・帰属表示の心配が無い（商用の動画にもそのまま使える）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic.ts";

export const SAMPLE_RATE = 44100;
/** 書き出す音の最大の大きさ（−3 dBFS） */
export const PEAK = 10 ** (-3 / 20);

type Synth = (n: number, sr: number, rnd: () => number) => Float32Array;

/** 決まった種から作る雑音（毎回同じ音にするため） */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** 帯域を動かした雑音（風を切る音）。lo→hi→lo Hz に動く 2 段の低域通過 − 低域通過の差（帯域通過のかわり） */
function whoosh(seconds: number, lo: number, hi: number, gain = 1): Synth {
  return (_n, sr, rnd) => {
    const n = Math.round(seconds * sr);
    const out = new Float32Array(n);
    let a = 0;
    let b = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const bell = Math.sin(Math.PI * t) ** 2;
      const fc = lo + (hi - lo) * bell;
      const k1 = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      const k2 = 1 - Math.exp((-2 * Math.PI * fc * 0.35) / sr);
      const x = rnd() * 2 - 1;
      a += k1 * (x - a);
      b += k2 * (a - b);
      out[i] = (a - b) * bell * gain;
    }
    return out;
  };
}

const SYNTHS: Record<string, Synth> = {
  whoosh: whoosh(0.57, 300, 3200),
  "whoosh-short": whoosh(0.4, 500, 4200),
  "whoosh-cinematic": whoosh(1.3, 150, 1800, 1.2),
  impact: (_n, sr, rnd) => {
    const n = Math.round(1.0 * sr);
    const out = new Float32Array(n);
    let phase = 0;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 42 + 90 * Math.exp(-t * 18);
      phase += (2 * Math.PI * f) / sr;
      const body = Math.sin(phase) * Math.exp(-t * 4.2);
      lp += 0.08 * (rnd() * 2 - 1 - lp);
      const thump = lp * Math.exp(-t * 60) * 2.5;
      out[i] = Math.tanh((body + thump) * 1.6);
    }
    return out;
  },
  click: (_n, sr, rnd) => {
    const n = Math.round(0.37 * sr);
    const out = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const x = rnd() * 2 - 1;
      const hp = x - prev;
      prev = x;
      out[i] = hp * Math.exp(-t * 900) * 0.8 + Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t * 260) * 0.6;
    }
    return out;
  },
  pop: (_n, sr) => {
    const n = Math.round(0.5 * sr);
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 260 + 700 * Math.exp(-t * 40);
      phase += (2 * Math.PI * f) / sr;
      out[i] = Math.sin(phase) * Math.exp(-t * 22) * Math.min(1, t * 2000);
    }
    return out;
  },
  chime: (_n, sr) => {
    const n = Math.round(1.4 * sr);
    const out = new Float32Array(n);
    const notes = [
      { f: 1046.5, at: 0 },
      { f: 1318.5, at: 0.09 },
      { f: 1568, at: 0.18 },
    ];
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let s = 0;
      for (const nt of notes) {
        const u = t - nt.at;
        if (u < 0) continue;
        const env = Math.exp(-u * 3.2) * Math.min(1, u * 400);
        s += (Math.sin(2 * Math.PI * nt.f * u) + 0.25 * Math.sin(2 * Math.PI * nt.f * 2.01 * u)) * env;
      }
      out[i] = s / 2;
    }
    return out;
  },
  ping: (_n, sr) => {
    const n = Math.round(0.8 * sr);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      out[i] = (Math.sin(2 * Math.PI * 1760 * t) + 0.3 * Math.sin(2 * Math.PI * 3520 * t)) * Math.exp(-t * 6) * Math.min(1, t * 600);
    }
    return out;
  },
};

export const SFX_NAMES = Object.keys(SYNTHS);

/** 1 つの効果音のサンプル列（最大 −3 dBFS にそろえ、最後の 10 ms はなめらかに消す） */
export function render(name: string, sr = SAMPLE_RATE): Float32Array {
  const synth = SYNTHS[name];
  if (!synth) throw new Error(`知らない効果音です: ${name}（${SFX_NAMES.join(" / ")}）`);
  const x = synth(0, sr, makeRandom(name.split("").reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261)));
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? PEAK / peak : 0;
  const fade = Math.min(x.length, Math.round(0.01 * sr));
  for (let i = 0; i < x.length; i++) {
    const tail = x.length - i <= fade ? (x.length - i) / fade : 1;
    x[i] *= g * tail;
  }
  return x;
}

/** 16bit mono の wav のバイト列 */
export function toWav(samples: Float32Array, sr = SAMPLE_RATE): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`gen-sfx.ts — 効果音を計算で作る（${SFX_NAMES.join(" / ")}）\n  node gen-sfx.ts --out <assets/audio のフォルダ>`);
    return 0;
  }
  const i = argv.indexOf("--out");
  const out = i >= 0 ? argv[i + 1] : undefined;
  if (!out || out.startsWith("--")) {
    console.error("[gen-sfx] --out <フォルダ> が必要です");
    return 1;
  }
  const dir = path.resolve(out);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of SFX_NAMES) {
    const s = render(name);
    writeFileAtomic(path.join(dir, `${name}.wav`), toWav(s));
    console.log(`[ok] ${path.join(dir, `${name}.wav`)}  ${(s.length / SAMPLE_RATE).toFixed(2)} 秒`);
  }
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
if (isEntry()) process.exit(main(process.argv.slice(2)));
