#!/usr/bin/env node
/**
 * SessionStart Hook (matcher: startup|clear): 受講生に毎セッションで TIPS をリマインド
 *
 * 仕様:
 *   - stdin に SessionStart の JSON が来る（{source: "startup"|"resume"|"clear"|"compact"} 含む）
 *   - matcher で startup と clear のみ受け付ける（resume と compact は除外）
 *   - JSON 出力で additionalContext を返し、AI が今セッションで意識すべきポイントを inject
 *   - 日替わりローテーションで毎日違う TIPS を表示（マンネリ防止）
 *
 * 参考: https://code.claude.com/docs/ja/hooks#sessionstart
 */

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let source = '';
  try {
    const input = JSON.parse(raw || '{}');
    source = String(input.source || '');
  } catch (_) {
    process.exit(0);
  }

  // matcher で絞っているはずだが、念のため startup/clear 以外は素通し
  if (source !== 'startup' && source !== 'clear') {
    process.exit(0);
  }

  // 受講生向け TIPS（曜日 0=日 で 7 個ローテーション・マンネリ防止）
  const TIPS = [
    // 日曜
    '今週も開発開始！ Context は 30〜40% を超えたら /clear-prep → /clear で整理する習慣を意識しましょう。',
    // 月曜
    'YOU MUST: .env / API キー / service_role キーの値はチャットに出さない。存在確認のみ OK（env-security.md）。',
    // 火曜
    '大きな依頼（◯◯アプリ作って・3 ファイル以上の変更）を受けたら、いきなり実装せず /feature-dev か Plan Mode を提案する。',
    // 水曜
    'コードを書き終えたら review スキルで 2 段階レビュー（feature-dev:code-reviewer 内部レビュー → Codex 別タブで第三者レビュー）。',
    // 木曜
    '納品前は 3 段階レビュー必須: ① @agent-security-auditor で OWASP 観点 → ② review スキル → ③ Codex 独立レビュー。',
    // 金曜
    'Supabase RLS は全テーブル ENABLE 必須・anon/authenticated を分ける・service_role はクライアントに露出させない（12 項目チェックリスト）。',
    // 土曜
    '週末はベストプラクティス棚卸しの好機: error-solutions.md / skill-health.md に追加すべき知見はないか振り返る。',
  ];

  const dayOfWeek = new Date().getDay(); // 0=日, 6=土
  const todayTip = TIPS[dayOfWeek];

  const output = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: `【school-starter プラグイン 今日のリマインダー】\n${todayTip}`,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
});
