#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: 受講生発話で危険な依頼パターンを検知して警告 inject
 *
 * 仕様:
 *   - stdin に UserPromptSubmit の JSON が来る（{prompt: "..."} 含む）
 *   - 危険パターン検知時は JSON 出力で additionalContext を返し、AI に強い注意を促す
 *   - ブロックはしない（受講生の意図確認の機会を残す）。exit 0 で続行
 *   - **v1.16.0〜文脈判定強化**: 否定/質問/単純な話題提起での誤検知を抑制し、
 *     「本番 + 削除」のような曖昧キーワードは「対象語（DB/テーブル/データ）」要求 + 否定/質問スキップを併用
 *
 * 参考:
 *   - https://code.claude.com/docs/ja/hooks
 *   - JSON 出力 hookSpecificOutput.additionalContext は AI が次のターンで読むコンテキストに注入される
 */

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let prompt = '';
  try {
    const input = JSON.parse(raw || '{}');
    prompt = String(input.prompt || '').toLowerCase();
  } catch (_) {
    // 入力が壊れていても素通しする（過剰防御を避ける）
    process.exit(0);
  }

  if (!prompt) {
    process.exit(0);
  }

  // ─────────────────────────────────────────────
  // 文脈スキップ判定（誤検知を減らす最初の関門）
  // ─────────────────────────────────────────────

  // 否定文脈: 「削除しない」「消されない」「消えない」「壊れない」「壊さない」
  // ※「壊しちゃ困る」「壊したくない」も否定文脈として扱う
  const NEGATION_PATTERN =
    /(削除|消去|消す|消し|wipe|drop|truncate|destroy|破壊|壊)[^。\n]{0,8}?(しない|されない|されて(い|ま)せん|されちゃ|したくない|したく無い|する前に|しないで|ないで|無いで|ちゃ困る|ちゃダメ|ちゃ駄目|たくない|くない)/u;

  // 質問文脈: 「？」「ですか」「だっけ」「教えて」「どうやって」「どうすれば」「どこ」「いつ」「なぜ」「方法」「やり方」「仕組み」「説明」「解説」「確認したい」「動作を確認」
  const QUESTION_PATTERN =
    /(？|\?|ですか|だっけ|教えて|どうやって|どうすれば|どこ|いつ|なぜ|方法|やり方|仕組み|説明|解説|確認したい|挙動を|動作を|流れを|フロー|レビューして|チェックして|相談)/u;

  // 教材・記録・議論文脈: 「教材」「カリキュラム」「lesson」「メモ」「記録」「スライド」「補講」「振り返り」「議事録」「議論」
  const META_CONTEXT_PATTERN =
    /(教材|カリキュラム|lesson|メモ|記録|スライド|補講|振り返り|議事録|議論|notion|docs?\/|markdown|md ファイル|md に|md へ|md から)/u;

  const isNegation = NEGATION_PATTERN.test(prompt);
  const isQuestion = QUESTION_PATTERN.test(prompt);
  const isMetaContext = META_CONTEXT_PATTERN.test(prompt);

  // ─────────────────────────────────────────────
  // 危険パターン: [正規表現, 警告メッセージ, options]
  //   options.requireTarget: true なら「対象語（DB/テーブル/データ等）」が必須
  //   options.skipOnNegation: true なら否定文脈でスキップ
  //   options.skipOnQuestion: true なら質問文脈でスキップ
  //   options.skipOnMeta: true なら教材・記録文脈でスキップ
  // ─────────────────────────────────────────────

  // 「破壊操作の対象語」: DB/テーブル/データ/レコード/ユーザー/全件/全行/プロジェクト/repo
  const TARGET_OBJECT_PATTERN =
    /(db|データベース|テーブル|table|データ|レコード|record|row|ユーザー|user|users|customer|顧客|アカウント|account|プロジェクト|project|スキーマ|schema|repo|リポジトリ|migration|マイグレーション|全件|全行|全レコード|全部|すべて|全て)/u;

  const DANGER_PATTERNS = [
    {
      regex:
        /(\.env|api[_\s-]*key|secret[_\s-]*key|service[_\s-]*role)[^。\n]*?(見せて|見たい|表示|教えて|出して|読ん|出力|print|show|display|cat)/u,
      message:
        'IMPORTANT: 受講生の発話に「.env / API キー / secret / service_role を表示・出力させる」依頼パターンを検知しました。env-security.md ルール厳守: 値そのものはチャットに出さない（存在確認のみ OK）。受講生に「Vercel Sensitive ON か確認」「ローカル .env.local の存在確認だけにするか」を案内してください。',
      // 「.env が表示されちゃダメ」のような否定文脈はスキップ / 「.env の値を教えて」のような疑問形でも警告は出す（実害が大きいため質問でも警告）
      skipOnNegation: true,
      skipOnQuestion: false,
      skipOnMeta: true,
    },
    {
      regex: /(本番|production|prod)[^。\n]*?(削除|消して|drop|truncate|destroy|消去|wipe)/u,
      message:
        'IMPORTANT: 受講生の発話に「本番 DB / production データを削除する」依頼パターンを検知しました。実行前に必ず受講生本人に「本当に本番か」「バックアップは取ってあるか」「ステージングで先に試したか」を確認し、AskUserQuestion で承認を取ってから動いてください。',
      // 「本番デプロイ前に削除フラグの動作確認」のような会話的発話を弾くため、対象語を必須化 + 否定/質問でスキップ
      requireTarget: true,
      skipOnNegation: true,
      skipOnQuestion: true,
      skipOnMeta: true,
    },
    {
      regex:
        /(drop\s+(database|table|schema)|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$)/u,
      message:
        'IMPORTANT: 破壊的な SQL（DROP/TRUNCATE/全行 DELETE）を要求するパターンを検知しました。実行前に対象テーブル名と影響範囲を受講生に確認し、可能なら WHERE 句を付けるか BEGIN; 〜 ROLLBACK; で先に確認する手順を提案してください。',
      // SQL リテラルが入っている = 実行意図が強いので警告は出す。教材文脈（「DROP TABLE の構文を説明して」）だけスキップ
      skipOnNegation: true,
      skipOnQuestion: false,
      skipOnMeta: true,
    },
    {
      regex: /git\s+push\s+(-f|--force)[^\n]*?(main|master|origin)/u,
      message:
        'IMPORTANT: main/master への force push 依頼を検知しました。settings.json の deny で main/master の force push はブロックされていますが、AI 側でも「force push は履歴改ざんで他人の作業を壊しうる」ことを受講生に説明し、`--force-with-lease` への切り替えを提案してください。',
      skipOnNegation: true,
      skipOnQuestion: false,
      skipOnMeta: true,
    },
    {
      regex: /(npm|yarn|pnpm)\s+publish/u,
      message:
        'IMPORTANT: npm publish 依頼を検知しました。スクール上級コースの教材作りでは npm publish は通常不要です。受講生の意図を確認し、本当に publish したいなら scope（@username/）の設定・package.json の private: false 解除確認・README 整備を案内してください。',
      skipOnNegation: true,
      skipOnQuestion: false,
      skipOnMeta: true,
    },
  ];

  const hits = [];
  for (const pat of DANGER_PATTERNS) {
    if (!pat.regex.test(prompt)) continue;
    if (pat.requireTarget && !TARGET_OBJECT_PATTERN.test(prompt)) continue;
    if (pat.skipOnNegation && isNegation) continue;
    if (pat.skipOnQuestion && isQuestion) continue;
    if (pat.skipOnMeta && isMetaContext) continue;
    hits.push(pat.message);
  }

  if (hits.length === 0) {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext:
        '【school-starter プラグイン UserPromptSubmit Hook が危険パターンを検知】\n\n' +
        hits.map((m, i) => `${i + 1}. ${m}`).join('\n\n'),
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
});
