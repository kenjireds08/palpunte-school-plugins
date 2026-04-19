---
name: project-flow
description: アプリ開発プロジェクトのフェーズ進行をガイドするスキル。/new-project 実行後に自動発動し、現在のフェーズを判定して次のアクションを提案する。「いきなりコードを書かない」哲学を仕組みで担保する。要件定義 → DB設計 → タスク管理 → 実装 の流れを、第三者レビュー（Codex）も挟みながら進める。
---

# project-flow スキル

## 目的

スクール生がアプリ開発を進めるとき、**いきなりコードを書かせない**。
要件定義・DB設計・タスク管理を整えてから初めて実装に入る、という流れを Claude Code が自動でガイドする。

## 哲学（ちーけん流）

1. **要件定義 → DB設計 → タスク管理を揃えてから初めてコードを書く**
2. **節目で第三者（Codex）にレビューしてもらう**（要件定義 + DB設計、実装計画）
3. **プロジェクトステータスはシンプルに**（フェーズごとのチェックリスト + 詳細はタスクバックログへリンク）
4. **大きなタスクは個別の md ファイルに分離**してリンクで繋ぐ

## いつ発動するか

以下のいずれかの状況で自動発動する:

- `/new-project` コマンドが実行された直後
- ユーザーが「次は何をすればいい？」「次のステップは？」「これでいい？」と聞いてきたとき
- `docs/000_PROJECT_STATUS.md` が存在するプロジェクトで作業しているとき
- ユーザーが「実装を始めたい」と言ったが、まだ要件定義・DB設計・タスクバックログが揃っていないとき（「まず準備しましょう」と止める）

## 2つのモード

`/new-project` 実行時に「受注確定 or 相談段階」を確認し、以下のいずれかのモードに入る。

### モードA：受注獲得モード（相談段階）

目的: クライアントから案件を受注すること。

```
Phase A1: ヒアリング
  → docs/003_client_request.md にクライアント情報・要望を記録
  → 完了したら次へ提案

Phase A1.5: 要件の軽量定義（interview --light）
  → 「モックアップを精度高く作るために、interviewスキルで要件をざっくり固めますか？」と提案
  → ユーザーがOKなら `/interview --light` を案内
  → docs/spec-light-[機能名].md が生成される
  → 完了したら次へ提案
  → スキップも可（小規模・スピード重視の案件向け）

Phase A2: モックアップ作成
  → 「モックアップを作りますか？」と提案
  → docs/spec-light-*.md があれば、それを読み込んで作成
  → mockups/pattern-a/ にHTMLで作成（複数案も可）
  → 完了したら次へ提案

Phase A3: 見積もりドラフト
  → 「見積もりドラフトを作りますか？」と提案
  → docs/006_estimate.md にmdで作成
  → 完了したら次へ提案

Phase A4: Google Docs化（コピペ方式）
  → 「クライアント提示用に Google Docs にしましょう。手順を案内します」と伝える
  → 以下の3ステップを表示:

      📝 Google Docs への貼り付け手順

      【初回のみ：マークダウン設定を有効化】
      1. https://docs.google.com/ で新規ドキュメントを作成
      2. メニューバーから ツール → 設定
      3. 「全般」タブの「マークダウンを有効にする」にチェック
      4. OK を押す
      ※ この設定は1回やれば次回以降不要です

      【見積もりmdをGoogle Docsに貼り付け】
      1. docs/006_estimate.md をエディタで開いて全選択 → コピー（Cmd+A → Cmd+C）
      2. Google Docs のドキュメント本文を右クリック
      3. メニューから「マークダウンから貼り付け」を選択
      4. 見出し・太字・箇条書きが自動でフォーマットされます

      ⚠ 普通の Cmd+V や「貼り付け」だとマークダウン記法のままになります。
        必ず「マークダウンから貼り付け」を使ってください。

      【完了したら】
      Google Docs 右上の「共有」ボタンからリンクを取得して
      クライアントに送ってください。

Phase A5: 商談・受注
  → 「商談頑張ってください！受注できたら教えてください」
  → 受注確定したら → 「モードB（本実装準備）に切り替えますか？」と提案
```

### モードB：本実装準備モード（受注確定）

目的: 実装に入る前に、要件定義・DB設計・タスク管理を完璧に整えること。

```
Phase B1: 資料収集
  → 「打ち合わせ録音・議事録・クライアント資料はありますか？」と確認
  → あれば docs/002_meeting_notes.md に整理
  → 議事録の文字起こしも一緒に貼り付けてもらう

Phase B2: 要件定義の作り込み（interview --full）
  → 「`/interview --full` で要件定義を詰めましょう」と提案
  → docs/spec-light-*.md があれば自動で読み込み、不足分のみ追加ヒアリング
  → 商談での追加要望・制約も組み込む
  → 9観点でヒアリング: ユーザー体験 / データ / 技術 / エッジケース / 優先順位 / コスト / 法令 / LLMリスク / 性能
  → docs/spec-[機能名].md に出力（実装前提セクション含む）
  → 既存の docs/001_requirements.md にも要件サマリを番号付きで記録
  → ユーザーが「これで固まった」と言うまで壁打ちを繰り返す

Phase B3: DB設計
  → Claude が「DBテーブル構成を提案します」
  → docs/004_database_schema.md にテーブル定義（カラム・型・関係性・RLSポリシー方針）
  → 完了したらレビュー提案へ

Phase B4: 【チェックポイント①】Codex第三者レビュー
  → 「要件定義とDB設計をCodexで第三者レビューしますか？強く推奨します」
  → ユーザーがOKしたら、Codex CLI 起動の手順を案内（後述）
  → レビュー結果を貼ってもらい、指摘があれば修正ループ

Phase B5: プロジェクトステータス作成
  → docs/000_PROJECT_STATUS.md にフェーズごとのシンプルなチェックリスト
  → 各項目は docs/005_task_backlog.md または docs/tasks/{name}.md へのリンク付き
  → 詳細は書かない（リンク先で見る）

Phase B6: タスクバックログ作成
  → docs/005_task_backlog.md に各タスクの実装詳細
  → 大きなタスク（3日以上かかりそう）は docs/tasks/{task_name}.md に分離
  → プロジェクトステータスのチェックリストとリンク

Phase B7: 【チェックポイント②】Codex第三者レビュー
  → 「実装計画（ステータス + バックログ）をCodexで第三者レビューしますか？」
  → 同様にレビュー → 修正ループ

Phase B8: 実装開始準備完了
  → 「準備完了です！Phase 1のタスクから実装を始めましょう」
  → 以降は docs/000_PROJECT_STATUS.md を見ながら、リンク先の詳細を読みつつ実装
```

## フェーズ判定ロジック（明示ステータスベース）

**重要**: ファイルの「存在」だけで判定しない。`/new-project` は最初から空テンプレを作るため、存在判定では誤検知する。

代わりに **`docs/000_PROJECT_STATUS.md` の冒頭に書かれたステータスメタデータを読む**。

### ステータスメタデータの形式

`docs/000_PROJECT_STATUS.md` の最上部には必ず以下のYAMLフロントマターが入る:

```markdown
---
mode: undecided | order_won | consultation | personal
current_phase: phase_0 | phase_a1 | phase_a15 | phase_a2 | phase_a3 | phase_a4 | phase_a5 | phase_b1 | phase_b2 | phase_b3 | phase_b4 | phase_b5 | phase_b6 | phase_b7 | phase_b8
phase_status: in_progress | completed
last_updated: YYYY-MM-DD
---

# プロジェクトステータス
...
```

### 判定の手順

1. `docs/000_PROJECT_STATUS.md` を読む
2. フロントマターから `mode` と `current_phase` と `phase_status` を取得
3. 下表に従って次のアクションを決定

| mode | current_phase | phase_status | 次のアクション |
|------|--------------|------------|--------------|
| undecided | phase_0 | * | 「案件の状態を教えてください（受注確定 / 相談段階 / 個人）」を AskUserQuestion で確認 → ステータス更新 |
| consultation | phase_a1 | in_progress | クライアント情報・要望のヒアリング継続。完了したら `phase_status: completed` に更新して提案 |
| consultation | phase_a1 | completed | 「`/interview --light` で要件をざっくり固めますか？モックアップの精度が上がります（スピード重視ならスキップしてphase_a2へ）」を提案 |
| consultation | phase_a15 | in_progress | `/interview --light` 実行中。docs/spec-light-*.md の生成を待つ |
| consultation | phase_a15 | completed | 「モックアップを作りますか？docs/spec-light-*.md を読み込んで作成します」を提案。OKなら `current_phase: phase_a2` に更新 |
| consultation | phase_a2 | in_progress | mockups/ で HTML 作成継続（spec-light-*.md があれば参照） |
| consultation | phase_a2 | completed | 「見積もりドラフトを作りますか？」を提案 |
| consultation | phase_a3 | completed | 「Google Docs に貼り付ける手順を案内します（マークダウンから貼り付け方式）」を提案 |
| consultation | phase_a4 | completed | 「商談頑張ってください！受注できたら教えてください。受注確定したら mode を order_won に切り替えます」 |
| order_won | phase_b1 | in_progress | 議事録・資料の収集継続 |
| order_won | phase_b1 | completed | 「`/interview --full` で要件定義を詰めましょう（spec-light-*.md があれば自動で読み込み、不足分のみ追加ヒアリングします）」 |
| order_won | phase_b2 | completed | 「DB設計を提案します」 |
| order_won | phase_b3 | completed | 「Codex CLI で要件定義とDB設計を第三者レビューしますか？強く推奨します」 |
| order_won | phase_b4 | completed | 「プロジェクトステータスをフェーズ別チェックリスト形式で作成します」 |
| order_won | phase_b5 | completed | 「タスクバックログを作成します」 |
| order_won | phase_b6 | completed | 「実装計画を Codex CLI で第三者レビューしますか？」 |
| order_won | phase_b7 | completed | 「準備完了！実装を開始しましょう。Phase 1 のタスクから進めます」 |
| personal | phase_b2 | * | 受注獲得モードを飛ばして要件定義から開始（以降は order_won と同じフロー） |

### ステータス更新ルール（Claudeが守ること）

- **必ず1フェーズに1回だけ更新する**: フェーズ作業を始めたら `in_progress` に、ユーザーが「OK次へ」と承認したら `completed` に
- **更新は Edit ツールで `docs/000_PROJECT_STATUS.md` のフロントマター部分のみ書き換え**
- **`last_updated` も毎回更新**
- **勝手に2フェーズ進めない**: 各フェーズの完了はユーザーの明示承認を待つ
- **モードを切り替えるとき**（相談段階→受注確定など）は、`mode` と `current_phase` を同時に書き換える

## 提案の仕方（重要）

各フェーズ完了時は、必ず以下のフォーマットで提案する:

```
✅ [現在のフェーズ名] が完了しました。

次のステップ: [次のフェーズ名]
内容: [何をするか1-2行で説明]

[このステップに進んでよろしいですか？]
```

ユーザーの返事を待ってから次のアクションを実行する。**勝手に進めない**。

## Codex CLI 第三者レビューの手順（定型）

Phase B4 と Phase B7 で使う定型プロンプト。Claudeがそのまま表示する:

```
─────────────────────────────────────────────
🔍 Codex CLI による第三者レビュー手順

実装前のミスを防ぐため、別のAI（Codex）に内容をチェックしてもらいます。

【手順】
1. 新しいターミナルを開く（VS Codeなら ⌘+@ で別ターミナル）
2. プロジェクトフォルダに移動:
     cd {現在のプロジェクトフォルダ}
3. Codex CLI を起動:
     codex
4. 起動したら、以下のファイルをチャット欄にドラッグ＆ドロップ:
     {レビュー対象ファイル1}
     {レビュー対象ファイル2}
5. 次のプロンプトをコピペして送信:

「これらのファイル（{ファイル名}）をレビューしてください。
以下の観点でチェックして指摘してください:
- 矛盾点
- 抜け漏れ
- 改善できる点
- セキュリティ上の懸念
- 実装難易度の見積もり
日本語で簡潔に箇条書きで答えてください。」

6. Codex の回答をコピーして、ここ（Claude Code）に貼り付けてください。
   私が修正案を反映します。

【Codex CLI が無い場合】
インストール方法: https://github.com/openai/codex
※ OpenAI無料アカウントでも試せます
※ /school-starter:setup を再実行すると案内が出ます
─────────────────────────────────────────────
```

## プロジェクトステータスのフォーマット（Phase B5で作成する形）

```markdown
# プロジェクトステータス

**最終更新**: YYYY-MM-DD
**現在のフェーズ**: Phase 1

---

## Phase 1: 基盤構築
- [ ] Next.js 初期セットアップ → [詳細](005_task_backlog.md#phase1-1)
- [ ] Supabase 接続 → [詳細](005_task_backlog.md#phase1-2)
- [ ] 認証実装 → [詳細](tasks/auth_implementation.md)

## Phase 2: コア機能
- [ ] 予約一覧画面 → [詳細](005_task_backlog.md#phase2-1)
- [ ] 予約作成画面 → [詳細](005_task_backlog.md#phase2-2)
...

## Phase 3: 管理機能
- [ ] 管理者ダッシュボード → [詳細](tasks/admin_dashboard.md)
...

## Phase 4: デプロイ
- [ ] Vercel デプロイ → [詳細](005_task_backlog.md#phase4-1)
- [ ] 本番環境変数設定 → [詳細](005_task_backlog.md#phase4-2)
```

**ポイント**:
- 各項目は1行で簡潔に
- 詳細は必ずリンク先（005_task_backlog.md または tasks/{name}.md）に書く
- ステータスは [ ] / [x] で管理
- フェーズが進んだら「現在のフェーズ」を更新

## タスクバックログのフォーマット（Phase B6で作成する形）

```markdown
# タスクバックログ

## phase1-1: Next.js 初期セットアップ
**目的**: プロジェクトの土台を作る
**手順**:
1. `npx create-next-app@latest` で雛形作成
2. TypeScript / Tailwind / App Router を選択
3. shadcn/ui をインストール
**完了条件**: `npm run dev` で起動確認

## phase1-2: Supabase 接続
**目的**: DB接続の確立
**手順**:
1. Supabase プロジェクト作成
2. `@supabase/supabase-js` インストール
3. `lib/supabase/client.ts` と `server.ts` を作成
4. `.env.local` に URL と ANON_KEY を設定
**完了条件**: クライアントから DB に接続できる

...
```

**ポイント**:
- ステータス側の項目とアンカー（#phase1-1）で対応
- 大きなタスクは別ファイル `tasks/{name}.md` に分離
- 「目的」「手順」「完了条件」の3点セットで書く

## 実装中も常に意識すること

- ユーザーが「実装を始めたい」と言ったとき、上記のフェーズが揃っていなければ「先にこれを準備しましょう」と止める
- 実装中も、毎タスク完了時に `docs/000_PROJECT_STATUS.md` の該当チェックを `[x]` に更新する
- 新しい要件が出てきたら、`docs/001_requirements.md` を更新してから実装する（後付けで仕様を変えない）
