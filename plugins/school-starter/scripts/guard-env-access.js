#!/usr/bin/env node
/**
 * PreToolUse Hook (Bash): .env 系シークレットファイルを「読み取る」コマンドをブロック
 *
 * 背景:
 *   - permissions.deny の Read(./.env*) / Bash(* .env*) は .env 直読みを止めるが、
 *     (a) /school-starter:setup を実行する前（install 直後の中間状態）は deny が未配布
 *     (b) deny は ~/.claude/settings.json 依存で、設定が外れると無防備
 *   - この Hook はプラグイン同梱なので setup 未実行でも効き、deny と独立した層を足す。
 *   - sandbox（OS レベル防御）は Windows 受講生に WSL2 を強いるため任意。その代替として
 *     「明白に .env を読むコマンド」をコマンド文字列段階で止める軽量ガード。
 *
 * 設計方針（誤検知を避ける）:
 *   - 「読み取り/表示する動詞 + 実 .env ファイル」の共起のみブロックする。
 *   - `npm run dev` / `next dev` 等は .env をコマンドラインに出さないので素通り（正規の読み込みは妨げない）。
 *   - `.env.example` / `.env.sample` / `.env.template` / `.env.dist` はダミー値なので許可。
 *   - 書き込み（echo >> .env）/ コピー（cp .env.example .env.local）/ 一覧（ls .env*）は対象外。
 *     値の漏洩に直結する「中身を読む」操作だけに絞る。
 *   - inline スクリプト（python -c / node -e 等）は読み取りと書き込み（writeFileSync('.env.local')）を
 *     コマンド文字列から判別できず、正規の .env 生成まで誤爆するため対象外。inline 経由の読み取りは
 *     permissions.deny（Bash(* .env*)）と sandbox に委ねる（Codex レビュー P2 指摘で除外・2026-06-14）。
 *
 * 仕様:
 *   - stdin に PreToolUse の JSON が来る。tool_input.command を検査。
 *   - 該当時は exit 2（blocking・公式仕様）。exit 1 は non-blocking なので使わない。
 *   - JSON パースエラー時は素通し（Hook 自身のバグで作業を止めない）。
 *
 * 参考: https://code.claude.com/docs/en/hooks
 */

// 警告音（check-chained-commands.js と同方針・非同期 detached で exit をブロックしない）
function playAlertSound() {
  try {
    const { spawn } = require('child_process');
    const cmd =
      'afplay /System/Library/Sounds/Basso.aiff 2>/dev/null || ' +
      'powershell.exe -c "[console]::beep(400,500)" 2>/dev/null || ' +
      'paplay /usr/share/sounds/freedesktop/stereo/dialog-warning.oga 2>/dev/null || ' +
      'pw-play /usr/share/sounds/freedesktop/stereo/dialog-warning.oga 2>/dev/null || ' +
      'printf "\\a\\a"';
    const child = spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    // 音の再生失敗は無視（ブロック動作は継続）
  }
}

// コマンド中に「ダミーでない実 .env ファイル」への参照があるか
// .env / .env.local / .env.production などは secret、.env.example などは許可
function hasSecretEnvRef(cmd) {
  const tokens = cmd.match(/\.env(?:\.[A-Za-z0-9_.-]+)?/gi) || [];
  return tokens.some(
    (t) => !/^\.env\.(example|sample|template|dist|defaults?)$/i.test(t)
  );
}

// 「.env の中身を読む/表示する」明白なパターン
const READ_PATTERNS = [
  // 表示・ダンプ系コマンド + .env（cat .env / less .env.local / base64 .env / xxd .env ...）
  /\b(cat|head|tail|tac|nl|less|more|xxd|od|strings|hexdump|base64|bat|view|vi|vim|nano|emacs|cut|paste|column|fold|rev)\s+[^|;&]*\.env\b/i,
  // 検索系 + .env（grep KEY .env / awk ... .env / sed ... .env）
  /\b(grep|egrep|fgrep|rg|ag|ack|awk|sed)\s+[^|;&]*\.env\b/i,
  // シェルへの読み込み（source .env / . ./.env.local）
  /(^|[;&|]|\s)(source|\.)\s+[^\s;&|]*\.env\b/i,
  // 入力リダイレクト（cmd < .env）
  /<\s*[^\s;&|]*\.env\b/i,
];

function detect(cmd) {
  if (!hasSecretEnvRef(cmd)) return false; // .env.example だけ等は許可
  return READ_PATTERNS.some((p) => p.test(cmd));
}

// テストから直接呼べるよう export（Hook 実行時は module.parent が無い）
module.exports = { detect, hasSecretEnvRef };

if (require.main === module) {
  let data = '';
  process.stdin.on('data', (c) => (data += c));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(data);
      const cmd = input.tool_input?.command || '';
      if (detect(cmd)) {
        console.error(
          '[Hook] BLOCKED: .env 系シークレットファイルを読み取るコマンドを検出しました。' +
            '.env / .env.local 等の中身は API キー・認証情報を含むため読み取りを拒否します。' +
            '値の確認が必要なら「ファイルが存在するか」だけを確認する（中身は開かない）か、' +
            'Vercel など本番側の環境変数で管理してください。'
        );
        playAlertSound();
        process.exit(2); // blocking
      }
      process.stdout.write(data);
      process.exit(0);
    } catch (e) {
      // パースエラー等は素通し（過剰防御を避ける）
      console.error(`[Hook] guard-env-access parse error: ${e.message}`);
      process.stdout.write(data);
      process.exit(0);
    }
  });
}
