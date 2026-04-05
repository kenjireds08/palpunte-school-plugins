#!/usr/bin/env node
/**
 * GlassWorm対策: ソースコードに埋め込まれた不可視Unicode文字を検出する
 *
 * 使い方:
 *   node detect-invisible-unicode.js [ディレクトリ]     # プロジェクト全体スキャン
 *   echo '{"tool_input":{"file_path":"..."}}' | node detect-invisible-unicode.js --hook  # Hook用
 */

const fs = require('fs');
const path = require('path');

// 危険な不可視Unicode文字の範囲
const INVISIBLE_PATTERNS = [
  { range: /[\uFE00-\uFE0F]/g, name: '異体字セレクター (U+FE00-FE0F)' },
  { range: /[\u200B-\u200F]/g, name: 'ゼロ幅文字 (U+200B-200F)' },
  { range: /[\u2028-\u2029]/g, name: '行/段落区切り (U+2028-2029)' },
  { range: /[\u2060-\u2064]/g, name: '不可視書式 (U+2060-2064)' },
  { range: /[\u202A-\u202E]/g, name: '書字方向制御 (U+202A-202E)' },
  { range: /[\u2066-\u2069]/g, name: '分離制御 (U+2066-2069)' },
  { range: /[\uFEFF]/g, name: 'BOM/ZWNBSP (U+FEFF)' },
  { range: /[\u00AD]/g, name: 'ソフトハイフン (U+00AD)' },
  { range: /[\u034F]/g, name: '結合用文字 (U+034F)' },
  { range: /[\u061C]/g, name: 'アラビア文字マーク (U+061C)' },
  { range: /[\u180E]/g, name: 'モンゴル母音区切り (U+180E)' },
];

// スキャン対象の拡張子
const TARGET_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.sh', '.bash', '.zsh',
  '.json', '.yaml', '.yml', '.toml',
  '.css', '.scss', '.less',
  '.html', '.vue', '.svelte',
]);

// 除外ディレクトリ
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache',
  'coverage', '__pycache__', '.venv', 'vendor',
]);

// 1行あたりの不可視文字がこの数を超えたら警告（GlassWormは数千〜数万個埋め込む）
// 日本語環境では異体字セレクターが1〜2個混入するのは正常
const SUSPICIOUS_THRESHOLD_PER_LINE = 3;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const findings = [];

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let lineTotal = 0;
    const lineFindings = [];

    for (const pattern of INVISIBLE_PATTERNS) {
      pattern.range.lastIndex = 0;
      const matches = line.match(pattern.range);
      if (matches) {
        lineTotal += matches.length;
        lineFindings.push({
          line: i + 1,
          count: matches.length,
          type: pattern.name,
        });
      }
    }

    // 閾値を超えた行のみ報告（GlassWormは大量に埋め込むため）
    if (lineTotal >= SUSPICIOUS_THRESHOLD_PER_LINE) {
      findings.push(...lineFindings);
    }
  }

  return findings;
}

function walkDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (TARGET_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// --- Hook モード ---
if (process.argv.includes('--hook')) {
  let data = '';
  process.stdin.on('data', chunk => data += chunk);
  process.stdin.on('end', () => {
    try {
      const event = JSON.parse(data);
      const filePath = event.tool_input?.file_path || event.tool_input?.path || '';

      if (!filePath || !fs.existsSync(filePath)) {
        process.exit(0);
      }

      const ext = path.extname(filePath);
      if (!TARGET_EXTENSIONS.has(ext)) {
        process.exit(0);
      }

      const findings = scanFile(filePath);
      if (findings.length > 0) {
        const total = findings.reduce((sum, f) => sum + f.count, 0);
        console.error(`⚠️ GlassWorm検出: ${filePath} に不可視Unicode文字が ${total}個 見つかりました`);
        for (const f of findings) {
          console.error(`  行${f.line}: ${f.type} x${f.count}`);
        }
        console.error('このファイルにマルウェアが混入している可能性があります。内容を確認してください。');
        process.exit(2); // ブロック
      }
    } catch (e) {
      // パースエラーは無視して通過
    }
    process.exit(0);
  });
  return;
}

// --- スキャンモード ---
const targetDir = process.argv[2] || process.cwd();
console.log(`Scanning: ${targetDir}\n`);

const files = walkDir(targetDir);
let totalFindings = 0;
let infectedFiles = 0;

for (const file of files) {
  const findings = scanFile(file);
  if (findings.length > 0) {
    infectedFiles++;
    const relPath = path.relative(targetDir, file);
    const total = findings.reduce((sum, f) => sum + f.count, 0);
    totalFindings += total;
    console.log(`❌ ${relPath} (${total}個の不可視文字)`);
    for (const f of findings) {
      console.log(`   行${f.line}: ${f.type} x${f.count}`);
    }
  }
}

console.log(`\n--- スキャン完了 ---`);
console.log(`ファイル数: ${files.length}`);
console.log(`検出: ${infectedFiles}ファイル / ${totalFindings}個の不可視文字`);

if (totalFindings === 0) {
  console.log('✅ 不可視文字は検出されませんでした');
} else {
  console.log('⚠️ 不可視文字が検出されました。マルウェア混入の可能性を確認してください');
  process.exit(1);
}
