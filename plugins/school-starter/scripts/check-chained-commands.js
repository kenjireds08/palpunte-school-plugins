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

// Hook が危険パターンを検出したときに鳴らす警告音（Stop Hook の通常完了音と区別するため）
// 非同期・detached で鳴らして exit をブロックしない
function playAlertSound() {
  try {
    const { spawn } = require('child_process');
    const cmd =
      'afplay /System/Library/Sounds/Basso.aiff 2>/dev/null || ' +
      'powershell.exe -c "[console]::beep(400,500)" 2>/dev/null || ' +
      'paplay /usr/share/sounds/freedesktop/stereo/dialog-warning.oga 2>/dev/null || ' +
      'pw-play /usr/share/sounds/freedesktop/stereo/dialog-warning.oga 2>/dev/null || ' +
      'printf "\\a\\a\\a"';
    const child = spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    // 音の再生に失敗しても Hook のブロック動作は継続する
  }
}

// 危険な即ブロック対象パターン（連結数に関係なくブロック）
const DANGER_PATTERNS = [
  /curl\s+[^\s|]+\s*\|\s*(sh|bash|zsh)\b/i,       // curl ... | sh
  /wget\s+[^\s|]+\s*\|\s*(sh|bash|zsh)\b/i,       // wget ... | sh
  /\|\s*(sh|bash|zsh)\s*$/i,                       // ... | sh (行末)
  /\bbase64\s+(-d|--decode)\b.*\|\s*(sh|bash)/i,   // base64 -d | sh
  /\beval\s*\$\(\s*(curl|wget|fetch)\b/i,          // eval $(curl/wget/fetch ...)
  /\beval\s+.*base64\s+(-d|--decode)\b/i,          // eval ... base64 -d ...（難読化経由）
  />\s*\/dev\/tcp\//i,                             // > /dev/tcp/ (TCP書き込み)
  />\s*\/dev\/udp\//i,                             // > /dev/udp/ (UDP書き込み)
  /\bxxd\s+-r\b.*\|\s*(sh|bash|zsh)/i,             // xxd -r | sh（16進復号経由）
  /\bpython3?\s+-c\s+.*(exec|eval)\s*\(/i,         // python -c 'exec(...)' / 'eval(...)'
  /\bperl\s+-e\s+.*(system|exec|eval)\s*\(/i,      // perl -e 'system(...)' / 'exec(...)' / 'eval(...)'
  /\bnode\s+-e\s+.*(require\s*\(\s*['"]child_process|exec\s*\()/i, // node -e 'require("child_process")...'
  /\bprintf\s+.*\|\s*(sh|bash|zsh)/i,              // printf ... | sh (base64 回避の亜種)

  // 秘密ファイル exfiltration 複合パターン（v1.15.1）
  // 鍵・env・認証情報を読み取り → パイプで外部送信系コマンドへ、の流れを検出
  // 連結カウントでは捕まらない短い攻撃（例: cat ~/.ssh/id_rsa | base64 | curl ...）を塞ぐ
  /\b(cat|head|tail|less|more|tac|xxd|base64|strings)\s+[^|;&]*(~\/\.ssh|~\/\.aws|~\/\.gnupg|~\/\.azure|~\/\.kube|~\/\.docker|~\/\.supabase|~\/\.config\/gcloud|~\/\.config\/gh|~\/\.git-credentials|~\/\.netrc|~\/\.npmrc|~\/\.pgpass|~\/\.my\.cnf|~\/\.zsh_history|~\/\.bash_history|~\/\.python_history|~\/\.node_repl_history|id_rsa|id_ed25519|id_ecdsa|\.pem|\.p12|\.pfx|\.env|credentials|service-account|serviceAccountKey|firebase-adminsdk|access-token|\.gnupg|Keychains)[^|;&]*\|[^|;&]*\b(curl|wget|nc\b|ncat|socat|http|https-proxy|fetch|upload)/i,

  // 秘密ファイル → base64/xxd で変換 → さらにパイプ（難読化して外部送信する亜種）
  /\b(base64|xxd|openssl\s+enc|openssl\s+base64|gzip|zstd|bzip2)\s+[^|;&]*(~\/\.ssh|~\/\.aws|~\/\.gnupg|id_rsa|id_ed25519|\.pem|\.key|\.env|credentials|access-token|service-account|serviceAccountKey)[^|;&]*\|/i,

  // 痕跡消去パターン（history -c と HISTFILE 無効化の組み合わせ・順序問わず）
  /\bhistory\s+-c\b.*\b(unset\s+HISTFILE|export\s+HISTFILE=)/i,
  /\b(unset\s+HISTFILE|export\s+HISTFILE=\/dev\/null|HISTFILE=\/dev\/null)\b.*\bhistory\s+-c\b/i,

  // rm -rf の事故防止（deny リストが素通った場合の最終防衛・ホームや root を一括削除する亜種）
  /\brm\s+(-rf|-fr|-r\s+-f|-f\s+-r)\s+\$HOME(\s|$|\/)/i,
  /\brm\s+(-rf|-fr)\s+\/\s*$/,
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
        playAlertSound();
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
      playAlertSound();
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
