#!/usr/bin/env node
/**
 * project-flow の「節目」を決定論的に担保する Hook（PostToolUse / Write）。
 *
 * 背景（lesson-test4 dry-run 2026-05-24 で確立）:
 *   project-flow SKILL.md に「DESIGN.md 後は停止」「次は DESIGN.md を提案」等を
 *   文章で書いても、フェーズ進行が駆動しないと Claude は守らず突っ走る。
 *   そこで「ファイル生成」という決定論的イベントを検知し、Claude に
 *   「次はこう問いかけて、ユーザー入力を待て」を inject して節目を強制する。
 *
 * 方針（ちーけん 2026-05-24 確定）:
 *   - 節目では AskUserQuestion（選択式）を出さない。
 *     選択式だとコピペシートの長文プロンプトを貼れない / 実案件で使えない。
 *   - 代わりに「次は◯◯です。どうしますか？」と自由入力で問いかけて待たせる。
 *   - 「コピペシートから貼り付けて」等の内輪向け指示文は inject しない。
 *
 * 検知対象（matcher は Write のみ。Edit/MultiEdit の手直しでは発火させない）:
 *   - DESIGN.md          → モック着手前に必ず停止し、構成を問いかけて待つ
 *   - *spec-light*.md    → モックの前に DESIGN.md を先に作るよう誘導（+ 連番チェック）
 *   - *estimate*.md      → HTML 御見積書→PDF 化を問いかけて待つ（実案件はインフラ実費）
 *     （estimate_for_client.html は清書後なので対象外＝.md のみ）
 *   - docs/plans/*.md    → Codex レビュー後に「判断用 HTML 要約」を作らせる（v1.25.0〜）
 *
 * inject 方式: 終了 0 + stdout に {"decision":"block","reason":"..."}（PostToolUse 公式サポート）。
 *   reason が Claude にフィードバックされ、次の行動を促す（ツールは実行済みなので
 *   ファイルは書かれたまま。エラー表示にはならない）。
 */

let d = '';
process.stdin.on('data', (c) => (d += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(d);

    // Write 以外（Edit / MultiEdit の手直し等）は素通り
    if (input.tool_name !== 'Write') {
      process.exit(0);
    }

    const p = input.tool_input?.file_path || '';
    const base = p.split(/[\\/]/).pop() || '';
    const dirs = p.split(/[\\/]/).slice(0, -1);

    let reason = null;

    // ① DESIGN.md → モック着手前の停止ガード（#18/#23・最重要）
    if (/^DESIGN\.md$/i.test(base)) {
      reason =
        '🛑 DESIGN.md ができました。ここで必ず一旦停止してください。' +
        '続けてモックアップを作ってはいけません（DESIGN.md → モックの無言連続実行は禁止）。\n' +
        'ユーザーに「DESIGN.md が完成しました。次はこれをもとにモックアップを作成します。' +
        'どんな構成にしますか？（どの画面を・どんなフローで作るか教えてください）」と問いかけ、' +
        'ユーザーがモック作成の指示を送ってくるまで待ってください。AskUserQuestion（選択式）は使わず、自由入力で待つこと。';
    }
    // ② spec-light → モックの前に DESIGN.md を先に作る（#15）+ 連番チェック（#16）
    else if (/spec-light/i.test(base) && /\.md$/i.test(base)) {
      reason =
        '要件の軽量仕様（spec-light）ができました。モックアップを作る前に、' +
        '必ずデザインの設計図（DESIGN.md）を先に作ります。\n' +
        'ユーザーに「モックアップの前に、まずデザインの設計図（DESIGN.md）を作りましょう。' +
        'awesome デザインカタログから、今回のアプリに合うデザイン案を3つ出しましょうか？」と問いかけ、' +
        '返答を待ってください。いきなりモックアップに進まないこと。';
      // 連番チェック（#16・先頭が NNN_ でなければリネームを促す）
      if (!/^\d{3}_/.test(base)) {
        reason +=
          '\n⚠️ このファイル名（' + base + '）は連番が付いていません。' +
          'docs/ の空き番号（例 004_）を先頭に付けてリネームしてください（連番なしはソート順が崩れるため禁止）。';
      }
    }
    // ③ estimate.md → HTML 御見積書→PDF 化を問いかけ（#21）+ 実案件インフラ実費（#19）
    else if (/estimate/i.test(base) && /\.md$/i.test(base) && !/_for_client\./i.test(base)) {
      reason =
        '見積もりドラフトができました。\n' +
        'ユーザーに「クライアントに渡せるよう、HTML 御見積書として清書して、' +
        'ブラウザで PDF として保存できるようにしますか？」と問いかけ、返答を待ってください。\n' +
        '実案件（production 運用）の場合は、ランニングコストを3層【① 初期費用 / ② 月額インフラ実費 / ③ 月額保守】で明示し、' +
        'Supabase Pro $25 + Vercel Pro $20 ≈ 月$45 の実費計上を確認すること（「無料枠スタート可」だけだと誤解を与える）。';
    }
    // ④ docs/plans/*.md → Codex レビュー後に「判断用 HTML 要約」を作る（v1.25.0〜）
    //    背景: 実装プランの .md は分量も専門用語も多く、非エンジニアは読み切れずに
    //    「読めないから承認する」が起きる。技術的妥当性は Codex が見るので、
    //    人間は「これは求めているものか / いつやるか」だけを判断できればよい。
    //    → 同じ内容を 1 画面の HTML に要約させ、判断の入口をそちらに移す。
    else if (
      /\.md$/i.test(base) &&
      dirs.includes('plans') &&
      !dirs.includes('archive') &&
      !/^(README|CLAUDE|AGENTS)\.md$/i.test(base)
    ) {
      const root = process.env.CLAUDE_PLUGIN_ROOT || '';
      reason =
        '実装プラン（' + base + '）ができました。このあとの順番を必ず守ってください。\n' +
        '1. まず Codex に読ませてレビューしてもらうよう、ユーザーに依頼文をコピペ用に案内する\n' +
        '2. Codex が approve したら、**実装に入る前に**同じ内容の「判断用 HTML 要約」を\n' +
        '   同じフォルダに <同じファイル名>.html として作る\n' +
        '3. ブラウザで開いて見せ、ユーザーの判断を待つ（ここで初めて実装に入ってよい）\n\n' +
        '判断用 HTML のルール:\n' +
        '- 1 画面で読み終わる分量にする。プランの .md をそのまま HTML にしない\n' +
        '- 専門用語・ファイル名・ライブラリ名を書かない。画面や機能の言葉で書く\n' +
        '- 中身は「決めてほしいこと（最大3つ）／何が変わるか／触る範囲／リスクと戻し方」\n' +
        '- 「承認しますか？」ではなく「①②③のどれにしますか？」の形にする\n' +
        '- ダークモード対応は付けない（説明資料はライト固定）\n' +
        (root
          ? '- ひな形が ' + root + '/references/plan-summary-template.html にあります。\n' +
            '  必ず読んでから作ってください（CSS はそのまま使い、{{ }} だけ差し替える）\n'
          : '') +
        '\n技術的な詳細は .md 側に残したままでよく、HTML から落として構いません。' +
        '技術的な妥当性は Codex が担当し、ユーザーは「これは自分が求めているものか」を判断する担当です。';
    }

    if (reason) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: reason }));
    }
    process.exit(0);
  } catch (_e) {
    // JSON パース失敗等は素通り（他の Hook に副作用を出さない）
    process.exit(0);
  }
});
