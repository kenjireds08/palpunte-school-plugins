// ナレーションの声の種類（Gemini か ElevenLabs か）と声を設定に書く。初めての動画のときに 1 回だけ受講生に選んでもらい、次からは控えを使う。
//
//   node voice-choice.ts show
//       控え（~/.config/school-starter/showcase-profile.json の voiceProvider・voiceId）を出す。無ければ「まだありません」
//   node voice-choice.ts save --config <showcase.config.json> --provider gemini|elevenlabs [--voice <番号か声の ID>]
//       設定の tts（provider・voice・model）を書き、控えにも残す（制作クレジットの控えと同じファイル。ほかの項目は消さない）
//       --voice は聞き比べ（voice-samples.ts place）の番号。省くと、控えに同じ種類の声があればその声、無ければおすすめ（1 番）
//
// 声の種類:
//   gemini     … Gemini の読み上げ（おすすめの声 ja-jp-commercial-4）。無料枠は 1 日 10 回まで・無料枠では原稿が Google の品質改善に使われる
//   elevenlabs … ElevenLabs（おすすめの声 Yuma Uchida＝見本の動画の声）。Starter（月 6 ドル）以上が要る（無料プランでは API から使えない）
// 声の候補は voice-samples/catalog.json（聞き比べの番号と同じ）。控えのファイルには鍵やパスワードを入れない。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic.ts";
import { DEFAULT_VOICE } from "./lib/eleven-client.ts";
import { PROVIDER_LABEL, findCandidate, loadCatalog, type Candidate, type Catalog } from "./lib/voice-catalog.ts";
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

/** 設定の tts を、選んだ声の種類（と声）の値にする（純粋関数・テストあり）。voice を省くとおすすめの声。tts の $comment は残す */
export function applyChoice(cfg: Record<string, unknown>, provider: Provider, voice?: { id: string; model: string }): Record<string, unknown> {
  const p = PRESETS[provider];
  const before = cfg.tts && typeof cfg.tts === "object" && !Array.isArray(cfg.tts) ? (cfg.tts as Record<string, unknown>) : {};
  const tts: Record<string, unknown> = {};
  if (typeof before.$comment === "string") tts.$comment = before.$comment;
  tts.provider = p.provider;
  tts.voice = voice?.id ?? p.voice;
  tts.model = voice?.model ?? p.model;
  return { ...cfg, tts };
}

/**
 * どの声にするかを決める（テストあり）。
 *   --voice あり → 候補の一覧（番号か ID）から引く。一覧に無ければ止める
 *   --voice なし → 控えの声の種類が同じで、控えの声が一覧にあればその声（「前と同じ」）。無ければおすすめ（1 番）
 * 1.29 までの控え（voiceProvider だけで voiceId が無い）は、おすすめの声になる（Gemini は 1.30 でおすすめが ja-jp-commercial-4 に変わったので、1.29 の既定 ja-jp-advisor-3 とは違う声になる。講師が了承済み）
 */
export function resolveVoice(provider: Provider, sel: string | undefined, profile: Record<string, unknown>, cat: Catalog = loadCatalog()): Candidate {
  if (sel !== undefined) {
    const c = findCandidate(cat, provider, sel);
    if (!c) {
      const opts = cat[provider].map((x) => `${x.no}. ${x.label}`).join(" / ");
      throw new VoiceChoiceError(`--voice ${sel} は ${PROVIDER_LABEL[provider]} の候補にありません（${opts}）`);
    }
    return c;
  }
  if (profile.voiceProvider === provider && typeof profile.voiceId === "string") {
    const prev = findCandidate(cat, provider, profile.voiceId);
    if (prev) return prev;
  }
  return cat[provider][0];
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

const HELP = `voice-choice.ts — ナレーションの声の種類と声を選ぶ（初めての動画のときに 1 回だけ。「声を変えて」と言われたら選び直す）
  show
  save --config <showcase.config.json> --provider gemini|elevenlabs [--voice <番号か声の ID>]
  番号は voice-samples.ts place の聞き比べの番号（省くと、控えの声かおすすめの 1 番）`;

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
      console.log("声の種類の控えはまだありません（初めての動画です。Gemini か ElevenLabs かを受講生に 1 回だけ聞き、そのあと声を聞き比べて選んでもらう）");
      return 0;
    }
    const v = resolveVoice(p.voiceProvider, undefined, p);
    const fromProfile = typeof p.voiceId === "string" && p.voiceId === v.id;
    console.log(`控え: 声の種類 ${p.voiceProvider}（${PRESETS[p.voiceProvider].label}）・声 ${v.no}. ${v.label}（${v.id}）${fromProfile ? "" : "【声の控えが無いので、おすすめの声】"}`);
    return 0;
  }
  if (cmd !== "save") throw new VoiceChoiceError(`知らないサブコマンドです: ${cmd}（show / save）`);
  const opts = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k !== "--config" && k !== "--provider" && k !== "--voice") throw new VoiceChoiceError(`save では使えない引数です: ${k}（--config / --provider / --voice）`);
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
  const pf = profileFile();
  const prof = fs.existsSync(pf) ? readJson(pf) : {};
  const voice = resolveVoice(provider, opts.get("--voice"), prof);
  const abs = path.resolve(cfgPath);
  const cfg = readJson(abs);
  writeFileAtomic(abs, `${JSON.stringify(applyChoice(cfg, provider, voice), null, 2)}\n`);
  fs.mkdirSync(path.dirname(pf), { recursive: true });
  writeFileAtomic(
    pf,
    `${JSON.stringify({ ...prof, voiceProvider: provider, voiceId: voice.id, voiceModel: voice.model, voiceLabel: voice.label, voiceSavedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  const p = PRESETS[provider];
  console.log(`[ok] 声の種類: ${PROVIDER_LABEL[provider]}・声 ${voice.no}. ${voice.label}（voice ${voice.id}・model ${voice.model}）`);
  console.log(`     設定 ${abs} の tts と、次の動画のための控え ${pf} に書きました`);
  console.log(`     台本は ${p.script} を写し、台本の voice を ${voice.id}・model を ${voice.model} にする・声を作る道具は ${p.tool}・キーは ${p.key}（無ければ save-key.ts ${p.saveArg} を受講生がターミナルで実行）`);
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
