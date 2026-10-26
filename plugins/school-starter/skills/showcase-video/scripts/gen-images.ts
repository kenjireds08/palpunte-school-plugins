// 紹介動画で使う写真・絵を OpenAI でまとめて作る。中身は comp-to-lp スキルの gen.mjs（見積もり・費用の上限・台帳・再開つき）を
// そのまま使い、このファイルは「鍵を共通の置き場から渡す」「1 本の動画で 30 枚まで」の 2 つだけを足す。
//
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-images.ts" --jobs <images.jobs.json> --config <showcase.config.json> --dry-run
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-images.ts" --jobs <images.jobs.json> --config <showcase.config.json>
//   （--only a,b / --suffix -v2 / --retry-rate も gen.mjs と同じ）
//
// 鍵: 環境変数 → 共通の置き場 → 補講2 の image-studio の OPENAI_API_KEY。見つけた値はこのプロセスの中だけで gen.mjs に渡し、
//     ほかのプログラムを起動しない（コマンドの引数や子プロセスの環境に鍵を載せない）。
// 台帳: 設定ファイルのあるフォルダの docs/image-ledger.tsv（gen.mjs の決まり）。費用の上限は min(300 円, images.budgetYen)。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SAVE_HINT, findKey, keyShape } from "./lib/keys.ts";

/** 1 本の動画で作る画像の上限（作りすぎて費用と確認の手間が膨らむのを防ぐ） */
export const MAX_IMAGES = 30;
/** 1536x1024・medium 1 枚のおおよその値段（円） */
export const YEN_PER_IMAGE = 1.9;

export class ImagesError extends Error {}

/** comp-to-lp の gen.mjs の場所（同じプラグインの中） */
export function genPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "comp-to-lp", "scripts", "gen.mjs");
}

/** 設定の images.peopleRegion（無ければ既定）。読めなければ既定のまま（設定の誤りは gen.mjs が止める） */
function peopleRegionOf(configFile: string): string {
  try {
    const c = JSON.parse(fs.readFileSync(path.resolve(configFile), "utf8")) as { images?: { peopleRegion?: unknown } };
    const r = c?.images?.peopleRegion;
    return typeof r === "string" && r.trim() ? r.trim() : DEFAULT_PEOPLE_REGION;
  } catch {
    return DEFAULT_PEOPLE_REGION;
  }
}

function argValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

/** 台帳で「できた」になっている名前（ok / reconciled が最後の行のもの） */
export function doneNames(ledgerFile: string): Set<string> {
  const last = new Map<string, string>();
  if (!fs.existsSync(ledgerFile)) return new Set();
  for (const line of fs.readFileSync(ledgerFile, "utf8").split("\n").slice(1)) {
    const c = line.split("\t");
    if (c.length >= 3 && c[1]) last.set(c[1], c[2]);
  }
  return new Set([...last].filter(([, ev]) => ev === "ok" || ev === "reconciled").map(([n]) => n));
}

/** jobs と台帳から、上限 30 枚に収まるかを決める（純粋に近い。テストあり） */
export function checkImageCount(jobs: unknown, done: Set<string>): { total: number; message: string | null } {
  if (!Array.isArray(jobs)) return { total: 0, message: "jobs.json は [ { name, size, prompt }, … ] の形にしてください" };
  const names = new Set<string>(done);
  for (const j of jobs) if (j && typeof (j as { name?: unknown }).name === "string") names.add((j as { name: string }).name);
  const total = names.size;
  if (total > MAX_IMAGES) {
    return {
      total,
      message: `画像が ${total} 枚になります（作り済みと合わせて）。1 本の動画は ${MAX_IMAGES} 枚までにします。似た場面をまとめるか、画面の録画で見せる場面を増やしてください`,
    };
  }
  return { total, message: null };
}

/** 人物の国・地域の既定（設定の images.peopleRegion で変えられる） */
export const DEFAULT_PEOPLE_REGION = "Japanese";

/** 人物が写るプロンプトかどうか（「実在の人に似せない」の決まり文句は数えない） */
const PEOPLE_RE = /\b(?:woman|women|man|men|person|persons|people|adults?|child|children|kids?|girls?|boys?|family|couple|customers?|owners?|staff|students?|teachers?|hands?|faces?)\b/i;

/**
 * 1 本の動画の中で人物の国・地域をそろえる（純粋関数・テストあり）。
 * 人物が写るプロンプトに region（既定 Japanese）が無いものの名前を返す。空なら合格
 */
export function missingPeopleRegion(jobs: unknown, region: string = DEFAULT_PEOPLE_REGION): string[] {
  if (!Array.isArray(jobs)) return [];
  const want = region.trim().toLowerCase();
  const out: string[] = [];
  for (const j of jobs) {
    const o = j as { name?: unknown; prompt?: unknown };
    if (typeof o?.prompt !== "string" || typeof o.name !== "string") continue;
    const text = o.prompt.replace(/\breal (?:person|people)\b/gi, "");
    if (PEOPLE_RE.test(text) && !text.toLowerCase().includes(want)) out.push(o.name);
  }
  return out;
}

const HELP = `gen-images.ts — 紹介動画の写真・絵をまとめて作る（中身は comp-to-lp の gen.mjs・1 枚 約 ${YEN_PER_IMAGE} 円・1 本 ${MAX_IMAGES} 枚まで）
  node gen-images.ts --jobs <images.jobs.json> --config <showcase.config.json> --dry-run   見積もりだけ（費用ゼロ・鍵を読まない）
  node gen-images.ts --jobs <images.jobs.json> --config <showcase.config.json>             作る（途中で止まったら同じコマンドで再開）
  [--only a,b] [--suffix -v2] [--retry-rate 0.2] は gen.mjs と同じ
費用の上限: min(300 円, 設定の images.budgetYen)。台帳: 設定のフォルダの docs/image-ledger.tsv（手で書き換えない）
人物の写真のプロンプトには、人物の国・地域（設定の images.peopleRegion・既定 Japanese）を必ず書く（無いと作る前に止まる）
終了コード: 0 全部できた / 1 失敗・状態不明が残った / 2 設定の不備・上限を超える見積もり・枚数が多すぎる・人物の国・地域が無い`;

async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return;
  }
  const jobsFile = argValue(argv, "--jobs");
  const configFile = argValue(argv, "--config");
  if (!jobsFile || !configFile) throw new ImagesError("--jobs <images.jobs.json> と --config <showcase.config.json> が必要です");
  let jobs: unknown;
  try {
    jobs = JSON.parse(fs.readFileSync(path.resolve(jobsFile), "utf8"));
  } catch (e) {
    throw new ImagesError(`jobs を読めません: ${jobsFile}（${(e as Error).message}）`);
  }
  const ledger = path.join(path.dirname(path.resolve(configFile)), "docs", "image-ledger.tsv");
  const count = checkImageCount(jobs, doneNames(ledger));
  if (count.message) throw new ImagesError(count.message);
  const region = peopleRegionOf(configFile);
  const noRegion = missingPeopleRegion(jobs, region);
  if (noRegion.length > 0) {
    throw new ImagesError(
      `人物が写る写真のプロンプトに、人物の国・地域（${region}）がありません: ${noRegion.join(", ")}。` +
        `1 本の動画の中で人物の国・地域をそろえます（書かないと海外の人物で出ることがある）。プロンプトの「誰が」に ${region} を書き足してから、もう一度実行してください（1 枚も作っていません）`,
    );
  }
  console.log(`この動画の画像: ${count.total} 枚（上限 ${MAX_IMAGES} 枚・1 枚 約 ${YEN_PER_IMAGE} 円）`);

  const gen = genPath();
  if (!fs.existsSync(gen)) throw new ImagesError(`comp-to-lp スキルの gen.mjs が見つかりません: ${gen}（プラグインを最新に更新してください）`);
  if (!argv.includes("--dry-run") && !process.env.COMP_TO_LP_FAKE) {
    const key = findKey("OPENAI_API_KEY");
    if (!key) throw new ImagesError(SAVE_HINT.OPENAI_API_KEY);
    const shape = keyShape("OPENAI_API_KEY", key.value);
    if (shape !== "ok") throw new ImagesError(`OpenAI のキーの形が正しくありません（${shape}）。保存し直してください`);
    console.log(`OpenAI のキー: ${key.source}で見つけました`);
    process.env.OPENAI_API_KEY = key.value;
  }
  // gen.mjs は読み込んだ時点で process.argv を読んで動き、最後に自分で終了する
  process.argv = [process.argv[0], gen, ...argv];
  await import(pathToFileURL(gen).href);
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
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(`[gen-images] ${e instanceof Error ? e.message : String(e)}`.replace(/sk-[A-Za-z0-9_-]{8,}/g, "***"));
    process.exit(2);
  });
}
