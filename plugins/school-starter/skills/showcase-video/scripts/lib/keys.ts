// API キーを探す（Gemini・ElevenLabs・OpenAI）。値はこのプロセスの中で使うだけで、画面・ログ・ファイルに出さない。
//
// 探す順番（見つかった最初の 1 つを使う）:
//   1. 環境変数（GEMINI_API_KEY / ELEVENLABS_API_KEY / OPENAI_API_KEY）
//   2. ホームの共通の置き場 ~/.config/school-starter/credentials.env（どのプロジェクトからでも使えるように 1 回だけ保存する）
//   3. OPENAI_API_KEY だけ: 補講2 の作業フォルダ ~/claude-code-projects/image-studio/.env.local
//
// 共通の置き場の名前を credentials.env にしているのは、受講生環境の 3 つの壁に同時に当たるようにするため:
//   - permissions.deny の Read(**/credentials.*)（Claude の Read ツールで開けない）
//   - permissions.deny の Bash(cat *.env*) など（cat / grep / head / tail で中身を出せない）
//   - school-starter の guard-env-access.js（.env を読むコマンドを止める）
// テストでは SHOWCASE_CREDENTIALS_FILE / SHOWCASE_IMAGE_STUDIO_ENV で置き場を差し替える。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type KeyName = "GEMINI_API_KEY" | "ELEVENLABS_API_KEY" | "OPENAI_API_KEY";
export type KeySource = "環境変数" | "共通の置き場" | "image-studio";

/** 共通の置き場（~/.config/school-starter/credentials.env） */
export function credentialsFile(): string {
  const o = process.env.SHOWCASE_CREDENTIALS_FILE;
  return o && o.trim() ? path.resolve(o) : path.join(os.homedir(), ".config", "school-starter", "credentials.env");
}

/** 補講2 の作業フォルダの鍵（~/claude-code-projects/image-studio/.env.local） */
export function imageStudioEnvFile(): string {
  const o = process.env.SHOWCASE_IMAGE_STUDIO_ENV;
  return o && o.trim() ? path.resolve(o) : path.join(os.homedir(), "claude-code-projects", "image-studio", ".env.local");
}

/** KEY=VALUE の形の文章から 1 つ取り出す（export・引用符・行末のコメントに対応）。無ければ null */
export function parseEnvValue(text: string, name: KeyName): string | null {
  let found: string | null = null;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const m = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)$`).exec(raw);
    if (!m) continue;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"') && v.length >= 2) || (v.startsWith("'") && v.endsWith("'") && v.length >= 2)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim();
    // 同じ名前が 2 行あったら最後の行を使う（シェルで読み込んだときと同じ）
    found = v || null;
  }
  return found;
}

function readFileKey(file: string, name: KeyName): string | null {
  if (!fs.existsSync(file)) return null;
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    throw new Error(`鍵の置き場を読めませんでした（${(e as NodeJS.ErrnoException).code ?? (e as Error).message}）: ${file}`);
  }
  return parseEnvValue(text, name);
}

/** 鍵を探す。値と、どこで見つけたか（表示してよいのは source だけ）を返す */
export function findKey(name: KeyName): { value: string; source: KeySource; file?: string } | null {
  const env = process.env[name];
  if (env && env.trim()) return { value: env.trim(), source: "環境変数" };
  const cf = credentialsFile();
  const fromCommon = readFileKey(cf, name);
  if (fromCommon) return { value: fromCommon, source: "共通の置き場", file: cf };
  if (name === "OPENAI_API_KEY") {
    const isf = imageStudioEnvFile();
    const fromStudio = readFileKey(isf, name);
    if (fromStudio) return { value: fromStudio, source: "image-studio", file: isf };
  }
  return null;
}

export type KeyShape = "ok" | "missing" | "bad-prefix" | "bad-char";

/** 鍵の形だけを確かめる（値は返さない）。OpenAI は sk- で始まる。Gemini・ElevenLabs は始まりを決めない（確かめていない形を強制しない）。どれも空白・改行・引用符を含まない */
export function keyShape(name: KeyName, value: string | null | undefined): KeyShape {
  if (!value) return "missing";
  if (/[\s"'`]/.test(value)) return "bad-char";
  if (name === "OPENAI_API_KEY" && !value.startsWith("sk-")) return "bad-prefix";
  if (value.length < 20) return "bad-char";
  return "ok";
}

/** 鍵があるか・どこにあるか・形（値は返さない）。deps と showcase-check が使う */
export function keyStatus(name: KeyName): { found: boolean; source: KeySource | null; shape: KeyShape } {
  const k = findKey(name);
  return { found: Boolean(k), source: k?.source ?? null, shape: keyShape(name, k?.value) };
}

/** 文章の中の鍵らしい文字列と、渡された値そのものを *** にする */
export function redactKeys(s: unknown, extra: Array<string | null | undefined> = []): string {
  let t = String(s);
  for (const k of extra) if (k && k.length >= 8) t = t.split(k).join("***");
  return t
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "***")
    .replace(/sk_[A-Za-z0-9]{16,}/g, "***")
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, "***");
}

/** 保存するコマンドで案内する「どこに・どの名前で」（値は含まない） */
export const SAVE_HINT: Record<KeyName, string> = {
  GEMINI_API_KEY:
    "Gemini のキーがありません。スキルの references/setup.md「鍵を保存する」の Gemini の保存用コマンドを、アプリの中のターミナルに貼ってキーを入力してください（チャットには貼りません）",
  ELEVENLABS_API_KEY:
    "ElevenLabs のキーがありません。スキルの references/setup.md「鍵を保存する」の保存用コマンドを、アプリの中のターミナルに貼ってキーを入力してください（チャットには貼りません）",
  OPENAI_API_KEY:
    "OpenAI のキーがありません（補講2 の image-studio にも見つかりません）。スキルの references/setup.md「鍵を保存する」の保存用コマンドを、アプリの中のターミナルに貼ってキーを入力してください（チャットには貼りません）",
};
