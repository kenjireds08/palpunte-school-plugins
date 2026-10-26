// ffpath.mjs の型（.ts の道具から読むため）
export type FfmpegPathResult = { status: "on-path" | "added" | "missing"; dir: string | null };
type Opts = { env?: Record<string, string | undefined>; platform?: string };
export function candidateDirs(opts?: Opts): string[];
export function ensureFfmpegOnPath(opts?: Opts): FfmpegPathResult;
export function pathPrefixLines(dir: string, platform?: string): { bash: string; powershell?: string };
