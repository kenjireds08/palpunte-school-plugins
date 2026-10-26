// 制作クレジット（動画の最後に出す「制作：〇〇」と、ナレーションで読む読み）を扱う。
//
//   node credit.ts save --config <showcase.config.json> --org "<会社名・屋号>" --org-kana "<読み>" [--name "<名前>" --name-kana "<読み>"]
//       設定の credit に書く（会社名・屋号は必須・名前は任意）。次の動画でも使えるように ~/.config/school-starter/showcase-profile.json にも控える
//   node credit.ts show
//       控え（showcase-profile.json）の中身を出す（初めての動画なら「まだありません」）
//   node credit.ts apply --config <showcase.config.json> --html <index.html> [--html …]
//       HTML の data-credit-name の要素の中身を、設定の credit.display に置き換える（手で書かない）
//
// 読み（kana）はひらがな・カタカナで書く。ナレーションの台本の {{credit}} が、この読みに置き換わる（eleven-tts.ts --config）。
// 控えのファイルには鍵やパスワードを入れない（会社名・屋号と名前と読みだけ）。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileAtomic } from "./lib/atomic.ts";

export class CreditError extends Error {}

export type Credit = { org: string; orgKana: string; name: string | null; nameKana: string | null; display: string; kana: string };

/** 読みに使ってよい文字（ひらがな・カタカナ・長音・区切り・空白） */
const KANA_RE = /^[ぁ-ゖァ-ヺー・、。・\s　]+$/;

export function profileFile(): string {
  const o = process.env.SHOWCASE_PROFILE_FILE;
  return o && o.trim() ? path.resolve(o) : path.join(os.homedir(), ".config", "school-starter", "showcase-profile.json");
}

/** 入力から表示と読みを組み立てる（純粋関数・テストあり） */
export function buildCredit(o: { org?: string; orgKana?: string; name?: string; nameKana?: string }): Credit {
  const t = (s: string | undefined) => (typeof s === "string" ? s.trim() : "");
  const org = t(o.org);
  const orgKana = t(o.orgKana);
  const name = t(o.name);
  const nameKana = t(o.nameKana);
  if (!org) throw new CreditError("会社名・屋号（--org）は必須です");
  if (/[〔〕<>]/.test(org + name)) throw new CreditError("会社名・名前に 〔 〕 < > は使えません");
  if (!orgKana) throw new CreditError("会社名・屋号の読み（--org-kana）が必要です（ひらがなかカタカナ）");
  if (!KANA_RE.test(orgKana)) throw new CreditError(`読み（--org-kana）はひらがな・カタカナで書いてください: ${orgKana}`);
  if (name && !nameKana) throw new CreditError("名前を入れるときは、名前の読み（--name-kana）も必要です");
  if (!name && nameKana) throw new CreditError("--name-kana だけでは使えません（--name も入れる）");
  if (nameKana && !KANA_RE.test(nameKana)) throw new CreditError(`読み（--name-kana）はひらがな・カタカナで書いてください: ${nameKana}`);
  return {
    org,
    orgKana,
    name: name || null,
    nameKana: nameKana || null,
    display: name ? `${org}　${name}` : org,
    kana: nameKana ? `${orgKana}、${nameKana}` : orgKana,
  };
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new CreditError(`JSON を読めません: ${file}（${(e as Error).message}）`);
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** data-credit-name の付いた要素の中身を display に置き換える（純粋関数・テストあり）。置き換えた数も返す */
export function applyToHtml(src: string, display: string): { html: string; count: number } {
  let count = 0;
  const html = src.replace(/(<([a-z][\w-]*)\b[^>]*\bdata-credit-name\b[^>]*>)([\s\S]*?)(<\/\2>)/gi, (_m, open: string, _tag: string, _inner: string, close: string) => {
    count++;
    return `${open}${escapeHtml(display)}${close}`;
  });
  return { html, count };
}

/** 設定から credit を読む。display と kana がそろっていなければ止める */
export function creditFromConfig(cfg: Record<string, unknown>): { display: string; kana: string } {
  const c = cfg.credit as { display?: unknown; kana?: unknown } | undefined;
  const display = typeof c?.display === "string" ? c.display.trim() : "";
  const kana = typeof c?.kana === "string" ? c.kana.trim() : "";
  if (!display || /[〔〕]/.test(display)) throw new CreditError("設定の credit.display が決まっていません（先に credit.ts save で会社名・屋号を入れる）");
  if (!kana || !KANA_RE.test(kana)) throw new CreditError("設定の credit.kana（ひらがな・カタカナの読み）が決まっていません（credit.ts save で入れる）");
  return { display, kana };
}

function parse(argv: string[]): { cmd: string; one: Map<string, string>; many: Map<string, string[]> } {
  const [first = "help", ...rest] = argv;
  const cmd = first === "--help" || first === "-h" ? "help" : first;
  const one = new Map<string, string>();
  const many = new Map<string, string[]>();
  const allowed: Record<string, string[]> = {
    save: ["config", "org", "org-kana", "name", "name-kana"],
    show: [],
    apply: ["config", "html"],
    help: [],
  };
  if (!allowed[cmd]) throw new CreditError(`知らないサブコマンドです: ${cmd}（save / show / apply）`);
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (!k.startsWith("--")) throw new CreditError(`知らない引数です: ${k}`);
    const name = k.slice(2);
    if (!allowed[cmd].includes(name)) throw new CreditError(`${cmd} では使えないオプションです: ${k}`);
    const v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) throw new CreditError(`${k} には値が必要です`);
    i++;
    if (name === "html") many.set(name, [...(many.get(name) ?? []), v]);
    else {
      if (one.has(name)) throw new CreditError(`${k} が 2 回指定されています`);
      one.set(name, v);
    }
  }
  return { cmd, one, many };
}

const HELP = `credit.ts — 制作クレジット（「制作：〇〇」と読み）
  save  --config <設定> --org "<会社名・屋号>" --org-kana "<読み>" [--name "<名前>" --name-kana "<読み>"]
  show
  apply --config <設定> --html <index.html> [--html …]`;

function main(argv: string[]): number {
  const { cmd, one, many } = parse(argv);
  if (cmd === "help") {
    console.log(HELP);
    return 0;
  }
  if (cmd === "show") {
    const f = profileFile();
    const p = fs.existsSync(f) ? readJson(f) : {};
    if (typeof p.org !== "string" || !p.org) {
      console.log("控えはまだありません（初めての動画です。会社名・屋号と、入れるなら名前を受講生に聞く）");
      return 0;
    }
    console.log(`控え: ${JSON.stringify({ org: p.org, orgKana: p.orgKana, name: p.name, nameKana: p.nameKana })}`);
    return 0;
  }
  const cfgPath = one.get("config");
  if (!cfgPath) throw new CreditError("--config <showcase.config.json> が必要です");
  const abs = path.resolve(cfgPath);
  const cfg = readJson(abs);
  if (cmd === "save") {
    const c = buildCredit({ org: one.get("org"), orgKana: one.get("org-kana"), name: one.get("name"), nameKana: one.get("name-kana") });
    cfg.credit = { display: c.display, kana: c.kana };
    writeFileAtomic(abs, `${JSON.stringify(cfg, null, 2)}\n`);
    const pf = profileFile();
    fs.mkdirSync(path.dirname(pf), { recursive: true });
    // 控えのほかの項目（voice-choice.ts の声の種類など）は残す
    const prev = fs.existsSync(pf) ? readJson(pf) : {};
    writeFileAtomic(pf, `${JSON.stringify({ ...prev, org: c.org, orgKana: c.orgKana, name: c.name, nameKana: c.nameKana, savedAt: new Date().toISOString() }, null, 2)}\n`);
    console.log(`[ok] 制作クレジット: 画面「制作：${c.display}」／ 読み「せいさく、${c.kana}」`);
    console.log(`     設定 ${abs} と、次の動画のための控え ${pf} に書きました`);
    return 0;
  }
  // apply
  const { display } = creditFromConfig(cfg);
  const htmls = many.get("html") ?? [];
  if (htmls.length === 0) throw new CreditError("--html <index.html> が必要です");
  for (const h of htmls) {
    const file = path.resolve(h);
    if (!fs.existsSync(file)) throw new CreditError(`HTML がありません: ${file}`);
    const { html, count } = applyToHtml(fs.readFileSync(file, "utf8"), display);
    if (count === 0) throw new CreditError(`${file} に data-credit-name の要素がありません（テンプレートの S6 の制作クレジットを消していないか確かめる）`);
    writeFileAtomic(file, html);
    console.log(`[ok] ${file}: 制作クレジットを ${count} か所に入れました（「${display}」）`);
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
if (isEntry()) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`[credit] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
