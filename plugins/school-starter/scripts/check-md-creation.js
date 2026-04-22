#!/usr/bin/env node
/**
 * 不要な Markdown / テキストファイルの新規作成を抑止する Hook。
 *
 * 設計方針:
 *   - .md / .txt ファイルを対象
 *   - 既存ファイルの編集は常に通す（運用に必要な更新を邪魔しない）
 *   - docs/ / curriculum/ / references/ / Obsidian/ 配下は新規作成でも通す
 *   - README / CLAUDE / AGENTS / CONTRIBUTING / 000_PROJECT_STATUS の
 *     標準ドキュメントは allowlist で通す
 *   - それ以外（典型的にはプロジェクトルート直下の NOTES.md / TODO.md 等）
 *     はブロックし、docs/ 配下への配置を促す
 *
 * matcher は Write / Edit / MultiEdit の全部に発動させる前提。
 * Edit で「存在しないファイルを編集」という抜け穴も既存ファイル判定で塞ぐ。
 */

const fs = require('fs');

let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(d);
    const p = input.tool_input?.file_path || '';

    // .md / .txt 以外は対象外
    if (!/\.(md|txt)$/.test(p)) {
      process.stdout.write(d);
      return;
    }

    // 既存ファイルの編集は常に通す（運用に必要な更新を邪魔しない）
    if (fs.existsSync(p)) {
      process.stdout.write(d);
      return;
    }

    // 標準ドキュメントの allowlist
    const ALLOWED_NAMES = /(README|CLAUDE|AGENTS|CONTRIBUTING|000_PROJECT_STATUS)\.md$/;
    if (ALLOWED_NAMES.test(p)) {
      process.stdout.write(d);
      return;
    }

    // 許可ディレクトリ配下（ファイルの親ディレクトリのどこかに含まれていれば OK）
    const ALLOWED_DIRS = [
      /[\\/]Obsidian[\\/]/,
      /[\\/]docs[\\/]/,
      /[\\/]curriculum[\\/]/,
      /[\\/]references[\\/]/,
    ];
    if (ALLOWED_DIRS.some((re) => re.test(p))) {
      process.stdout.write(d);
      return;
    }

    // 上記いずれにも該当しない = プロジェクトルート直下の新規 .md / .txt など
    console.error('[Hook] BLOCKED: Unnecessary .md/.txt file creation outside docs/');
    console.error('[Hook] File: ' + p);
    console.error(
      '[Hook] Put documentation under docs/ (or curriculum/ / references/), or use README.md / CLAUDE.md at the project root.'
    );
    process.exit(2);
  } catch (_e) {
    // JSON パース失敗等の場合は通す（他の Hook に副作用を出さない）
    process.stdout.write(d);
  }
});
