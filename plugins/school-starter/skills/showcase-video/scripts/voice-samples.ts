// 声の聞き比べ（課金なし・キー不要・ネットワーク不要）。同梱の試聴音声（同じ 1 文の mp3）を、デスクトップのフォルダに写す。
// 受講生はファイルをダブルクリックして聞き、番号で返事をする → voice-choice.ts save --voice <番号>
//
//   node voice-samples.ts list  --provider gemini|elevenlabs   候補の番号・説明・試聴の音声があるかを出す
//   node voice-samples.ts place --provider gemini|elevenlabs   デスクトップの「声の聞き比べ_<Gemini|ElevenLabs>」に写して一覧を出す
//
// 試聴の音声はその場で作らない（Gemini の無料枠は 1 日 10 回で、本番の声に使うため）。音声は講師が作って同梱している。
// デスクトップが見つからないときは、フォルダを作らずに同梱の場所をそのまま出す（そのファイルを開いて聞ける）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDesktop } from "./lib/desktop.ts";
import { CatalogError, PROVIDER_LABEL, loadCatalog, placedName, sampleFile, type Provider } from "./lib/voice-catalog.ts";

const isProvider = (v: unknown): v is Provider => v === "gemini" || v === "elevenlabs";

export type Placed = { folder: string | null; tried: string[]; rows: Array<{ no: number; label: string; recommended: boolean; file: string | null }> };

/** 写す（テストあり）。前に写した同じ番号のファイルは置き換え、この道具が写したもの以外には触らない */
export function placeSamples(provider: Provider): Placed {
  const cat = loadCatalog();
  const desk = findDesktop();
  const folder = desk.dir ? path.join(desk.dir, `声の聞き比べ_${PROVIDER_LABEL[provider]}`) : null;
  const rows: Placed["rows"] = [];
  const present = cat[provider].map((c) => ({ c, src: sampleFile(c) }));
  if (folder && present.some((p) => p.src)) {
    fs.mkdirSync(folder, { recursive: true });
    // 前の版で写した同じ番号のファイル（説明が変わって名前が違うもの）を消す
    for (const name of fs.readdirSync(folder)) {
      if (/^\d+_.*\.mp3$/.test(name) && !present.some((p) => placedName(p.c) === name)) fs.rmSync(path.join(folder, name), { force: true });
    }
  }
  for (const { c, src } of present) {
    let file: string | null = null;
    if (src) {
      if (folder) {
        file = path.join(folder, placedName(c));
        fs.copyFileSync(src, file);
      } else file = src;
    }
    rows.push({ no: c.no, label: c.label, recommended: c.recommended, file });
  }
  return { folder, tried: desk.tried, rows };
}

const HELP = `voice-samples.ts — 声の聞き比べ（課金なし・キー不要）
  list  --provider gemini|elevenlabs
  place --provider gemini|elevenlabs   デスクトップの「声の聞き比べ_<Gemini|ElevenLabs>」に試聴の音声を写す
選んだら: voice-choice.ts save --config <showcase.config.json> --provider <同じもの> --voice <番号>`;

function main(argv: string[]): number {
  const [cmd = "help", ...rest] = argv;
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(HELP);
    return 0;
  }
  if (cmd !== "list" && cmd !== "place") throw new CatalogError(`知らないサブコマンドです: ${cmd}（list / place）`);
  if (rest.length !== 2 || rest[0] !== "--provider") throw new CatalogError(`${cmd} は --provider gemini|elevenlabs だけを受け付けます`);
  const provider = rest[1];
  if (!isProvider(provider)) throw new CatalogError(`--provider は gemini か elevenlabs です: ${provider}`);
  const cat = loadCatalog();

  if (cmd === "list") {
    console.log(`${PROVIDER_LABEL[provider]} の声の候補（試聴の 1 文「${cat.sentence}」）:`);
    for (const c of cat[provider]) {
      console.log(`  ${c.no}. ${c.label}${c.recommended ? "【おすすめ】" : ""}  声 ${c.id}  ${sampleFile(c) ? "試聴あり" : "試聴の音声なし"}`);
    }
    return 0;
  }

  const r = placeSamples(provider);
  const withFile = r.rows.filter((x) => x.file);
  if (withFile.length === 0) {
    const rec = cat[provider][0];
    console.log(`[注意] ${PROVIDER_LABEL[provider]} の試聴の音声が入っていません。聞き比べは飛ばし、おすすめの声（1. ${rec.label}）で進めます`);
    console.log(`       次: voice-choice.ts save --config <showcase.config.json> --provider ${provider} --voice 1`);
    return 0;
  }
  if (r.folder) console.log(`[ok] デスクトップの「${path.basename(r.folder)}」フォルダに、声の見本を ${withFile.length} 本置きました: ${r.folder}`);
  else {
    console.log(`[注意] デスクトップのフォルダが見つかりませんでした（探した場所: ${r.tried.join("・")}）。フォルダは作っていません`);
    console.log("       同梱の場所のファイルを、そのまま開いて聞いてもらいます:");
  }
  for (const x of r.rows) {
    console.log(`  ${x.no}. ${x.label}${x.recommended ? "【おすすめ】" : ""}  ${x.file ? (r.folder ? path.basename(x.file) : x.file) : "（試聴の音声なし）"}`);
  }
  console.log(`受講生への頼み方: 「デスクトップの『声の聞き比べ_${PROVIDER_LABEL[provider]}』フォルダの音声をダブルクリックして聞き、気に入った声の番号を返してください」`);
  console.log(`選んだら: voice-choice.ts save --config <showcase.config.json> --provider ${provider} --voice <番号>`);
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
    console.error(`[voice-samples] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
