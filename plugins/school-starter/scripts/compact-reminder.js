#!/usr/bin/env node
/**
 * PreCompact Hook (matcher: manual): /compact 実行前に /clear-prep の使い方をリマインド
 *
 * 仕様:
 *   - stdin に PreCompact の JSON が来る（{trigger: "manual"|"auto"} 含む）
 *   - matcher で manual のみ受け付ける（auto は素通し・自動圧縮を妨げない）
 *   - JSON 出力で additionalContext を返し、AI に「/clear-prep の方が安全」を伝える
 *   - ブロックはしない（受講生が compact したいなら自由にできる）
 *
 * 参考: https://code.claude.com/docs/ja/hooks#precompact
 */

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let trigger = '';
  try {
    const input = JSON.parse(raw || '{}');
    trigger = String(input.trigger || '');
  } catch (_) {
    process.exit(0);
  }

  if (trigger !== 'manual') {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      additionalContext:
        '【school-starter プラグイン PreCompact リマインダー】\n' +
        '受講生が /compact を手動実行しようとしています。/compact は会話を要約して続けますが、要約過程で重要な決定事項が落ちる場合があります。\n\n' +
        'もし「重要なフェーズの区切り（要件定義完了・DB設計完了・第N回レッスン終了など）」での整理であれば、`/compact` より `/clear-prep → /clear` の方が安全です:\n' +
        '  1. /clear-prep で「今回やったこと・変えたファイル・次にやること」を構造化された引き継ぎメモとして出力\n' +
        '  2. そのメモを 000_PROJECT_STATUS.md / task-backlog.md に保存\n' +
        '  3. /clear で完全リセット\n' +
        '  4. 次セッションで引き継ぎメモを読み込ませて続行\n\n' +
        'この場面が「軽い圧縮で続けたいだけ」なら /compact のままで OK。受講生に一度確認してから進めてください。',
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
});
