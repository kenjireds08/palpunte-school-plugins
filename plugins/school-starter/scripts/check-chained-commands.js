#!/usr/bin/env node
/**
 * PreToolUse Hook (Bash): サブコマンド連結が多いコマンドをブロック
 *
 * 仕様:
 *   - stdin に PreToolUse の JSON が来る
 *   - tool_input.command を取り出す
 *   - && / || / ; の連結が THRESHOLD_SEP 個以上ならブロック（exit 2）
 *   - curl/wget を pipe to sh/bash する危険パターンもブロック
 *   - exit 2 は公式仕様で blocking（exit 1 は non-blocking なので使用禁止）
 *
 * 参考: https://code.claude.com/docs/en/hooks
 */

const THRESHOLD_SEP = 10;

// 危険な即ブロック対象パターン（連結数に関係なくブロック）
const DANGER_PATTERNS = [
  /curl\s+[^\s|]+\s*\|\s*(sh|bash|zsh)\b/i,      // curl ... | sh
  /wget\s+[^\s|]+\s*\|\s*(sh|bash|zsh)\b/i,      // wget ... | sh
  /\|\s*(sh|bash|zsh)\s*$/i,                      // ... | sh (行末)
  /\bbase64\s+(-d|--decode)\b.*\|\s*(sh|bash)/i,  // base64 -d | sh
  /\beval\s*\$\(curl\b/i,                         // eval $(curl ...)
  />\s*\/dev\/tcp\//i,                            // > /dev/tcp/
];

let data = '';
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const cmd = input.tool_input?.command || '';

    // 危険パターン即ブロック
    for (const pattern of DANGER_PATTERNS) {
      if (pattern.test(cmd)) {
        console.error(
          `[Hook] BLOCKED: 危険なコマンドパターンを検出しました (${pattern}). ` +
            `curl/wget を直接シェルにパイプする実行は拒否します。`
        );
        process.exit(2); // blocking
      }
    }

    // サブコマンド連結数カウント
    const seps = (cmd.match(/&&|\|\||;/g) || []).length;
    if (seps >= THRESHOLD_SEP) {
      console.error(
        `[Hook] BLOCKED: サブコマンド連結が多すぎます（${seps}個）。` +
          `プロンプトインジェクション対策のためブロックしました。` +
          `分割して実行してください。`
      );
      process.exit(2); // blocking
    }

    // OK: そのまま通す
    process.stdout.write(data);
    process.exit(0);
  } catch (e) {
    // JSON パースエラー等: Hook 自身のバグで実行を妨げないよう通過させる
    console.error(`[Hook] check-chained-commands parse error: ${e.message}`);
    process.stdout.write(data);
    process.exit(0);
  }
});
