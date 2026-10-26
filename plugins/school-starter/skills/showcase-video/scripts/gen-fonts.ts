// 動画の HTML で実際に使っている文字だけを含むフォントを埋め込む。
//
// 出どころ: 最初の制作で使ったフォント生成のスクリプト 2 本
//   （2026-09-26）を 1 本にまとめ、
//   パスのハードコードを引数にした。
//
// やること:
//   1. --html の全文字を走査する（FONTS マーカーの中身は除く）
//   2. @fontsource の unicode-range サブセットのうち、使っている文字を含むものだけ選ぶ
//   3. その woff2 を一時フォルダに集めてから --out の古い woff2 と入れ替え、
//      HTML の /* FONTS:BEGIN */ … /* FONTS:END */ の間を @font-face で書き換える（途中で失敗したら元に戻す）
//   4. 必須ファミリーでカバーできない文字（ASCII 以外）が 1 つでもあれば、書き換えずに止まる
//   5. 任意ファミリー（required なし）が入っていなければ警告を出して飛ばす（2026-09-26 Codex レビューで修正）
//
// なぜ: 作業環境では curl / Google Fonts への外部取得がブロックされる。npm の @fontsource から取り、
//   使用文字だけに絞ってローカル埋め込みすれば、描画時の外部通信もフォント落ちも起きない。
//
// 実行:
//   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-fonts.ts" --html <動画>/index.html [--html 同じフォルダの別.html …]
//        [--fontsource <…/node_modules/@fontsource>]   既定: <html のフォルダ>から上へ探した node_modules/@fontsource
//        [--out <woff2 の出力先>]                       既定: <html のフォルダ>/assets/fonts
//        [--url-prefix assets/fonts/]                   @font-face の src に付ける相対パス
//        [--family "noto-sans-jp:Noto Sans JP:700,900:required"] …（繰り返し可）
//   ファミリーを 1 つも渡さないときの既定: Noto Sans JP 700/900（必須）+ Anton 400（任意）
//   事前に: promo-video フォルダで npm install（package.json はテンプレートから写したもの。references/setup.md「道具をそろえる」）

import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "./lib/atomic.ts";

class FontError extends Error {}

type Family = { pkg: string; family: string; weights: number[]; required: boolean };
type Subset = { file: string; rangeText: string; ranges: Array<[number, number]> };

const MARKERS = /\/\* FONTS:BEGIN \*\/[\s\S]*?\/\* FONTS:END \*\//;

const HELP = `gen-fonts.ts — HTML で使っている文字だけの woff2 を @fontsource から選んで埋め込む

  node gen-fonts.ts --html <index.html> [--html <同じフォルダの別.html> ...] [--fontsource <dir>] [--out <dir>] [--url-prefix assets/fonts/]
                    [--family "<pkg>:<表示名>:<太さ,太さ>[:required]"] ...

  --html        書き換える HTML（/* FONTS:BEGIN */ … /* FONTS:END */ のマーカーが必要）。繰り返し可。
                OGP と poster のように同じフォルダの HTML は 1 回の実行でまとめる（全部の文字を合わせた 1 組を共有）。
                出力先の古い woff2 は入れ替わるので、同じ出力先を別々の実行で使うと先の HTML のフォントが消える
  --fontsource  node_modules/@fontsource のパス（既定: <html のフォルダ>から上へ探す。promo-video/node_modules/@fontsource）
  --out         woff2 の出力先（既定: <html のフォルダ>/assets/fonts）。新しい一式を一時フォルダで作ってから、
                中の古い .woff2 と入れ替える（途中で失敗したら古いものに戻す）
  --url-prefix  @font-face の url() に付ける接頭辞（既定: assets/fonts/）
  --family      既定は "noto-sans-jp:Noto Sans JP:700,900:required" と "anton:Anton:400"
                required を付けたファミリーで ASCII 以外の文字が 1 つでも欠けたら書き換えずに終了コード 1。
                required の無いファミリーが入っていなければ、警告を出してそのファミリーだけ飛ばす
  知らないオプション・値の抜け・1 回だけのオプションの重複は終了コード 1

終了コード: 0 成功 / 1 失敗`;

/** 値を 1 つ取るオプション（1 回だけ）・繰り返せるオプション・値を取らないオプション */
const SINGLE_VALUED = new Set(["fontsource", "out", "url-prefix"]);
const REPEATABLE = new Set(["html", "family"]);
const FLAGS = new Set(["help"]);

export function parseArgs(argv: string[]): { single: Map<string, string | true>; families: string[]; htmls: string[] } {
  const single = new Map<string, string | true>();
  const families: string[] = [];
  const htmls: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new FontError(`不明な引数です: ${a}（オプションは --名前 の形。--help で一覧）`);
    const name = a.slice(2);
    if (FLAGS.has(name)) {
      single.set(name, true);
      continue;
    }
    if (!SINGLE_VALUED.has(name) && !REPEATABLE.has(name)) {
      throw new FontError(`不明なオプションです: --${name}（打ち間違いの可能性。--help で一覧）`);
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) throw new FontError(`--${name} には値が必要です`);
    i++;
    if (name === "family") families.push(next);
    else if (name === "html") htmls.push(next);
    else {
      if (single.has(name)) throw new FontError(`--${name} が 2 回指定されています`);
      single.set(name, next);
    }
  }
  return { single, families, htmls };
}

function val(m: Map<string, string | true>, name: string): string | undefined {
  const v = m.get(name);
  if (v === true) throw new FontError(`--${name} には値が必要です`);
  return v;
}

function parseFamily(spec: string): Family {
  const parts = spec.split(":");
  if (parts.length < 3 || parts.length > 4) throw new FontError(`--family の書式が不正です: ${spec}`);
  const [pkg, family, w, req] = parts;
  if (!/^[a-z0-9-]+$/.test(pkg)) throw new FontError(`--family のパッケージ名が不正です: ${pkg}`);
  const weights = w.split(",").map((x) => Number(x.trim()));
  if (weights.some((x) => !Number.isInteger(x) || x < 100 || x > 900)) throw new FontError(`--family の太さが不正です: ${w}`);
  if (req !== undefined && req !== "required") throw new FontError(`--family の 4 つ目は required だけ書けます: ${req}`);
  return { pkg, family, weights, required: req === "required" };
}

function parseRanges(str: string): Array<[number, number]> {
  return str.split(",").map((s) => {
    const m = s.trim().replace(/^U\+/i, "").split("-");
    const a = parseInt(m[0], 16);
    const b = m[1] ? parseInt(m[1], 16) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new FontError(`unicode-range を読めません: ${s}`);
    return [a, b] as [number, number];
  });
}

/** html のフォルダから上へ node_modules/@fontsource を探す（無ければ html のフォルダのものを返し、後のエラーで案内する） */
function findFontsource(base: string): string {
  for (let d = base; ; ) {
    const c = path.join(d, "node_modules", "@fontsource");
    if (fs.existsSync(c)) return c;
    const up = path.dirname(d);
    if (up === d) return path.join(base, "node_modules", "@fontsource");
    d = up;
  }
}

function parseCss(cssPath: string): Subset[] {
  if (!fs.existsSync(cssPath)) {
    throw new FontError(`フォントの CSS がありません: ${cssPath}\n  → promo-video フォルダで npm install を実行してください（references/setup.md「道具をそろえる」）`);
  }
  const css = fs.readFileSync(cssPath, "utf8");
  const blocks = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
  if (blocks.length === 0) throw new FontError(`@font-face が見つかりません: ${cssPath}`);
  return blocks.map((b) => {
    const src = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(b);
    const ur = /unicode-range:\s*([^;]+);/.exec(b);
    if (!src || !ur) throw new FontError(`読めない @font-face があります: ${cssPath}`);
    return { file: src[1], rangeText: ur[1].trim(), ranges: parseRanges(ur[1]) };
  });
}

function main(): void {
  const { single, families: familySpecs, htmls: htmlArgs } = parseArgs(process.argv.slice(2));
  if (single.get("help") === true) {
    console.log(HELP);
    return;
  }
  if (htmlArgs.length === 0) throw new FontError("--html が必要です（--help で使い方）");
  const htmls = htmlArgs.map((h) => path.resolve(h));
  for (const h of htmls) if (!fs.existsSync(h)) throw new FontError(`HTML がありません: ${h}`);
  const base = path.dirname(htmls[0]);
  if (htmls.some((h) => path.dirname(h) !== base)) {
    throw new FontError("複数の --html は同じフォルダに置いてください（url-prefix の相対パスを共有するため）");
  }
  const fontsource = path.resolve(val(single, "fontsource") ?? findFontsource(base));
  const outDir = path.resolve(val(single, "out") ?? path.join(base, "assets/fonts"));
  const urlPrefix = val(single, "url-prefix") ?? "assets/fonts/";
  const families: Family[] =
    familySpecs.length > 0
      ? familySpecs.map(parseFamily)
      : [
          { pkg: "noto-sans-jp", family: "Noto Sans JP", weights: [700, 900], required: true },
          { pkg: "anton", family: "Anton", weights: [400], required: false },
        ];

  const sources = new Map<string, string>();
  const chars = new Set<number>();
  for (const html of htmls) {
    const src = fs.readFileSync(html, "utf8");
    if (!MARKERS.test(src)) throw new FontError(`FONTS マーカーがありません: ${html}\n  → <style> の先頭に /* FONTS:BEGIN */ と /* FONTS:END */ を置いてください`);
    sources.set(html, src);
    // HTML コメント（<!-- -->）は画面に出ないので走査しない（テンプレートの説明コメントでフォントが膨らまないように）。
    // JS の文字列は画面に出ることがある（DOM を組み立てる文言）ので、<script> の中は削らずに数える
    const body = src.replace(MARKERS, "").replace(/<!--[\s\S]*?-->/g, "");
    for (const ch of body) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && cp >= 0x20) chars.add(cp);
    }
  }

  // 先に全部選んで、欠けがあれば 1 つもコピー・書き換えしないで止まる
  const plan: Array<{ fam: Family; weight: number; dir: string; picked: Set<Subset> }> = [];
  for (const fam of families) {
    const dir = path.join(fontsource, fam.pkg);
    for (const w of fam.weights) {
      const cssPath = path.join(dir, `${w}.css`);
      // 任意のファミリー（required なし）が入っていないときは、そのファミリーだけ飛ばす。
      // 黙って飛ばすと英字見出し（Anton 等）の見た目が変わったことに気づけないので、必ず警告を出す。
      // CSS があって壊れている場合は任意でもエラー（入れたつもりのものが壊れているのは直すべき）
      if (!fam.required && !fs.existsSync(cssPath)) {
        console.error(
          `[gen-fonts] 注意: 任意のフォント ${fam.family} ${w} が入っていないので飛ばします（${cssPath}）。` +
            `その文字は代わりのフォントで描かれます。入れるなら promo-video フォルダで npm install（package.json に @fontsource/${fam.pkg} がある）`,
        );
        continue;
      }
      const subsets = parseCss(cssPath);
      const picked = new Set<Subset>();
      const missing: number[] = [];
      for (const cp of chars) {
        const hit = subsets.find((s) => s.ranges.some(([a, b]) => cp >= a && cp <= b));
        if (hit) picked.add(hit);
        else if (cp > 0x7e) missing.push(cp);
      }
      if (fam.required && missing.length > 0) {
        throw new FontError(`${fam.family} ${w} に無い文字があります: ${missing.map((c) => String.fromCodePoint(c)).join("")}`);
      }
      plan.push({ fam, weight: w, dir, picked });
    }
  }

  if (plan.length === 0) throw new FontError("埋め込むフォントが 1 つもありません（全部が任意で、どれも入っていない）");

  // 1) 一時フォルダに全部コピーして CSS を組む（ここで失敗しても出力先は元のまま）
  fs.mkdirSync(path.dirname(outDir), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(outDir), `.${path.basename(outDir)}.tmp-`));
  let css = "/* FONTS:BEGIN */\n";
  const staged: string[] = [];
  try {
    for (const p of plan) {
      for (const s of p.picked) {
        const from = path.join(p.dir, "files", s.file);
        if (!fs.existsSync(from)) throw new FontError(`CSS にある woff2 がありません: ${from}`);
        fs.copyFileSync(from, path.join(stage, s.file));
        staged.push(s.file);
        css += `@font-face{font-family:"${p.fam.family}";font-style:normal;font-weight:${p.weight};font-display:block;src:url("${urlPrefix}${s.file}") format("woff2");unicode-range:${s.rangeText};}\n`;
      }
      console.log(`${p.fam.family} ${p.weight}: ${p.picked.size} サブセット`);
    }
    css += "/* FONTS:END */";
    // 2) 入れ替え: 古い woff2 を退避 → 新しいものを rename で入れる → HTML を 1 本ずつ一時ファイル経由で書く。
    //    途中で失敗したら退避したものを戻す
    swapInto(outDir, stage, staged, () => {
      for (const [html, src] of sources) writeFileAtomic(html, src.replace(MARKERS, () => css));
    });
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  console.log(`woff2 を ${staged.length} 個入れ替え（${outDir}）／走査した文字 ${chars.size} 種／書き換え: ${[...sources.keys()].join(", ")}`);
}

/** outDir の古い .woff2 を退避してから stage の新しいものを入れ、after() を実行する。失敗したら元に戻す */
function swapInto(outDir: string, stage: string, files: string[], after: () => void): void {
  fs.mkdirSync(outDir, { recursive: true });
  const backup = fs.mkdtempSync(path.join(path.dirname(outDir), `.${path.basename(outDir)}.old-`));
  const moved: string[] = [];
  const placed: string[] = [];
  try {
    for (const f of fs.readdirSync(outDir)) {
      if (!f.endsWith(".woff2")) continue;
      fs.renameSync(path.join(outDir, f), path.join(backup, f));
      moved.push(f);
    }
    for (const f of files) {
      fs.renameSync(path.join(stage, f), path.join(outDir, f));
      placed.push(f);
    }
    after();
  } catch (e) {
    for (const f of placed) fs.rmSync(path.join(outDir, f), { force: true });
    for (const f of moved) fs.renameSync(path.join(backup, f), path.join(outDir, f));
    fs.rmSync(backup, { recursive: true, force: true });
    throw e;
  }
  fs.rmSync(backup, { recursive: true, force: true });
}

try {
  main();
} catch (e) {
  if (e instanceof FontError) console.error(`[gen-fonts] ${e.message}`);
  else console.error(`[gen-fonts] 想定外のエラー: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(1);
}
