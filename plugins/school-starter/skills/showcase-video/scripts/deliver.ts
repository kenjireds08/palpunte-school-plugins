// できあがりの 3 点（15 秒の動画・紹介動画・サムネイル）を、デスクトップの「紹介動画_<アプリの名前>」フォルダに写す。
// 元のファイルは promo-video/ に残す（写すだけ。動かさない・消さない）。
//
//   node deliver.ts --config <promo-video/showcase.config.json> [--name "<フォルダに付ける名前>"]
//
// 写すもの（promo-video/ の下）:
//   final/15秒.mp4・final/紹介動画.mp4・stills/final/thumb-ogp.png（どれか 1 つでも無ければ、何も写さずに止まる）
//   final/紹介動画_軽量.mp4（共有用に軽くした版。あれば写す）
// フォルダの名前は設定の project.name（--name で変えられる）。同じ名前のフォルダがあれば、中の同じ名前のファイルを上書きする。
// デスクトップが見つからなければ、フォルダを作らずに探した場所と、できあがりの場所を出す（終了コード 0・[注意]）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDesktop, safeFolderName } from "./lib/desktop.ts";

export class DeliverError extends Error {}

export const REQUIRED = [
  { rel: path.join("final", "15秒.mp4"), as: "15秒.mp4", what: "15 秒の動画" },
  { rel: path.join("final", "紹介動画.mp4"), as: "紹介動画.mp4", what: "紹介動画" },
  { rel: path.join("stills", "final", "thumb-ogp.png"), as: "サムネイル.png", what: "サムネイル" },
];
export const OPTIONAL = [{ rel: path.join("final", "紹介動画_軽量.mp4"), as: "紹介動画_軽量.mp4", what: "紹介動画（共有用の軽い版）" }];

export type DeliverResult = { status: "copied"; folder: string; files: string[] } | { status: "no-desktop"; tried: string[]; sources: string[] };

/** 写す（テストあり）。promoDir = promo-video のフォルダ */
export function deliver(promoDir: string, appName: string): DeliverResult {
  const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(promoDir, f.rel)));
  if (missing.length > 0) {
    throw new DeliverError(
      `まだできていないものがあります（何も写していません）: ${missing.map((m) => `${m.what}（${path.join(promoDir, m.rel)}）`).join("・")}。書き出しと検査を終えてからもう一度実行します`,
    );
  }
  const items = [...REQUIRED, ...OPTIONAL.filter((f) => fs.existsSync(path.join(promoDir, f.rel)))];
  const sources = items.map((f) => path.join(promoDir, f.rel));
  const desk = findDesktop();
  if (!desk.dir) return { status: "no-desktop", tried: desk.tried, sources };
  const folder = path.join(desk.dir, `紹介動画_${safeFolderName(appName)}`);
  fs.mkdirSync(folder, { recursive: true });
  const files: string[] = [];
  for (const f of items) {
    const dest = path.join(folder, f.as);
    fs.copyFileSync(path.join(promoDir, f.rel), dest);
    files.push(dest);
  }
  return { status: "copied", folder, files };
}

function readName(cfgPath: string): string {
  let cfg: { project?: { name?: unknown } };
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as { project?: { name?: unknown } };
  } catch (e) {
    throw new DeliverError(`設定を読めません: ${cfgPath}（${(e as Error).message}）`);
  }
  const n = cfg?.project?.name;
  return typeof n === "string" && n.trim() && !/[〔〕]/.test(n) ? n.trim() : "アプリ";
}

const HELP = `deliver.ts — できあがりの 3 点をデスクトップの「紹介動画_<アプリの名前>」フォルダに写す（元は promo-video に残す）
  node deliver.ts --config <promo-video/showcase.config.json> [--name "<フォルダに付ける名前>"]`;

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const opts = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k !== "--config" && k !== "--name") throw new DeliverError(`知らない引数です: ${k}（--config / --name）`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new DeliverError(`${k} には値が必要です`);
    if (opts.has(k)) throw new DeliverError(`${k} が 2 回指定されています`);
    opts.set(k, v);
    i++;
  }
  const cfg = opts.get("--config");
  if (!cfg) throw new DeliverError("--config <promo-video/showcase.config.json> が必要です");
  const abs = path.resolve(cfg);
  const name = opts.get("--name") ?? readName(abs);
  const r = deliver(path.dirname(abs), name);
  if (r.status === "no-desktop") {
    console.log(`[注意] デスクトップのフォルダが見つかりませんでした（探した場所: ${r.tried.join("・")}）。フォルダは作っていません`);
    console.log("       できあがりは次の場所にあります:");
    for (const s of r.sources) console.log(`       ${s}`);
    return 0;
  }
  console.log(`[ok] デスクトップの「${path.basename(r.folder)}」フォルダに置きました: ${r.folder}`);
  for (const f of r.files) console.log(`     ${path.basename(f)}`);
  console.log("     元のファイルは promo-video/ に残っています");
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
    console.error(`[deliver] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
