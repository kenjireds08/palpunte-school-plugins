// API キーを、ホームの共通の置き場（~/.config/school-starter/credentials.env）に 1 回だけ保存する。Mac / Windows 共通。
//
//   node "<スキルのフォルダ>/scripts/save-key.ts" gemini
//   node "<スキルのフォルダ>/scripts/save-key.ts" elevenlabs
//   node "<スキルのフォルダ>/scripts/save-key.ts" openai
//
// これは**受講生が自分で**、Claude のアプリの中のターミナルに貼って実行するコマンド。Claude は実行しない
// （キーを打つ画面が要るので、Claude から実行しても「ターミナルで実行してください」と出て止まる）。
//
// - 打ったキーは画面に出さない（1 文字も表示しない）。最後に「何文字受け取ったか」と形が正しいかだけ出す
// - 置き場のフォルダは本人だけが開ける権限（700）、ファイルは本人だけが読める権限（600）にする（Mac。Windows はユーザーのフォルダの権限のまま）
// - 同じ名前の行が前にあれば置き換える（ほかのキーの行はそのまま残す）
// - チャット欄・「!」の後ろには貼らない（会話の記録に残るため）

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type KeyName, credentialsFile, keyShape } from "./lib/keys.ts";

export class SaveKeyError extends Error {}

export const TARGETS: Record<string, { name: KeyName; label: string; where: string }> = {
  gemini: { name: "GEMINI_API_KEY", label: "Gemini", where: "Google AI Studio（aistudio.google.com）→ Get API key で作ったキー" },
  elevenlabs: { name: "ELEVENLABS_API_KEY", label: "ElevenLabs", where: "ElevenLabs の画面の左下 → Developers → API Keys で作ったキー" },
  openai: { name: "OPENAI_API_KEY", label: "OpenAI", where: "OpenAI の Platform（platform.openai.com）→ API keys で作ったキー（sk- で始まる）" },
};

/** 文章の中の name の行を value に置き換える（無ければ足す）。ほかの行は残す（純粋関数・テストあり） */
export function upsertKeyLine(text: string, name: KeyName, value: string): string {
  const lines = text.replace(/\r/g, "").split("\n").filter((l, i, a) => !(i === a.length - 1 && l === ""));
  const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
  const kept = lines.filter((l) => !re.test(l));
  kept.push(`${name}=${value}`);
  return `${kept.join("\n")}\n`;
}

/** 置き場に書く（一時ファイル → 置き換え。権限は 600） */
export function saveKey(name: KeyName, value: string, file: string = credentialsFile()): void {
  const shape = keyShape(name, value);
  if (shape !== "ok") throw new SaveKeyError(`キーの形が正しくありません（${shape === "bad-prefix" ? "始まりの文字が違う" : "空白・引用符が入っている、または短すぎる"}）。コピーし直して、もう一度実行してください。保存はしていません`);
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(dir, 0o700);
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const tmp = path.join(dir, `.credentials.tmp-${process.pid}`);
  try {
    fs.writeFileSync(tmp, upsertKeyLine(before, name, value), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  if (process.platform !== "win32") fs.chmodSync(file, 0o600);
}

/** キーを画面に出さずに 1 行読む */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const done = (err: Error | null) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (err) reject(err);
      else resolve(buf);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(null);
        if (ch === "\u0003") return done(new SaveKeyError("やめました（保存していません）"));
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else if (ch >= " ") buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(argv: string[]): Promise<number> {
  const which = argv[0];
  if (!which || which === "--help" || which === "-h" || argv.length !== 1 || !TARGETS[which]) {
    console.log("save-key.ts — API キーを共通の置き場に保存する（受講生がアプリの中のターミナルで実行する）\n  node save-key.ts gemini\n  node save-key.ts elevenlabs\n  node save-key.ts openai");
    return which && !["--help", "-h"].includes(which) ? 1 : 0;
  }
  const t = TARGETS[which];
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    console.error("このコマンドは、受講生が Claude のアプリの中のターミナルに貼って実行します（キーを打つ画面が要るため、Claude からは実行できません）");
    return 1;
  }
  console.log(`${t.label} のキーを保存します。キーは ${t.where}。`);
  const value = (await readHidden(`${t.label} のキーを貼り付けて Enter（画面には何も出ません）: `)).trim();
  saveKey(t.name, value);
  console.log(`保存しました（${value.length} 文字）。置き場: ${credentialsFile()}`);
  console.log("Claude のチャットに戻って「保存しました」と送ってください（キーはチャットに貼りません）");
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
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`[save-key] ${e instanceof SaveKeyError ? e.message : `保存できませんでした（${(e as NodeJS.ErrnoException).code ?? "不明"}）`}`);
      process.exit(1);
    },
  );
}
