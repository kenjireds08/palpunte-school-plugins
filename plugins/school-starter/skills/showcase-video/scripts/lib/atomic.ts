// 書き込みを「全部書けた」か「元のまま」のどちらかにする共有部品。
// 同じフォルダに一時ファイルを書いてから rename する（同じファイルシステム内の rename は途中の状態を見せない）。

import fs from "node:fs";
import path from "node:path";

/** 一時ファイルのパス（出力と同じフォルダ・拡張子は残す。ffmpeg が拡張子で形式を決めるため） */
export function tmpPathFor(target: string): string {
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  return path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}${ext}`);
}

/** data を一時ファイルに書いてから target へ rename する */
export function writeFileAtomic(target: string, data: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = tmpPathFor(target);
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}
