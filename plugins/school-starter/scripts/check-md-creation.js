#!/usr/bin/env node
/**
 * 不要な Markdown / テキストファイルの新規作成を抑止する Hook。
 *
 * 設計方針:
 *   - .md / .txt ファイルを対象
 *   - 既存ファイルの編集は常に通す（運用に必要な更新を邪魔しない）
 *   - docs/ / curriculum/ / references/ / obsidian/（大文字小文字は区別しない）配下は新規作成でも通す
 *   - README / CLAUDE / AGENTS / CONTRIBUTING / 000_PROJECT_STATUS / DESIGN の
 *     標準ドキュメントは allowlist で通す
 *   - 置き場所が仕様で決まっている .txt（robots.txt / ads.txt / security.txt 等）と
 *     public/ / .well-known/ 配下の .txt は通す（v1.27.3）
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
    // DESIGN.md は frontend-workflow が「プロジェクトルートに DESIGN.md があれば UI 生成時に必ず読む」
    // とルート決め打ちで参照するため、ルート直下の新規作成を許可する（#25・2026-05-24）。
    const ALLOWED_NAMES = /(README|CLAUDE|AGENTS|CONTRIBUTING|000_PROJECT_STATUS|DESIGN)\.md$/;
    if (ALLOWED_NAMES.test(p)) {
      process.stdout.write(d);
      return;
    }

    // 置き場所が仕様で決まっている標準 .txt（v1.27.3・受講生報告 #2）
    // robots.txt / ads.txt / app-ads.txt / security.txt / humans.txt / llms.txt は
    // サイト直下（public/ 等）にしか置けず、docs/ に逃がすと機能しない。
    // requirements.txt（Python）/ CMakeLists.txt も同様にルート決め打ち。
    const ALLOWED_TXT_NAMES = /(?:^|[\\/])(robots|ads|app-ads|security|humans|llms|llms-full|requirements(?:[-_.][\w.-]+)?|CMakeLists)\.txt$/;
    if (ALLOWED_TXT_NAMES.test(p)) {
      process.stdout.write(d);
      return;
    }

    // 許可ディレクトリ配下（ファイルの親ディレクトリのどこかに含まれていれば OK）
    // v1.14.0: プラグイン構造の必須パス（skills / commands / agents / hooks / scripts / .claude-plugin / plugins）を追加
    // v1.15.0: plans/ を追加（setup.md が plansDirectory を推奨しているのに Hook でブロックする自己矛盾を解消）
    // v1.21.6: rules/ を追加（setup が ~/.claude/rules/*.md を書くのに許可リストに無く、
    //          rules/ が空の「初回 setup」で全 .md がブロックされる致命バグを修正。
    //          既存ファイルがある環境では編集扱いで通っていたため発覚が遅れた）
    // v1.26.1: memory/ を追加（Claude Code のメモリ機能は projects/<名前>/memory/ に
    //          1メモ1ファイルで書く仕様なのに許可リストに無く、新しいメモを作れなかった。
    //          既存の MEMORY.md は「既存ファイル＝編集」で通っていたため発覚が遅れた。
    //          受講生から「AI が Bash でこの Hook を迂回した」の報告で判明・rules/ と同型の抜け）
    // v1.27.3: Obsidian/ を大文字小文字無視に（コメントは「Obsidian 配下は通す」なのに実装が
    //          大文字始まり限定で、小文字 obsidian/ が通らなかった・受講生報告 #1）。
    //          public/ と .well-known/ を追加（robots.txt 等の標準 .txt がブロックされていた・同 #2）
    const ALLOWED_DIRS = [
      /[\\/]obsidian[\\/]/i,
      /[\\/]public[\\/]/,
      /[\\/]\.well-known[\\/]/,
      /[\\/]memory[\\/]/,
      /[\\/]docs[\\/]/,
      /[\\/]curriculum[\\/]/,
      /[\\/]references[\\/]/,
      /[\\/]rules[\\/]/,
      /[\\/]plans[\\/]/,
      /[\\/]plugins[\\/]/,
      /[\\/]skills[\\/]/,
      /[\\/]commands[\\/]/,
      /[\\/]agents[\\/]/,
      /[\\/]hooks[\\/]/,
      /[\\/]scripts[\\/]/,
      /[\\/]\.claude-plugin[\\/]/,
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
