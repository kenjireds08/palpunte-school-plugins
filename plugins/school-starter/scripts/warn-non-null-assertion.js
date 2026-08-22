#!/usr/bin/env node
/**
 * 非nullアサーション（`foo!.bar` 等）の混入を検知して問い返す Hook
 * （PostToolUse / Write・Edit・MultiEdit、対象は .ts / .tsx のみ）。
 *
 * 背景（2026-08-22・外部エンジニアの助言 + 実案件での実害）:
 *   `!` は「ここは絶対に値が入っている」とコンパイラに宣言するだけの書き方で、
 *   型チェック・ビルド・テスト全件・レビュー2巡をすり抜けて、実機操作で初めて
 *   実行時エラーになった実害がある（信頼度4＝4回再発）。しかも AI はこの書き方を多用する。
 *
 * 2層構造での位置づけ:
 *   - この Hook = 全プロジェクトに即日効く「網」。書いた瞬間に Claude へ問い返す
 *   - ESLint の no-non-null-assertion（quality-gate スキルで導入）= 導入済み
 *     プロジェクトでの決定論的ゲート。Hook をすり抜けても lint と CI が止める
 *
 * 誤検知を出さないことを最優先にする（毎回鳴る Hook は読み流されて無いより悪い）:
 *   - `!==` / `!=` / `!!foo` / `!foo`（論理否定）では発火しない
 *   - 文字列リテラル・コメント内はざっくり除去してから判定する
 *   - 見逃し（false negative）は許容する。最終防衛は lint / CI 側の担当
 *
 * inject 方式: flow-gate.js と同じ PostToolUse の {"decision":"block","reason":"..."}。
 *   ファイルは書かれたままなのでエラーにはならず、Claude に修正を促すだけ。
 */

// 文字列リテラルとコメントを大まかに除去する（完全なパーサではない・誤検知抑制用）
function stripLiteralsAndComments(src) {
  return src
    // ブロックコメント
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // 行コメント
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // 文字列（テンプレートリテラルは ${} 内のコードごと落ちる＝見逃し許容）
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

// 非nullアサーションらしきパターン:
//   識別子・) ・] の直後の `!` が、さらに . [ ) , ; ` as ` のいずれかに続く形。
//   `a !== b`（! の前が空白）・`a!=b` `a!==b`（! の後が =）・`!!x` `!x`（! の前が演算子/行頭）は一致しない。
const NON_NULL_RE = /[A-Za-z0-9_$)\]]!(?:\.|\[|\)|,|;|\s+as\s)/;

function detect(filePath, texts) {
  if (!/\.(ts|tsx|mts|cts)$/i.test(filePath)) return false;
  // 型定義ファイルは対象外（アサーションではなく宣言の世界）
  if (/\.d\.ts$/i.test(filePath)) return false;
  return texts.some((t) => t && NON_NULL_RE.test(stripLiteralsAndComments(t)));
}

let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(d);
    const tool = input.tool_name;
    if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit') process.exit(0);

    const ti = input.tool_input || {};
    const filePath = ti.file_path || '';

    // 検査対象は「新しく書き込まれた中身」だけ（既存コードの読み直しでは鳴らさない）
    let texts = [];
    if (tool === 'Write') texts = [ti.content];
    else if (tool === 'Edit') texts = [ti.new_string];
    else if (tool === 'MultiEdit') texts = (ti.edits || []).map((e) => e && e.new_string);

    if (detect(filePath, texts)) {
      process.stdout.write(
        JSON.stringify({
          decision: 'block',
          reason:
            '⚠️ いま書いたコードに、非nullアサーション（`値!` ＝「ここは絶対に値が入っている」という宣言）らしき記述があります。\n' +
            'この書き方は型チェック・ビルド・テストをすべてすり抜け、実際に画面を操作したときに初めてエラーで落ちた実害があります。\n' +
            'まず「この値が未取得のとき、画面はどう見えるか」を自問してください。そのうえで:\n' +
            '- `!== null` の分岐（読み込み中の表示を出す）か、`?.` と `??` のフォールバック（例: `user?.name ?? \'—\'`）に書き直す\n' +
            '- 本当に `!` が必要な特殊ケースなら、理由をコメントで残してユーザーに一言伝える\n' +
            'このプロジェクトに ESLint の `@typescript-eslint/no-non-null-assertion` が未導入なら、' +
            'quality-gate スキルで品質ゲート（lint ルール + CI）の導入を提案してください。'
        })
      );
    }
    process.exit(0);
  } catch (_e) {
    // JSON パース失敗等は素通り（他の Hook に副作用を出さない）
    process.exit(0);
  }
});
