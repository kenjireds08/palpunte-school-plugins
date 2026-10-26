// 【講師用】声の聞き比べの試聴音声（同じ 1 文・数秒の mp3）を作り、voice-samples/ に同梱する。受講生は使わない。
// 受講生の手元で作らないのは、Gemini の無料枠が 1 日 10 回で、本番の声（1 本で 7 回＋読み直し）に使うため。
//
//   node gen-voice-samples.ts --provider gemini [--dry-run] [--force]
//       catalog.json の Gemini の候補を 1 候補 1 回ずつ作る（作ってある mp3 は作り直さない＝回数を使わない）。
//       作る前に、声の一覧（GET /v1beta/voices?language_code=ja-JP・読み上げの回数は使わない）で候補の声が実在するかを確かめる
//   node gen-voice-samples.ts --provider elevenlabs --list
//       Voice Library の日本語の声（GET /v1/shared-voices?language=ja・課金なし）を、使われている順に出す
//   node gen-voice-samples.ts --provider elevenlabs [--pick <ID>]... [--auto <数>] [--dry-run] [--force]
//       候補を足して（--pick で ID を指定・--auto で一覧の上から男女を交互に）catalog.json に書き、1 候補 1 回ずつ作る（字数を使う）
//
// キーは 環境変数 → 共通の置き場（~/.config/school-starter/credentials.env）。値は画面に出さない。
// 終了コード: 0 成功 / 1 失敗 / 5 キーが無い・1 日の上限など（作り終えた分は残る。もう一度実行すると続きから）

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic.ts";
import { ensureFfmpegOnPath } from "./lib/ffpath.mjs";
import { ELEVEN_DEFAULT_BASE, ElevenStop, elevenFetch, normalizeLoudness, type ElevenSpec } from "./lib/eleven-client.ts";
import { findKey, redactKeys } from "./lib/keys.ts";
import { catalogFile, loadCatalog, samplesDir, validateCatalog, type Candidate, type Catalog, type Provider } from "./lib/voice-catalog.ts";
import { GEMINI_DEFAULT_BASE, GeminiStop, extractAudio, parseWav, requestBody, requestSpeech, type Job } from "./gemini-tts.ts";
import { pickModel } from "./voices.ts";

export class GenError extends Error {}
export const PREMISE_EXIT = 5;
/** ElevenLabs の候補はおすすめを含めて最大 4 つ */
export const MAX_CANDIDATES = 4;

let activeKey: string | null = null;
const redact = (x: unknown) => redactKeys(x instanceof Error ? x.message : String(x), [activeKey]);

// ---------- 引数 ----------

export type Args = { provider: Provider; dryRun: boolean; force: boolean; list: boolean; pick: string[]; auto: number; help: boolean };

export function parseArgs(argv: string[]): Args {
  const a: Args = { provider: "gemini", dryRun: false, force: false, list: false, pick: [], auto: 0, help: false };
  let provider: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--help" || k === "-h") a.help = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--force") a.force = true;
    else if (k === "--list") a.list = true;
    else if (k === "--provider" || k === "--pick" || k === "--auto") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new GenError(`${k} には値が必要です`);
      i++;
      if (k === "--provider") {
        if (provider !== null) throw new GenError("--provider が 2 回指定されています");
        provider = v;
      } else if (k === "--pick") {
        if (!/^[A-Za-z0-9]+$/.test(v)) throw new GenError(`--pick は声の ID（英数字）です: ${v}`);
        a.pick.push(v);
      } else {
        if (!/^[1-9]$/.test(v)) throw new GenError(`--auto は 1〜9 の数です: ${v}`);
        a.auto = Number(v);
      }
    } else throw new GenError(`知らない引数です: ${k}（--help で一覧）`);
  }
  if (a.help) return a;
  if (provider !== "gemini" && provider !== "elevenlabs") throw new GenError(`--provider は gemini か elevenlabs です: ${String(provider)}`);
  a.provider = provider;
  if (provider === "gemini" && (a.list || a.pick.length || a.auto)) throw new GenError("--list・--pick・--auto は elevenlabs だけです（Gemini の候補は catalog.json に書いてあります）");
  return a;
}

// ---------- 音声の後始末（−16 LUFS にそろえて mp3 にする） ----------

function toMp3(srcAudio: string, dest: string): void {
  const tmpWav = path.join(os.tmpdir(), `voice-sample-${process.pid}-${Date.now()}.wav`);
  const tmpMp3 = `${dest}.tmp-${process.pid}.mp3`;
  try {
    normalizeLoudness(srcAudio, tmpWav, { sampleRate: 24000, channels: 1 });
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", tmpWav, "-c:a", "libmp3lame", "-b:a", "64k", "-ar", "24000", "-ac", "1", tmpMp3], { encoding: "utf8" });
    if (r.error) throw new GenError(`ffmpeg を起動できませんでした: ${r.error.message}`);
    if (r.status !== 0) throw new GenError(`mp3 にできませんでした（ffmpeg）: ${String(r.stderr).slice(0, 400)}`);
    fs.renameSync(tmpMp3, dest);
  } finally {
    fs.rmSync(tmpWav, { force: true });
    fs.rmSync(tmpMp3, { force: true });
  }
}

const targetOf = (dir: string, c: Candidate, provider: Provider) => path.join(dir, provider, `${c.no}.mp3`);

// ---------- Gemini ----------

/** 声の一覧（ja-JP）の id を全部取る。読み上げの回数は使わない */
async function geminiVoiceIds(base: string, key: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 10; page++) {
    const q = new URLSearchParams({ language_code: "ja-JP", page_size: "200" });
    if (token) q.set("page_token", token);
    const res = await fetch(`${base}/voices?${q}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    if (!res.ok) throw new GenError(`Gemini の声の一覧を読めませんでした（HTTP ${res.status}）: ${redact(text).slice(0, 400)}`);
    const j = JSON.parse(text) as { voices?: Array<{ id?: unknown; name?: unknown }>; next_page_token?: string; nextPageToken?: string };
    for (const v of j.voices ?? []) {
      if (typeof v.id === "string") ids.add(v.id);
      else if (typeof v.name === "string") ids.add(v.name.replace(/^voices\//, ""));
    }
    token = j.next_page_token ?? j.nextPageToken;
    if (!token) break;
  }
  return ids;
}

async function genGemini(cat: Catalog, dir: string, a: Args): Promise<number> {
  const todo = cat.gemini.filter((c) => a.force || !fs.existsSync(targetOf(dir, c, "gemini")));
  for (const c of cat.gemini) console.log(`${todo.includes(c) ? "[作る]" : "[作成済み]"} ${c.no}. ${c.id}（${c.label}）`);
  console.log(`読み上げの呼び出し: ${todo.length} 回（1 候補 1 回・取り直しがあれば増える）。試聴の 1 文「${cat.sentence}」`);
  if (a.dryRun || todo.length === 0) return 0;
  const found = findKey("GEMINI_API_KEY");
  if (!found) throw new GeminiStop("Gemini のキーがありません（save-key.ts gemini で保存する）");
  activeKey = found.value;
  console.log(`Gemini のキー: ${found.source}で見つけました`);
  const base = (process.env.SHOWCASE_GEMINI_API_BASE || GEMINI_DEFAULT_BASE).replace(/\/+$/, "");
  const ids = await geminiVoiceIds(base, found.value);
  const missing = cat.gemini.filter((c) => !ids.has(c.id));
  if (missing.length > 0) throw new GenError(`声の一覧（ja-JP・${ids.size} 件）に無い候補があります: ${missing.map((m) => m.id).join(", ")}（1 回も読み上げを呼んでいません）`);
  console.log(`声の一覧（ja-JP・${ids.size} 件）に候補 ${cat.gemini.length} つがすべてあります`);
  const state = { lastCallAt: 0 };
  fs.mkdirSync(path.join(dir, "gemini"), { recursive: true });
  for (const c of todo) {
    const job: Job = { id: `sample-${c.no}`, index: c.no - 1, text: cat.sentence, out: "", spec: { model: c.model, voice: c.id, style: "" } };
    const resp = await requestSpeech({ base, key: found.value, body: requestBody(job), timeoutMs: 120000, state });
    const wav = extractAudio(resp);
    const info = parseWav(wav);
    const tmp = path.join(os.tmpdir(), `voice-sample-api-${process.pid}-${c.no}.wav`);
    try {
      fs.writeFileSync(tmp, wav);
      toMp3(tmp, targetOf(dir, c, "gemini"));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    console.log(`[ok] ${targetOf(dir, c, "gemini")}  ${info.seconds.toFixed(2)} 秒  ${c.id}`);
  }
  writeCatalog(dir, { ...cat, gemini: cat.gemini.map((c) => ({ ...c, file: `gemini/${c.no}.mp3` })) });
  return 0;
}

// ---------- ElevenLabs ----------

export type SharedVoice = {
  voice_id: string;
  public_owner_id?: string;
  name: string;
  gender?: string;
  age?: string;
  accent?: string;
  descriptive?: string;
  use_case?: string;
  language?: string;
  rate?: number;
  cloned_by_count?: number;
  usage_character_count_1y?: number;
  live_moderation_enabled?: boolean;
  free_users_allowed?: boolean;
  verified_languages?: Array<{ language?: string; model_id?: string }>;
};

/** 受講生に見せる一言（純粋関数・テストあり） */
export function elevenLabel(v: SharedVoice): string {
  const g = v.gender === "male" ? "男性" : v.gender === "female" ? "女性" : "声";
  const age = v.age === "young" ? "若い" : v.age === "middle_aged" ? "落ち着いた年代の" : v.age === "old" ? "年配の" : "";
  const desc: Record<string, string> = { calm: "穏やかな", confident: "自信のある", warm: "あたたかい", professional: "きちんとした", casual: "気さくな", deep: "低めの", soft: "やわらかい", upbeat: "明るい", energetic: "元気な", friendly: "親しみやすい", formal: "改まった" };
  const d = v.descriptive && desc[v.descriptive] ? desc[v.descriptive] : "";
  return `${d}${age}${g}（${v.name}）`;
}

/** 日本語の声として使ってよいか・自動で選ぶ順（純粋関数・テストあり） */
export function eligibleShared(list: SharedVoice[], excludeIds: Set<string>): SharedVoice[] {
  const seen = new Set<string>();
  return list
    .filter((v) => typeof v?.voice_id === "string" && v.language === "ja" && !excludeIds.has(v.voice_id))
    .filter((v) => (seen.has(v.voice_id) ? false : (seen.add(v.voice_id), true)))
    .filter((v) => !v.live_moderation_enabled && (v.rate === undefined || v.rate === null || v.rate <= 1))
    .sort((x, y) => (y.usage_character_count_1y ?? 0) - (x.usage_character_count_1y ?? 0));
}

/** 男女が交互になるように上から n 個取る（純粋関数・テストあり） */
export function pickAlternating(list: SharedVoice[], n: number, startWith: "female" | "male" = "female"): SharedVoice[] {
  const out: SharedVoice[] = [];
  const pools = { female: list.filter((v) => v.gender === "female"), male: list.filter((v) => v.gender === "male") };
  let turn: "female" | "male" = startWith;
  while (out.length < n && (pools.female.length || pools.male.length)) {
    const p = pools[turn].length ? pools[turn] : pools[turn === "female" ? "male" : "female"];
    out.push(p.shift() as SharedVoice);
    turn = turn === "female" ? "male" : "female";
  }
  return out;
}

async function listShared(base: string, key: string): Promise<SharedVoice[]> {
  const all: SharedVoice[] = [];
  for (let page = 0; page < 3; page++) {
    const q = new URLSearchParams({ language: "ja", page_size: "100", sort: "usage_character_count_1y", page: String(page) });
    const res = await fetch(`${base}/v1/shared-voices?${q}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    if (!res.ok) throw new GenError(`Voice Library の一覧を読めませんでした（HTTP ${res.status}）: ${redact(text).slice(0, 400)}`);
    const j = JSON.parse(text) as { voices?: SharedVoice[]; has_more?: boolean };
    all.push(...(j.voices ?? []));
    if (!j.has_more) break;
  }
  return all;
}

const jaModels = (v: SharedVoice) => [...new Set((v.verified_languages ?? []).filter((l) => l?.language === "ja" && typeof l.model_id === "string").map((l) => l.model_id as string))];

async function genEleven(cat: Catalog, dir: string, a: Args): Promise<number> {
  const found = findKey("ELEVENLABS_API_KEY");
  if (!found) throw new ElevenStop("premise", "ElevenLabs のキーがありません（save-key.ts elevenlabs で保存する）");
  activeKey = found.value;
  const base = (process.env.SHOWCASE_ELEVEN_API_BASE || ELEVEN_DEFAULT_BASE).replace(/\/+$/, "");
  let next = cat;
  if (a.list || a.pick.length || a.auto) {
    const shared = eligibleShared(await listShared(base, found.value), new Set());
    if (a.list) {
      console.log("Voice Library の日本語の声（1 年の利用字数の多い順・料金が上乗せされる声とライブ監視の声は除く）:");
      for (const v of shared.slice(0, 40)) {
        console.log(`  ${v.voice_id}  ${v.name}  ${v.gender ?? "-"}・${v.age ?? "-"}・${v.descriptive ?? "-"}・${v.use_case ?? "-"}  日本語で確かめ済みのモデル: ${jaModels(v).join(",") || "なし"}`);
      }
      return 0;
    }
    const have = new Set(cat.elevenlabs.map((c) => c.id));
    const room = MAX_CANDIDATES - cat.elevenlabs.length;
    let chosen: SharedVoice[] = [];
    for (const id of a.pick) {
      const v = shared.find((x) => x.voice_id === id);
      if (!v) throw new GenError(`--pick ${id} は Voice Library の日本語の声の一覧（上位 300 件）にありません（--list で確かめる）`);
      if (!have.has(id)) chosen.push(v);
    }
    // --auto は空いている数までしか足さない（途中で止まったあと同じコマンドをもう一度実行しても、上限で止まらない）
    const autoN = Math.max(0, Math.min(a.auto, room - chosen.length));
    if (autoN > 0) chosen = [...chosen, ...pickAlternating(shared.filter((v) => !have.has(v.voice_id) && !chosen.includes(v)), autoN)];
    if (chosen.length > room) throw new GenError(`候補はおすすめを含めて ${MAX_CANDIDATES} つまでです（今 ${cat.elevenlabs.length} つ・足せるのは ${room} つ）`);
    next = {
      ...cat,
      elevenlabs: [
        ...cat.elevenlabs,
        ...chosen.map((v, i) => ({
          no: cat.elevenlabs.length + i + 1,
          id: v.voice_id,
          model: pickModel(jaModels(v)) ?? "eleven_v4",
          label: elevenLabel(v),
          recommended: false,
          source: `Voice Library: ${v.name}（${v.gender ?? "-"}・${v.age ?? "-"}・${v.descriptive ?? "-"}・${v.use_case ?? "-"}）`,
          file: null,
        })),
      ],
    };
    validateCatalog(next);
  }
  const todo = next.elevenlabs.filter((c) => a.force || !fs.existsSync(targetOf(dir, c, "elevenlabs")));
  for (const c of next.elevenlabs) console.log(`${todo.includes(c) ? "[作る]" : "[作成済み]"} ${c.no}. ${c.id}（${c.label}・${c.model}）`);
  const chars = [...cat.sentence].length;
  console.log(`作る本数 ${todo.length}・使う字数 約 ${chars * todo.length}（1 本 ${chars} 字）`);
  if (a.dryRun) return 0;
  if (next !== cat) writeCatalog(dir, next);
  fs.mkdirSync(path.join(dir, "elevenlabs"), { recursive: true });
  for (const c of todo) {
    const spec: ElevenSpec = { voice: c.id, model: c.model, languageCode: "ja", textNormalization: { key: "apply_text_normalization", value: "off" }, voiceSettings: null, outputFormat: "mp3_44100_128" };
    const mp3 = await elevenFetch({ text: next.sentence, spec, key: found.value, base, timeoutMs: 120000, retryWaitMs: 10000, gate: { reserve: () => {}, settle: () => {} } });
    const tmp = path.join(os.tmpdir(), `voice-sample-api-${process.pid}-${c.no}.mp3`);
    try {
      fs.writeFileSync(tmp, mp3);
      toMp3(tmp, targetOf(dir, c, "elevenlabs"));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    console.log(`[ok] ${targetOf(dir, c, "elevenlabs")}  ${c.id}`);
    next = { ...next, elevenlabs: next.elevenlabs.map((x) => (x.id === c.id ? { ...x, file: `elevenlabs/${x.no}.mp3` } : x)) };
    writeCatalog(dir, next);
  }
  return 0;
}

function writeCatalog(dir: string, cat: Catalog): void {
  validateCatalog(cat);
  writeFileAtomic(catalogFile(dir), `${JSON.stringify(cat, null, 2)}\n`);
}

const HELP = `gen-voice-samples.ts — 【講師用】声の聞き比べの試聴音声を作って voice-samples/ に同梱する
  node gen-voice-samples.ts --provider gemini [--dry-run] [--force]
  node gen-voice-samples.ts --provider elevenlabs --list
  node gen-voice-samples.ts --provider elevenlabs [--pick <ID>]... [--auto <数>] [--dry-run] [--force]
作ってある mp3 は作り直さない（--force で作り直し）。候補は voice-samples/catalog.json（Gemini は最大 4 つ・1 候補 1 回）`;

async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  if (a.help) {
    console.log(HELP);
    return 0;
  }
  ensureFfmpegOnPath();
  const dir = samplesDir();
  const cat = loadCatalog(dir);
  return a.provider === "gemini" ? genGemini(cat, dir, a) : genEleven(cat, dir, a);
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
      const premise = e instanceof GeminiStop || (e instanceof ElevenStop && e.kind !== "failed");
      console.error(`[gen-voice-samples] ${redact(e)}`);
      process.exit(premise ? PREMISE_EXIT : 1);
    });
}
