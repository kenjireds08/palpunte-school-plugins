// デスクトップのフォルダを探す（完成物のまとめ・声の聞き比べで使う）。見つからなければ作らずに null を返す。
//
// 探す順番（あるフォルダの最初の 1 つ）:
//   0. テスト用の差し替え SHOWCASE_DESKTOP_DIR（指定されていれば、これだけを見る）
//   1. Windows だけ: Windows が「デスクトップ」として使っているフォルダ（[Environment]::GetFolderPath('Desktop')）。
//      OneDrive がデスクトップを預かっていると、ホームの Desktop が残っていても画面には出ないため、先に聞く
//   2. ホームの Desktop → OneDrive/Desktop → OneDrive/デスクトップ

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** ホームの下で探す候補（純粋関数・テストあり） */
export function desktopCandidates(home: string): string[] {
  return [path.join(home, "Desktop"), path.join(home, "OneDrive", "Desktop"), path.join(home, "OneDrive", "デスクトップ")];
}

/** Windows が使っているデスクトップの場所を聞く。聞けなければ null（文字化けしたら存在しないので null になる） */
function windowsShellDesktop(): string | null {
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('Desktop')"],
    { encoding: "utf8", timeout: 15000, windowsHide: true },
  );
  if (r.error || r.status !== 0) return null;
  const p = String(r.stdout ?? "").replace(/^﻿/, "").trim();
  return p && isDir(p) ? p : null;
}

export type DesktopResult = { dir: string | null; tried: string[] };

export function findDesktop(o: { home?: string; platform?: NodeJS.Platform; shell?: () => string | null } = {}): DesktopResult {
  const override = process.env.SHOWCASE_DESKTOP_DIR;
  if (override && override.trim()) {
    const p = path.resolve(override.trim());
    return { dir: isDir(p) ? p : null, tried: [p] };
  }
  const tried: string[] = [];
  const platform = o.platform ?? process.platform;
  if (platform === "win32") {
    const shell = (o.shell ?? windowsShellDesktop)();
    if (shell) return { dir: shell, tried: [shell] };
    tried.push("（Windows の設定のデスクトップ）");
  }
  for (const c of desktopCandidates(o.home ?? os.homedir())) {
    tried.push(c);
    if (isDir(c)) return { dir: c, tried };
  }
  return { dir: null, tried };
}

/** Windows・Mac でフォルダ名に使えない文字を除く（純粋関数・テストあり）。空になったら fallback */
export function safeFolderName(s: string, fallback = "アプリ"): string {
  const t = s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .replace(/[〔〕]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return (t || fallback).slice(0, 60);
}
