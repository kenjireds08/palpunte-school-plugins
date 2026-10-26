// ElevenLabs の声を選び直すための一覧（課金なし。声の一覧を読むだけ）。
//
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voices.ts"            … 公式の声のうち、日本語で確かめ済みのもの
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voices.ts" --check <声の ID>  … その声の種類と、日本語に使えるモデル
//
// 公式の声（premade）は、無料プランでも API から使える。Voice Library の声（既定の Yuma Uchida を含む）は
// 無料プランでは API から使えないことがある。ID は推測で書かず、必ずこの一覧に出たものを使う。

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ELEVEN_DEFAULT_BASE, readElevenKey, redact, setActiveKey } from "./lib/eleven-client.ts";
import { SAVE_HINT } from "./lib/keys.ts";

export type VoiceRow = { id: string; name: string; category: string; gender: string; accent: string; jaModels: string[] };

type ApiVoice = {
  voice_id?: unknown;
  name?: unknown;
  category?: unknown;
  labels?: Record<string, unknown> | null;
  verified_languages?: Array<{ language?: unknown; model_id?: unknown }> | null;
};

/** API の 1 件を表の 1 行にする（純粋関数・テストあり） */
export function toRow(v: ApiVoice): VoiceRow | null {
  if (typeof v?.voice_id !== "string" || !v.voice_id) return null;
  const jaModels = [
    ...new Set(
      (v.verified_languages ?? [])
        .filter((l) => l?.language === "ja" && typeof l.model_id === "string")
        .map((l) => l.model_id as string),
    ),
  ];
  const lab = (k: string) => (typeof v.labels?.[k] === "string" ? (v.labels[k] as string) : "-");
  return {
    id: v.voice_id,
    name: typeof v.name === "string" ? v.name : "(名前なし)",
    category: typeof v.category === "string" ? v.category : "-",
    gender: lab("gender"),
    accent: lab("accent"),
    jaModels,
  };
}

/** 日本語で確かめ済みのモデルのうち、どれを台本に書くか（v4 があれば v4、無ければ最初のもの） */
export function pickModel(jaModels: string[]): string | null {
  if (jaModels.includes("eleven_v4")) return "eleven_v4";
  if (jaModels.includes("eleven_multilingual_v2")) return "eleven_multilingual_v2";
  return jaModels[0] ?? null;
}

async function getJson(url: string, key: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* JSON でなければ文字のまま */
  }
  return { status: res.status, body };
}

const HELP = `voices.ts — ElevenLabs の声を選び直すための一覧（課金なし）

  node voices.ts                 公式の声（無料プランでも API で使える）のうち、日本語で確かめ済みのものを出す
  node voices.ts --check <ID>    その声の種類（公式 premade か、Voice Library か）と、日本語に使えるモデルを出す

選んだら、台本 JSON の voice と model、設定の tts.voice と tts.model を書き換える`;

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const checkAt = argv.indexOf("--check");
  const checkId = checkAt >= 0 ? argv[checkAt + 1] : null;
  if (checkAt >= 0 && (!checkId || !/^[A-Za-z0-9]+$/.test(checkId))) {
    console.error("[voices] --check のあとに声の ID（英数字）を書いてください");
    return 1;
  }
  const found = readElevenKey();
  if (!found) {
    console.error(`[voices] ${SAVE_HINT.ELEVENLABS_API_KEY}`);
    return 5;
  }
  setActiveKey(found.value);
  const base = (process.env.SHOWCASE_ELEVEN_API_BASE || ELEVEN_DEFAULT_BASE).replace(/\/+$/, "");

  if (checkId) {
    const r = await getJson(`${base}/v1/voices/${encodeURIComponent(checkId)}`, found.value);
    if (r.status !== 200) {
      console.error(`[voices] 声 ${checkId} を読めませんでした（HTTP ${r.status}）: ${redact(r.body).slice(0, 400)}`);
      return 1;
    }
    const row = toRow(r.body as ApiVoice);
    if (!row) {
      console.error("[voices] 返事の形が想定と違います");
      return 1;
    }
    const kind = row.category === "premade" ? "公式の声（無料プランでも API で使える）" : `${row.category}（Voice Library などの声。無料プランでは API で使えないことがある）`;
    console.log(`${row.name}（${row.id}）: ${kind}`);
    console.log(row.jaModels.length ? `日本語で確かめ済みのモデル: ${row.jaModels.join(", ")} → 台本の model は ${pickModel(row.jaModels)}` : "日本語で確かめ済みのモデル: なし（日本語の読みが不自然になる可能性があります）");
    return 0;
  }

  const r = await getJson(`${base}/v2/voices?page_size=100&category=premade`, found.value);
  if (r.status !== 200) {
    console.error(`[voices] 声の一覧を読めませんでした（HTTP ${r.status}）。鍵に「Voices の読み取り」の権限があるか確かめてください: ${redact(r.body).slice(0, 400)}`);
    return 1;
  }
  const list = (r.body as { voices?: unknown })?.voices;
  if (!Array.isArray(list)) {
    console.error("[voices] 返事の形が想定と違います（voices がありません）");
    return 1;
  }
  const rows = list.map((v) => toRow(v as ApiVoice)).filter((x): x is VoiceRow => Boolean(x) && (x as VoiceRow).jaModels.length > 0);
  if (rows.length === 0) {
    console.log("日本語で確かめ済みの公式の声が見つかりませんでした。ElevenLabs の画面の Voices で探し、--check <ID> で確かめてください");
    return 0;
  }
  console.log("公式の声のうち、日本語で確かめ済みのもの（どれも無料プランで API から使えます）:");
  for (const row of rows) {
    console.log(`  ${row.name}  ID=${row.id}  ${row.gender}・${row.accent}  台本の model=${pickModel(row.jaModels)}`);
  }
  console.log("聞き比べは ElevenLabs の画面の Voices（各声の再生ボタン）でできます。選んだら台本と設定の voice・model を書き換えます");
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
  main(process.argv.slice(2))
    .then((c) => process.exit(c))
    .catch((e: unknown) => {
      console.error(`[voices] ${redact(e).split("\n")[0]}`);
      process.exit(1);
    });
}
