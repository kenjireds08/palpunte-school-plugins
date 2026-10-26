// ナレーションの声の種類（Gemini か ElevenLabs か）を設定に書く。初めての動画のときに 1 回だけ受講生に選んでもらい、次からは控えを使う。
//
//   node voice-choice.ts show
//       控え（~/.config/school-starter/showcase-profile.json の voiceProvider）を出す。無ければ「まだありません」
//   node voice-choice.ts save --config <showcase.config.json> --provider gemini|elevenlabs
//       設定の tts（provider・voice・model）を書き、控えにも残す（制作クレジットの控えと同じファイル。ほかの項目は消さない）
//
// 声の種類:
//   gemini     … Gemini の読み上げ（既定の声 ja-jp-advisor-3）。無料枠あり・1 日の回数に上限・無料枠では原稿が Google の品質改善に使われる
//   elevenlabs … ElevenLabs の Yuma Uchida（見本の動画の声）。Starter（月 6 ドル）以上が要る（無料プランでは API から使えない）
// 控えのファイルには鍵やパスワードを入れない。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic.ts";
import { DEFAULT_VOICE } from "./lib/eleven-client.ts";
import { profileFile } from "./credit.ts";
import { DEFAULT_GEMINI } from "./gemini-tts.ts";

export class VoiceChoiceError extends Error {}

export type Provider = "gemini" | "elevenlabs";

export const PRESETS: Record<Provider, { provider: Provider; voice: string; model: string; label: string; script: string; tool: string; key: string; saveArg: string }> = {
  gemini: {
    provider: "gemini",
    voice: DEFAULT_GEMINI.voice,
    model: DEFAULT_GEMINI.model,
    label: "Gemini（無料枠あり）",
    script: "templates/narration.script.gemini.example.json",
    tool: "gemini-tts.ts",
    key: "GEMINI_API_KEY",
    saveArg: "gemini",
  },
  elevenlabs: {
    provider: "elevenlabs",
    voice: DEFAULT_VOICE.id,
    model: DEFAULT_VOICE.model,
    label: `ElevenLabs（${DEFAULT_VOICE.name}・Starter 以上）`,
    script: "templates/narration.script.example.json",
    tool: "eleven-tts.ts",
    key: "ELEVENLABS_API_KEY",
    saveArg: "elevenlabs",
  },
};

export function isProvider(v: unknown): v is Provider {
  return v === "gemini" || v === "elevenlabs";
}

/** 設定の tts を、選んだ声の種類の値にする（純粋関数・テストあり）。tts の $comment は残す */
export function applyChoice(cfg: Record<string, unknown>, provider: Provider): Record<string, unknown> {
  const p = PRESETS[provider];
  const before = cfg.tts && typeof cfg.tts === "object" && !Array.isArray(cfg.tts) ? (cfg.tts as Record<string, unknown>) : {};
  const tts: Record<string, unknown> = {};
  if (typeof before.$comment === "string") tts.$comment = before.$comment;
  tts.provider = p.provider;
  tts.voice = p.voice;
  tts.model = p.model;
  return { ...cfg, tts };
}

function readJson(file: string): Record<string, unknown> {
  try {
    const v = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("形が違います");
    return v as Record<string, unknown>;
  } catch (e) {
    throw new VoiceChoiceError(`JSON を読めません: ${file}（${(e as Error).message}）`);
  }
}

const HELP = `voice-choice.ts — ナレーションの声の種類を選ぶ（初めての動画のときに 1 回だけ）
  show
  save --config <showcase.config.json> --provider gemini|elevenlabs`;

function main(argv: string[]): number {
  const [cmd = "help", ...rest] = argv;
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return 0;
  }
  if (cmd === "show") {
    if (rest.length > 0) throw new VoiceChoiceError(`show にオプションはありません: ${rest.join(" ")}`);
    const f = profileFile();
    const p = fs.existsSync(f) ? readJson(f) : {};
    if (!isProvider(p.voiceProvider)) {
      console.log("声の種類の控えはまだありません（初めての動画です。Gemini か ElevenLabs かを受講生に 1 回だけ聞く）");
      return 0;
    }
    console.log(`控え: 声の種類 ${p.voiceProvider}（${PRESETS[p.voiceProvider].label}）`);
    return 0;
  }
  if (cmd !== "save") throw new VoiceChoiceError(`知らないサブコマンドです: ${cmd}（show / save）`);
  const opts = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k !== "--config" && k !== "--provider") throw new VoiceChoiceError(`save では使えない引数です: ${k}（--config / --provider）`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) throw new VoiceChoiceError(`${k} には値が必要です`);
    if (opts.has(k)) throw new VoiceChoiceError(`${k} が 2 回指定されています`);
    opts.set(k, v);
    i++;
  }
  const cfgPath = opts.get("--config");
  const provider = opts.get("--provider");
  if (!cfgPath) throw new VoiceChoiceError("--config <showcase.config.json> が必要です");
  if (!isProvider(provider)) throw new VoiceChoiceError(`--provider は gemini か elevenlabs です: ${String(provider)}`);
  const abs = path.resolve(cfgPath);
  const cfg = readJson(abs);
  writeFileAtomic(abs, `${JSON.stringify(applyChoice(cfg, provider), null, 2)}\n`);
  const pf = profileFile();
  const prof = fs.existsSync(pf) ? readJson(pf) : {};
  fs.mkdirSync(path.dirname(pf), { recursive: true });
  writeFileAtomic(pf, `${JSON.stringify({ ...prof, voiceProvider: provider, voiceSavedAt: new Date().toISOString() }, null, 2)}\n`);
  const p = PRESETS[provider];
  console.log(`[ok] 声の種類: ${p.label}・voice ${p.voice}・model ${p.model}`);
  console.log(`     設定 ${abs} の tts と、次の動画のための控え ${pf} に書きました`);
  console.log(`     台本は ${p.script} を写す・声を作る道具は ${p.tool}・キーは ${p.key}（無ければ save-key.ts ${p.saveArg} を受講生がターミナルで実行）`);
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
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`[voice-choice] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
