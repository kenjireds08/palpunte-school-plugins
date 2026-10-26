// 声の聞き比べの候補（voice-samples/catalog.json）を読む部品。voice-samples.ts・voice-choice.ts・gen-voice-samples.ts が使う。
// テストでは SHOWCASE_VOICE_SAMPLES_DIR で置き場を差し替える。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Provider = "gemini" | "elevenlabs";
export type Candidate = { no: number; id: string; model: string; label: string; recommended: boolean; source?: string; file: string | null };
export type Catalog = { $comment?: string; sentence: string; gemini: Candidate[]; elevenlabs: Candidate[] };

export class CatalogError extends Error {}

export const PROVIDER_LABEL: Record<Provider, string> = { gemini: "Gemini", elevenlabs: "ElevenLabs" };

/** 同梱の置き場（スキルのフォルダの voice-samples/） */
export function samplesDir(): string {
  const o = process.env.SHOWCASE_VOICE_SAMPLES_DIR;
  if (o && o.trim()) return path.resolve(o.trim());
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "voice-samples");
}

export const catalogFile = (dir = samplesDir()) => path.join(dir, "catalog.json");

/** 形を確かめる（純粋関数・テストあり）。番号は 1 から連番・1 番がおすすめ・id の重複なし */
export function validateCatalog(raw: unknown): Catalog {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CatalogError("catalog.json の形が違います");
  const c = raw as Record<string, unknown>;
  if (typeof c.sentence !== "string" || !c.sentence.trim()) throw new CatalogError("catalog.json の sentence（試聴の 1 文）が空です");
  for (const p of ["gemini", "elevenlabs"] as Provider[]) {
    const list = c[p];
    if (!Array.isArray(list) || list.length === 0) throw new CatalogError(`catalog.json の ${p} に候補がありません`);
    const ids = new Set<string>();
    list.forEach((x: unknown, i: number) => {
      const e = x as Partial<Candidate>;
      const where = `catalog.json の ${p}[${i}]`;
      if (e?.no !== i + 1) throw new CatalogError(`${where} の no は ${i + 1} です（1 から連番）`);
      if (typeof e.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(e.id)) throw new CatalogError(`${where} の id が不正です`);
      if (ids.has(e.id)) throw new CatalogError(`${where} の id が重複しています: ${e.id}`);
      ids.add(e.id);
      if (typeof e.model !== "string" || !e.model) throw new CatalogError(`${where} の model が空です`);
      if (typeof e.label !== "string" || !e.label) throw new CatalogError(`${where} の label が空です`);
      if (typeof e.recommended !== "boolean") throw new CatalogError(`${where} の recommended は true / false です`);
      if (e.recommended !== (i === 0)) throw new CatalogError(`${where}: おすすめ（recommended: true）は 1 番だけです`);
      if (e.file !== null && (typeof e.file !== "string" || !/^(gemini|elevenlabs)\/[\w.-]+\.mp3$/.test(e.file))) {
        throw new CatalogError(`${where} の file は "${p}/<名前>.mp3" か null です`);
      }
    });
  }
  return c as unknown as Catalog;
}

export function loadCatalog(dir = samplesDir()): Catalog {
  const f = catalogFile(dir);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    throw new CatalogError(`声の候補の一覧を読めません: ${f}（${(e as Error).message}）`);
  }
  return validateCatalog(raw);
}

/** 番号（"2"）か id で候補を引く。無ければ null（純粋関数・テストあり） */
export function findCandidate(cat: Catalog, provider: Provider, sel: string): Candidate | null {
  const list = cat[provider];
  const t = sel.trim();
  if (/^\d+$/.test(t)) return list.find((c) => c.no === Number(t)) ?? null;
  return list.find((c) => c.id === t) ?? null;
}

/** 試聴の音声のファイル（同梱されていなければ null） */
export function sampleFile(c: Candidate, dir = samplesDir()): string | null {
  if (!c.file) return null;
  const f = path.join(dir, ...c.file.split("/"));
  return fs.existsSync(f) ? f : null;
}

/** デスクトップに置くときの名前（例: 1_おすすめ_明るく軽やかな男性（20 代・広告の声）.mp3） */
export function placedName(c: Candidate): string {
  const label = c.label.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "");
  return `${c.no}_${c.recommended ? "おすすめ_" : ""}${label}.mp3`;
}
