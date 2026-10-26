// ffmpeg / ffprobe が PATH に無いとき、よくある置き場を探して PATH の先頭に足す（このプロセスと、ここから起こす子プロセスに効く）。
// わざと .mjs（型なし）にしてある: deps.mjs（古い Node でも動かす）からも、.ts の道具からも読めるように。
//
// 使う理由: winget / brew で ffmpeg を入れても、すでに動いている Claude のアプリは古い PATH のまま。
// アプリを開き直さなくても道具が動くように、入る場所が決まっている所だけを探す（探すだけ。何も入れない・書き換えない）。
//
//   Windows: %LOCALAPPDATA%\Microsoft\WinGet\Links
//            %LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin
//   Mac:     /opt/homebrew/bin、/usr/local/bin

import fs from "node:fs";
import path from "node:path";

const MAC_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

/** PATH の環境変数の名前（Windows は "Path" のことがある。テスト用の普通のオブジェクトでも見つかるように大文字小文字を無視） */
function pathKey(env, platform) {
  if (platform !== "win32") return "PATH";
  return Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "Path";
}

function exeNames(platform) {
  return platform === "win32" ? ["ffmpeg.exe", "ffprobe.exe"] : ["ffmpeg", "ffprobe"];
}

/** ffmpeg と ffprobe の両方があるフォルダか */
function hasBoth(dir, platform) {
  if (!dir) return false;
  return exeNames(platform).every((n) => {
    try {
      return fs.statSync(path.join(dir, n)).isFile();
    } catch {
      return false;
    }
  });
}

function readdir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/** 探す置き場（見る順）。Windows の Packages は版の名前の新しい順 */
export function candidateDirs({ env = process.env, platform = process.platform } = {}) {
  if (platform === "darwin") return [...MAC_DIRS];
  if (platform !== "win32") return [];
  const local = env.LOCALAPPDATA;
  if (!local) return [];
  const winget = path.join(local, "Microsoft", "WinGet");
  const dirs = [path.join(winget, "Links")];
  const packages = path.join(winget, "Packages");
  const desc = (a, b) => b.localeCompare(a, "en", { numeric: true });
  for (const pkg of readdir(packages).filter((n) => n.startsWith("Gyan.FFmpeg")).sort(desc)) {
    for (const inner of readdir(path.join(packages, pkg)).filter((n) => n.startsWith("ffmpeg-")).sort(desc)) {
      dirs.push(path.join(packages, pkg, inner, "bin"));
    }
  }
  return dirs;
}

/**
 * ffmpeg / ffprobe を使えるようにする。
 * 戻り値: { status: "on-path" | "added" | "missing", dir }
 *   on-path = もともと PATH にある（何もしない）/ added = 置き場で見つけて PATH の先頭に足した / missing = どこにも無い
 */
export function ensureFfmpegOnPath({ env = process.env, platform = process.platform } = {}) {
  const key = pathKey(env, platform);
  const sep = platform === "win32" ? ";" : ":";
  const current = env[key] ?? "";
  const entries = current.split(sep).filter(Boolean);
  const onPath = entries.find((d) => hasBoth(d, platform));
  if (onPath) return { status: "on-path", dir: onPath };
  const found = candidateDirs({ env, platform }).find((d) => hasBoth(d, platform));
  if (!found) return { status: "missing", dir: null };
  env[key] = current ? `${found}${sep}${current}` : found;
  return { status: "added", dir: found };
}

/**
 * Claude の Bash で ffmpeg・ffprobe・npx hyperframes などを直接打つときに、コマンドの頭に付ける 1 行。
 * Bash（Mac・Windows の Git Bash）と PowerShell の 2 通り。Windows のパス（C:\…）は Git Bash の形（/c/…）にする
 */
export function pathPrefixLines(dir, platform = process.platform) {
  if (platform !== "win32") return { bash: `export PATH="${dir}:$PATH";` };
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(dir);
  const bashDir = m ? `/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}` : dir.replace(/\\/g, "/");
  return { bash: `export PATH="${bashDir}:$PATH";`, powershell: `$env:Path = "${dir};" + $env:Path;` };
}
