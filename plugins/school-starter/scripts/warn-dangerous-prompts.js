#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: 受講生発話で危険な依頼パターンを検知して警告 inject
 *
 * 仕様:
 *   - stdin に UserPromptSubmit の JSON が来る（{prompt: "..."} 含む）
 *   - 危険パターン検知時は JSON 出力で additionalContext を返し、AI に強い注意を促す
 *   - ブロックはしない（受講生の意図確認の機会を残す）。exit 0 で続行
 *   - 検知は誤検知優先で広めに取る（AI 側のルールで実害は防げる前提）
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

  // 危険パターン: [正規表現, 警告メッセージ]
  const DANGER_PATTERNS = [
    [
      /(\.env|api[_\s-]*key|secret[_\s-]*key|service[_\s-]*role)[^。\n]*?(見せて|見たい|表示|教えて|出して|読ん|出力|print|show|display|cat)/u,
      'IMPORTANT: 受講生の発話に「.env / API キー / secret / service_role を表示・出力させる」依頼パターンを検知しました。env-security.md ルール厳守: 値そのものはチャットに出さない（存在確認のみ OK）。受講生に「Vercel Sensitive ON か確認」「ローカル .env.local の存在確認だけにするか」を案内してください。',
    ],
    [
      /(本番|production|prod)[^。\n]*?(削除|消して|drop|truncate|destroy|消去|wipe)/u,
      'IMPORTANT: 受講生の発話に「本番 DB / production データを削除する」依頼パターンを検知しました。実行前に必ず受講生本人に「本当に本番か」「バックアップは取ってあるか」「ステージングで先に試したか」を確認し、AskUserQuestion で承認を取ってから動いてください。',
    ],
    [
      /(drop\s+(database|table|schema)|truncate\s+table|delete\s+from\s+\w+\s*;?\s*$)/u,
      'IMPORTANT: 破壊的な SQL（DROP/TRUNCATE/全行 DELETE）を要求するパターンを検知しました。実行前に対象テーブル名と影響範囲を受講生に確認し、可能なら WHERE 句を付けるか BEGIN; 〜 ROLLBACK; で先に確認する手順を提案してください。',
    ],
    [
      /git\s+push\s+(-f|--force)[^\n]*?(main|master|origin)/u,
      'IMPORTANT: main/master への force push 依頼を検知しました。settings.json の deny で main/master の force push はブロックされていますが、AI 側でも「force push は履歴改ざんで他人の作業を壊しうる」ことを受講生に説明し、`--force-with-lease` への切り替えを提案してください。',
    ],
    [
      /(npm|yarn|pnpm)\s+publish/u,
      'IMPORTANT: npm publish 依頼を検知しました。スクール上級コースの教材作りでは npm publish は通常不要です。受講生の意図を確認し、本当に publish したいなら scope（@username/）の設定・package.json の private: false 解除確認・README 整備を案内してください。',
    ],
  ];

  const hits = [];
  for (const [re, msg] of DANGER_PATTERNS) {
    if (re.test(prompt)) {
      hits.push(msg);
    }
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
