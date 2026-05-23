# palpunte-school-plugins BACKLOG

プラグイン更新候補を集約するチケット管理ファイル。

**運用ルール**:
- プラグイン作業を開始するときは必ずこのファイルを開く
- 各項目は「発見元 / 重要度 / 内容 / 検討事項」で記録
- リリース時は該当項目を `palpunte-school` 側の `docs/plugin-changelog.md` に転記して BACKLOG からは「完了」マーク or 削除
- 重要度: 🔴 最重要（次リリース必須）/ 🟠 高（次リリース推奨）/ 🟡 中（時間あれば）/ 🟢 低（future）

---

## 次リリース候補（v1.19+・教材作成と並行で追加していく）

> ⚠️ **v1.18.0 は sandbox 全回任意化で使用済み（2026-05-21）**。下記の 🔴0 等の本文中「v1.18 で」という記述は **v1.19 以降**に読み替えること。

### 🔴 0. rules / skills / commands 全体の「コピー → 直参照」全面再設計（v1.17.1 で statusline のみ対応済み・残り全部 v1.18 で）

- **発見元**: 2026-05-15 v1.17.0 学生環境観察で statusline.py の同期罠が顕在化（v1.17.1 で statusline のみ即対応済み）
- **問題**: setup スクリプトが `~/.claude/rules/`・`~/.claude/skills/`・`~/.claude/commands/`・`~/.claude/agents/`・`~/.claude/docs/` にプラグイン配下からファイルを**コピー**する設計。`/plugin update` で最新化されてもコピー先は古いまま → 受講生は setup 再実行しないと最新版が反映されない**全体罠**
- **影響範囲**: statusline 以外の全コピー対象（rules / skills / commands / agents / docs）。第1回開講後に受講生が「新しいスキルが発火しない」「新しいルールが効かない」が頻発する地雷
- **対応案（v1.17.1 で statusline のみ実施済み・横展開）**:
  - rules / skills / commands / agents / docs も settings.json or CLAUDE.md でプラグイン配下を直接参照する方式に統一
  - `~/.claude/rules/` 配下: Claude Code が rules を自動ロードする仕組みを直接プラグイン配下にする方法を要調査
  - skills / commands: プラグイン名前空間で発火するため設計変更不要の可能性（要確認）
  - agents: `~/.claude/agents/security-auditor.md` → `~/.claude/plugins/marketplaces/...` 経由参照
- **設計調査が必要**: Claude Code が `~/.claude/rules/` や `~/.claude/agents/` 配下しか自動ロードしない仕様だと、直参照が技術的に不可能 → その場合は post-update Hook の代替案（symlink / setup の自動再実行案内 等）を検討
- **工数見積もり**: 設計調査 30 分 + 実装 1-2h（v1.18 MINOR）
- **位置づけ**: 教材作成が一段落した後（5/18 開講後）に v1.18 で全面対応推奨

### 🔴 1. カリキュラムスコープ vs 案件スコープの分離問題

- **発見元**: lesson-09-notes 2026-05-14（PWA 実機テスト）
- **問題**: 学生 Claude が `001_requirements.md` / `006_estimate.md` / `007_task_backlog.md` だけ参照するため、「カリキュラム上の必須スコープ」が見えない。第9回 PWA 化で学生 Claude が「PWA はスコープ外・別見積もり ¥98,000」と判定 → カリキュラム本体ではこの回必須なのに齟齬発生
- **対応案**:
  - (a) task_backlog テンプレに「カリキュラム必須 / 案件見積もり」二層フラグ
  - (b) project-flow スキルに「現在第N回・次のカリキュラムスコープ」ガイド機能
  - (c) CLAUDE.md テンプレに「現在のカリキュラム回・次回スコープ」マーカー
  - (d) advanced-course.md の回ごとサマリーを受講生環境にも配置（`docs/curriculum-scope.md` 等）
- **影響範囲**: 第1回〜第10回すべて横断

### 🟡 2. UserPromptSubmit Hook の設計レビュー文脈スキップ

- **発見元**: lesson-09-notes 2026-05-14（Phase B6 実装サマリー貼り付け時に誤検知）
- **問題**: 受講生が学生 Claude にレビュー結果サマリーを共有する場面で `secret` / `service_role` 等のキーワードが含まれ Hook が誤検知発火
- **対応案**: `skipOnReviewSummary` ロジック追加（マークダウン code block + 「実装」「修正」「レビュー」「サマリー」「Codex」「security-auditor」等の共起語チェック）
- **回帰テスト**: `scripts/warn-dangerous-prompts.test.js` に「設計レビュー文脈で発火しない」ケース追加

### 🟡 3. 並走モードの「依頼後の並列作業禁止」ルール明文化

- **発見元**: lesson-09-notes 2026-05-14（PWA リサイズ依頼で発覚）+ lesson-10-notes 2026-05-15（学生 Claude フィードバック）
- **問題**: 受講生に作業を依頼した直後に Claude が並行して別作業（git 確認 / docs 編集等）を進めるとチャット欄が流れて受講生が「自分がやることがあったのに見落とす」リスク
- **対応案**: `rules/development.md` か `claude-md-template.md` に「受講生に作業を依頼したら返答を待つまで次の処理に進まない」を明文化
- **備考**: Hook 化は難しい（Claude の自走判断が必要）ので CLAUDE.md ルールベース

### 🟡 4. claude-md スキル対話化

- **発見元**: 引き継ぎメモ（学生 Claude フィードバック 75 点評価から）
- **問題**: claude-md スキルが「ガイド表示型」で、受講生が「で、自分の CLAUDE.md に何を入れる？」を能動的に決められない
- **対応案**: 対話モードを追加し、受講生の失敗モードを質問形式で引き出して 12 ルールから提案する形式

### 🟡 5. rules/development.md 圧縮（200 行制限維持）

- **発見元**: Codex 第二レビュー指摘（v1.12.0 リリース時）
- **問題**: Rule 1-4 を rules/development.md に常時ロード配置したことで CLAUDE.md 200 行制限哲学に逆行
- **対応案**: development.md を 71 行 → 50 行以下に圧縮 + 詳細は別 doc に分離

### 🟡 6. task-backlog DoD スキップ表を責務基準に単純化

- **発見元**: 学生 Claude フィードバック（v1.16.0 リリース後）
- **問題**: DoD スキップ判断表がタスク規模別で分かりにくい
- **対応案**: 「責務基準（実装系 / 設計系 / ドキュメント系）」に再整理

### 🟡 7. Claude 役割マトリクス集約（v1.17.0 学生 Claude フィードバック）

- **発見元**: lesson-10-notes 2026-05-15（学生 Claude プラグイン評価 90/100 点）
- **問題**: CLAUDE.md / env-security.md / 個別スキル内で「Claude が触れない箇所」（.env 操作 / git push / npm publish 等）が点在しているため、受講生視点で「ここは別ターミナル / これは Claude」を毎回伝えるコスト
- **対応案**: 「Claude 役割マトリクス」を 1 か所に集約（プロジェクト初期化時に CLAUDE.md に必ず展開されるテンプレ化）

### 🟡 8. レビュー軽量化判断マトリクス追加（v1.17.0 学生 Claude フィードバック）

- **発見元**: lesson-10-notes 2026-05-15（T-60 規約テンプレで Codex / security-auditor スキップした暗黙判断）
- **問題**: 3 段階レビュー（feature-dev → Codex → security-auditor）の「軽量化判断」基準が暗黙。受講生に説明しにくい（「なんで今回はスキップしていいの？」）
- **対応案**: review スキル冒頭に「軽量化判断マトリクス」を追加:
  - コード変更（ロジック変更含む） → 3 段階フル
  - 静的テキスト / 設定ファイル微修正 → code-reviewer 1 巡のみ
  - インフラ設定変更（CSP / 環境変数等） → security-auditor + 実機検証
- **教材化必須**: 第10回授業でメタ的に解説

### 🟡 9. learn 自動提案強化（v1.17.0 学生 Claude フィードバック）

- **発見元**: lesson-10-notes 2026-05-15（PWA cookie 罠を直接 frontend-patterns.md に書き込み /learn を呼ばなかった事例）
- **問題**: 重大な学び発見時に Claude が /learn を呼ばずに直接ファイル編集してしまう → 信頼度評価が漏れる
- **対応案**: learn スキルの発火トリガーに「ホットフィックスを書いた時 / 信頼度 2 級の知見を発見した時」を追加 + 「先に /learn 通すか確認」を Claude に促す仕組み（rules/development.md に明文化）

### 🟡 10. リハーサル版 vs 本番案件 早期判定（v1.17.0 学生 Claude フィードバック）

- **発見元**: lesson-10-notes 2026-05-15（第10回終盤に「リハーサル版だから T-63 スキップ」が出てきた）
- **問題**: 開始時に「リハーサル版 / 本番案件」を判定していれば T-61 / T-63 の粒度設定が変わっていた
- **対応案**: /interview-light / /interview-full の最初の質問に「これは Hobby / 受託 / リハーサル / 自社プロダクト どれですか？」を追加（既存「Hobby or work?」に「リハーサル」軸を追加）

### 🟢 11. .env.local 同期 Hook 化

- **発見元**: lesson-08 周辺の議論
- **問題**: .env.example と .env.local の同期忘れが頻発（4 箇所同期ルール v1.16.0 で対応したが Hook 化したい）
- **対応案**: PreToolUse Hook で .env.example 編集時に .env.local 同期警告

### 🟢 12. git commit 前 DoD Hook 化

- **発見元**: lesson-08 周辺の議論
- **問題**: DoD チェックを忘れて commit するケースが散発
- **対応案**: pre-commit Hook で task_backlog の該当タスクの DoD 項目を表示

### 🟢 13. ai-driven-development-flow.md 二層化

- **発見元**: v1.16.0 リリース後の運用検証
- **問題**: マスタープレイブックが詳細版のみで受講生が圧倒される
- **対応案**: サマリー版（1 ページ）+ 詳細版（200 行）の二層構成

### 🟢 14. 教材ネタ抽出スキル `/extract-teaching-materials`（v1.17.0 学生 Claude フィードバック・最大 ROI 候補）

- **発見元**: lesson-10-notes 2026-05-15（学生 Claude フィードバックで「最大の発展余地」と評価）
- **問題**: セッション完了時の「教材ネタ抽出 → 未着手バックログ化」が手動依存。取りこぼし頻発
- **対応案**: `/school-starter:extract-teaching-materials` のような新スキル:
  - セッションログをスキャンして「ホットフィックス」「Codex 指摘」「learn 追記」を抽出
  - カリキュラムどの回に位置づけるかのマッピング提案
  - 未着手バックログを `~/Obsidian/Projects/ai-school/lecture-materials.md` に追記
- **位置づけ**: v1.18 以降の目玉機能候補

> ✅ **#15〜#21 は v1.20.0（2026-05-23）でリリース済み**。詳細は `palpunte-school/docs/plugin-changelog.md` の v1.20.0 エントリ参照。以下は記録として残置（次回 dry-run で効果検証する）。

### 🟠 15. interview-light 完了時の「次のステップ」に DESIGN.md が出ない（v1.19.0 バトン未接続）✅ v1.20.0

- **発見元**: lesson-02-notes 2026-05-23（`lesson-test2` dry-run）
- **問題**: v1.19.0 で project-flow に Phase A1.7（DESIGN.md 先行）を入れたが、`/interview-light` 完了 → spec-light 生成直後の「次のステップ」が **①HTMLモックアップ ②見積もり ③仕様修正** の古い3択を出し、**DESIGN.md 作成を Recommended で案内しない**。interview-light 完了 → project-flow（phase_a15 completed → phase_a17 提案）の phase バトンが繋がっていない
- **救い（事故は防げている）**: モック選択時に Phase A2 のガード（DESIGN.md 未作成ならデザインへ誘導）が効き、参考デザイン4択 → DESIGN.md に入れた。**ガードは機能・next-step 提案だけが漏れ**
- **対応案**:
  - (a) interview-light スキルの完了出力に「① デザイン設計図（DESIGN.md）を先に作る（Recommended）」を3択の先頭に追加
  - (b) または spec-light 生成直後に 000_PROJECT_STATUS.md フロントマターを `phase_a15 completed` に確実に更新させ、project-flow の判定テーブル（phase_a15 completed → DESIGN.md 提案）を発火させる
- **重要度**: 🟠 高（v1.19.0 の意図を完成させる補完パッチ・次リリース推奨）

### 🟡 16. spec-light ファイル名に連番が付かない

- **発見元**: lesson-02-notes 2026-05-08（L110）/ 2026-05-23 で未解決を再確認
- **問題**: `docs/spec-light-[機能名].md` が連番なしで生成され、`000_` 〜 `003_` の連番ファイルとソート順が崩れる。本来 `004_spec-light-[機能名].md`（docs/ の空き番号採番）が自然
- **対応案**: interview-light スキル / interview SKILL.md の出力ファイル名指定を `NNN_spec-light-[機能名].md`（空き番号を Claude が採番）に変更
- **重要度**: 🟡 中（軽微だが #15 と同じ interview-light 改修でまとめて対応可）

### 🟡 17. interview-light Q2「利用者デバイス」選択肢の主語明示

- **発見元**: lesson-02-notes 2026-05-23（ちーけん指摘）
- **問題**: Q2 の3択（「スマホ中心（幅広い年齢）」等）が主語抜けで「誰が？アプリ自体が？」と迷う。質問の真意は「予約する会員の主な利用デバイス → モックをスマホファーストで作るか決める」。選択肢は Claude がその場で動的生成（SKILL.md には観点のみ）
- **対応案**: SKILL.md Q2 に「label に主語を入れる（例: 会員はスマホで予約）+ description に効果を明示（→ スマホファーストで作る）」のガイドを追記
- **重要度**: 🟡 中（#15/#16 と同じ interview-light 改修でまとめて対応可）

### 🔴 18. DESIGN.md 確定後にモック作成プロンプトを待たず一気に突っ走る（ステップ5が飛ぶ）

- **発見元**: lesson-02-notes 2026-05-23（`lesson-test2` dry-run）
- **問題**: DESIGN.md 作成プロンプトを入れると Claude が DESIGN.md 配置 → **そのままモック作成まで連続実行**し、コピペシート ステップ5「モック作成プロンプト」（予約完了画面・時間/コース選択・複数ページ予約フローの指定入り）を貼る隙が消える。結果、コース選択・予約完了画面が抜けたモックになる
- **原因**: project-flow の「勝手に進めない・ユーザーの返事を待つ」原則が Phase A1.7（DESIGN.md）→ Phase A2（モック）の境目で守られない。DESIGN.md プロンプトに「モックはまだ作らないで」の制止がないと自然に繋げてしまう
- **対応案**:
  - (A 即効・コピペシート) ステップ4 の DESIGN.md プロンプト末尾に「まずは DESIGN.md だけ作ってください。モックアップはこの後で別途お願いします」を追記（`palpunte-school-html/cheatsheet/lesson-02.html`）
  - (B 本質・プラグイン) project-flow の phase_a17 completed → phase_a2 提案で**必ず一旦停止**し、モック作成プロンプト入力を待つガードを明文化（SKILL.md の Phase A1.7/A2 に「DESIGN.md 完成後はモック着手前に必ずユーザー入力を待つ」を追記）
- **重要度**: 🔴 最重要（本番受講生がステップ5を貼れず仕様欠落モックで商談に出すリスク・#15 と同じ DESIGN.md フロー周りの仕上げ）

### 🟠 19. 見積もりドラフトに月額インフラ実費が入らない（実案件で抜ける）

- **発見元**: lesson-02-notes 2026-05-23（`lesson-test2` dry-run）/ 前回 L320-342 の論点が再現
- **問題**: project-flow Phase A3 が生成する `006_estimate.md` のランニングコスト欄が「Supabase / Vercel は無料枠スタート可」のみ。**実案件では Supabase Pro $25 + Vercel Pro $20 ≈ 月$45（約7,000円）が発生**（無料は7日 pause / Hobby は商用規約違反）。「無料枠スタート可」だけだとクライアントに誤解を与える
- **対応案**: 見積もりテンプレ（project-flow Phase A3 の出力 or references の見積もりひな型）に「初期費用 + 月額インフラ実費（実費 or 管理代行込み）+ 月額保守」の3層を明示。前回確立した「インフラ管理体制2パターン（クライアント名義 / 講師管理代行）」と保守費設計を組み込む
- **教材連動**: スクール題材は無料プラン前提のままでよいが、見積もり生成時に「※実案件ではインフラ実費を計上」の注釈を必ず出す
- **重要度**: 🟠 高（受講生が実案件で使う見積もりの実用性に直結）

### 🟢 20. docs/ 番号体系の一貫性（spec-light 連番なし + estimate が 006 で飛ぶ）

- **発見元**: lesson-02-notes 2026-05-23（ちーけん指摘）
- **問題**: spec-light は連番なし（#16）なのに estimate は `006_estimate.md` で 004/005 を飛ばす。受講生に「なぜこの番号?」を生む
- **対応案**: #16（spec-light 連番化）とセットで、相談段階フェーズの docs/ 採番ルールを整理（spec-light=004 / estimate=005 等、相談段階内で連番にするか / 本実装フェーズ用の番号予約をやめるか）
- **重要度**: 🟢 低（#16 と一括検討）

### 🔴 21. 見積書の提示方法を「HTML→PDF」デフォルトに変更（ちーけん方針確定 2026-05-23）

- **発見元**: lesson-02-notes 2026-05-23（`lesson-test2` dry-run・ちーけん決定）
- **背景**: 「見積もりを HTML で出力して」依頼で `006_estimate_for_client.html` を生成 → PDF 化したら御見積書として完成度が極めて高い（発行日・見積番号・宛名・発行者・金額大表示・A/B案カード・内訳テーブル・3ページA4印刷レイアウト）。**Google Docs マークダウン貼り付けより圧倒的に体裁が良く、html-output-strategy.md の「人間が最後に開く完成物=HTML」方針とも合致**
- **方針確定**: 見積書のクライアント提示は **HTML→PDF をデフォルト**に。Google Docs（共同編集・コメント用）は補足で残す
- **改修対象（一括）**:
  - (a) project-flow SKILL.md Phase A4 を「HTML 清書→PDF（印刷ダイアログでPDF保存）」デフォルトに書き換え。**ちーけん指定の提案フロー（2026-05-23）**: 見積もりはまず従来どおり `docs/006_estimate.md` にまとめる → 受講生が内容を確認 → Claude が「クライアントに渡せるよう HTML 御見積書として出力し、PDF でダウンロードできるようにしますか？」と自動提案。Google Docs マークダウン貼り付け手順は「相手と擦り合わせたい場合の代替」として残す
  - (b) コピペシート `palpunte-school-html/cheatsheet/lesson-02.html` の見積もり提示ステップ（ステップ9）を HTML→PDF に → **2026-05-23 先行修正済み**（カンペ `instructor/lesson-02-script.html` の流れ説明・タイムテーブル・リハ手順も同日修正済み。座学 `lessons/02-mockup/04-estimate.html` は提示方法に触れていないため変更不要）
  - (c) カリキュラム `advanced-course.md` 第2回の見積もりパートを追従
  - (d) 見積もり HTML テンプレに「発行者の連絡先を埋める」「実案件はインフラ実費を計上（#19）」の注意書きを組み込む
- **重要度**: 🔴 最重要（ちーけん方針確定・第2回ゴールの成果物品質に直結）

### 🟠 22. interview スキルの二重ファイル運用を1ファイル化（根治）

- **発見元**: v1.20.0 内部レビュー（2026-05-23）
- **問題**: interview スキルが `skills/interview/SKILL.md`（プラグイン直結）と `references/skills/interview/SKILL.md`（setup が `~/.claude/skills/interview/` にコピーする配備版）の **2ファイルで重複管理**されている。更新を片方に入れ忘れると乖離する（実際 v1.19→v1.20 で乖離が発生し、v1.20.0 で union 同期して応急対応済み）。project-flow は references コピーが無くプラグイン直結のみで動いているため、interview だけ二重化している
- **対応案**:
  - (A) setup.md の「1-3. interviewスキル配置」をやめ、`/interview-light` `/interview-full` ラッパーが**プラグイン直結スキル（`school-starter:interview`）を直接呼ぶ**ように変更 → references/skills/interview を削除して1ファイル化
  - (B) または逆に、プラグイン直結 `skills/interview` を廃し references コピー方式に一本化（ただしプラグインスキルとしての自然言語発火は失う）
  - **要検証**: `/interview-light` 実行時に実際どちらのファイルが解決されているか（プラグイン直結 vs ~/.claude コピー）を lesson-test3 で特定してから方式決定
- **重要度**: 🟠 高（次回 dry-run 前に方式を決めて根治したい・乖離の再発防止）

---

## 🔴 v1.20.1 候補（v1.20.0 dry-run `lesson-test4` で「効かなかった」改修・2026-05-23）

v1.20.0 を実機適用（update+reload+setup）して第2回を通したら、SKILL.md に書いただけの改修が**実際には守られない**ことが判明。仕組みでの担保が必要。

### 🔴 23. #18 停止ガードが効かない + A1.7 カタログ3案提示の必須化（DESIGN.md→モック突っ走りが v1.20.0 でも再現・最重要）

> **2026-05-23 ちーけん品質評価で格上げ**: カタログ参照 DESIGN.md ＞ AskQuestion 単独 DESIGN.md（カタログ参照版の方が明確に良いデザイン）。よって **A1.7 のカタログ3案提示は「絶対に通す」= デザイン品質の源泉**。#23（停止ガード）+ #24（interview からデザイン質問を外す）を一体で実装し、「interview はデザインを聞かない → A1.7 で必ずカタログ3案 → DESIGN.md → 停止 → モック」の一直線フローを**仕組みで担保**する。


- **発見元**: lesson-test4 dry-run（2026-05-23・v1.20.0 適用済み環境）
- **問題**: project-flow SKILL.md に「🛑 DESIGN.md 生成後は必ず一旦停止」と明記した（#18）のに、Claude は DESIGN.md 生成 → モック作成プロンプト入力を待たず**一気にモックまで突っ走った**。ボタン遷移しない商談に出せないモックが生成された（lesson-test2 と同じ事故が再現）
- **原因仮説**: project-flow のフェーズ判定（phase_a15→phase_a17→停止）が**そもそも駆動していない**。Phase A1.7「3案案内しますか？」自動提案も出ず、Claude は project-flow を参照せず「定石どおりモックアップ」と独自判断。DESIGN.md は `~/.claude/CLAUDE.md` の UI ルール由来で作られ、停止ガードを通っていない
- **核心の学び**: **SKILL.md にプロンプトで「止まれ」と書くだけでは Claude は止まらない**。仕組みで担保する必要がある
- **対応案（要検討・どれか or 併用）**:
  - (A) **Hook で担保**: `DESIGN.md` を Write した直後の PostToolUse で「モック着手前にユーザーのモック作成プロンプトを待て」を inject（最も確実）
  - (B) **AskUserQuestion で強制ゲート**: DESIGN.md 完成後にモック着手を必ず AskUserQuestion（「モック作成プロンプトを送る/このまま進める」）で一旦止める
  - (C) **コピペシート運用の徹底**: DESIGN.md プロンプトに「モックはまだ作らないで」を明記（`lesson-02.html` は対応済み）→ ただし運用依存で漏れる
- **重要度**: 🔴 最重要（第2回の成果物品質に直結・2回連続再現）

### 🟠 16-再. spec-light 連番化が指示文だけでは効かない（#16 再オープン）

- **発見元**: lesson-test4（2026-05-23）
- **問題**: v1.20.0 で SKILL.md を `docs/NNN_spec-light-[機能名].md` 指示に変えたが、実機では `docs/spec-light-予約管理.md`（**連番なし**）で生成された。指示文が弱く Claude が従わない
- **対応案**: テンプレ冒頭で「**必ず docs/ の空き番号を先頭に付ける（例 004_）。連番なしは禁止**」を強い命令調に / 出力直前に「番号を確認してから書く」ステップを明示 / または #23 と同じく仕組み（Hook で命名チェック）も検討
- **重要度**: 🟠 高

### 🟠 15-再. #15 next-step の DESIGN.md 3択が出ない（半分しか効かない）

- **発見元**: lesson-test4（2026-05-23）
- **問題**: spec-light 完了後の next-step で DESIGN.md（Recommended 先頭）3択が出ず、モック作成に流れた。#23 と同根（project-flow フェーズ駆動せず）
- **対応案**: interview-light 完了出力で **明示的に AskUserQuestion で3択（①DESIGN.md ②見積もり ③仕様修正）を出す**よう強制（SKILL.md 記述に頼らない）
- **重要度**: 🟠 高（#23 とセットで「フェーズ進行を仕組みで担保」として一括検討）

### 🟠 24. interview-light からデザイン方向性の質問を外し、A1.7 カタログ提示に一本化（ちーけん決定 2026-05-23）

- **発見元**: lesson-test4 dry-run（2026-05-23）
- **問題**: interview-light がデザイン方向性（黒×ゴールド等）を聞く（v1.19 で Q5「デザインの方向性・参考サイト」+ Q6制約「デザインの方向性」）と、Claude が「もう方向性は決まった」と判断し、**project-flow Phase A1.7 のカタログ3案提示をスキップ**してしまう（interview の質問と A1.7 の役割が重複）
- **ちーけん決定**: **interview-light からデザイン質問を外す** → デザインは A1.7（カタログ3案提示 or 全面ダーク直接指定）に一本化する
- **対応案**:
  - interview SKILL.md（skills/ + references/ 両方＝同一化済み）の **--light の Q5 から「デザインの方向性・参考サイト」を削除**、**Q6制約から「デザインの方向性」を削除**。spec-light テンプレの「デザイン方向性」欄も削除 or A1.7 で埋める前提に
  - **--full の「デザイン要件」観点（v1.10.0〜）は残す**（受注後・第3回 DESIGN.md ブラッシュアップ素材で、相談段階の A1.7 とは時系列が別・衝突しない）※full も外すべきか要ちーけん最終確認
  - #23（A1.7 を仕組みで必ず通す）とセットで実装 = 「interview でデザインを聞かない → A1.7 で必ずカタログ3案 → DESIGN.md → 停止 → モック」の一直線フローが完成する
- **重要度**: 🟠 高（#23 と一体・v1.20.1 で一括）

### 🟠 25. DESIGN.md のルート配置を Hook の allowlist で許可する（規約衝突・ちーけん決定 2026-05-23）

- **発見元**: lesson-test4 dry-run（2026-05-23）
- **問題（バグではなく規約衝突）**: `check-md-creation.js` の allowlist（`README|CLAUDE|AGENTS|CONTRIBUTING|000_PROJECT_STATUS`）に **DESIGN.md が無い**ため、ルート直下の `DESIGN.md` 新規作成がブロックされ `docs/DESIGN.md` に逃げる。Hook の「雑多な .md をルートに散らかさせない」制御は正しいが、**DESIGN.md は標準ドキュメントなので allowlist に入れるべきだった漏れ**
- **実害**: paths（`**/DESIGN.md`）の自動ロードは docs/ でもマッチするが、**frontend-workflow.md L33「プロジェクトルートに DESIGN.md があれば UI 生成時に必ず読み込む」がルート決め打ち** + design-md-template も「ルートに配置」前提 → `docs/DESIGN.md` だと UI 実装時に参照されないリスク
- **ちーけん決定**: **ルート許可**（docs/ 統一ではなくルート配置を許可する）
- **対応**: `scripts/check-md-creation.js` の `ALLOWED_NAMES` を `/(README|CLAUDE|AGENTS|CONTRIBUTING|000_PROJECT_STATUS|DESIGN)\.md$/` に変更（`design-tokens.md` も frontend-workflow paths にあるので合わせて許可するか検討）。回帰防止のため check-md-creation のテストがあれば1ケース追加
- **重要度**: 🟠 高（DESIGN.md 参照はデザイン品質に直結・v1.20.1）

### 🟡 21-追補. `/new-project` 直後の次ステップ案内に Google Docs が残存

- **発見元**: lesson-test4（2026-05-23）
- **問題**: `references/commands/new-project.md:440` に「4. Google Docs に変換してクライアントへ提示」が残存（#21 で project-flow は HTML→PDF に直したが new-project.md を直し忘れ）。DESIGN.md ステップも無い
- **対応案**: new-project.md の次ステップ案内を「① 軽量ヒアリング → ② **DESIGN.md** → ③ モック → ④ 見積もり → ⑤ **HTML 御見積書を PDF 化** 」に修正
- **重要度**: 🟡 中（案内文の不整合・実害は軽いが #21 の伝播漏れ）

---

## 検討中（future・v1.18 以降）

- 受講生環境への advanced-course.md ダイジェスト配置（カリキュラムスコープ問題の根本対策）
- pre-delivery-check の対話履歴 export 機能（納品物として残せる形式）
- school-starter プラグインのテレメトリ機能（どのスキルが使われているか集約）

---

## リリース済み（参考・詳細は palpunte-school 側 `docs/plugin-changelog.md`）

- v1.18.0 (2026-05-21): sandbox を全回任意化（setup 完走メッセージのステップ 8→7・sandbox を末尾の【参考】ブロックへ・出力厳守ルール 8→7 項目・第1回差し替え動画収録方針を反映）
- v1.17.4 (2026-05-17): setup 出力の手順脱落防止【出力厳守ルール】+ check の sandbox 誤判定修正 + 第1回フローから check 除外
- v1.17.3 (2026-05-17): claude-plugins-official マーケット未登録の誤記修正 + hook の Node.js fail-silent 化 + Node.js 導入ステップ追加
- v1.17.2 (2026-05-15): statusline.py の実行ビット穴を `git update-index --chmod=+x` で永続化（三部作完結）
- v1.17.1 (2026-05-15): statusline.py をプラグイン直参照に切替・`/plugin update` 同期罠を構造的に解消（statusline のみ・rules/skills/commands は v1.18 で）
- v1.17.0 (2026-05-15): statusline.py Pattern 5 Fine Bar 昇格・reset 時刻表示対応
- v1.16.1 (2026-05-14): Hook 偽陰性修正 + 回帰テスト基盤 + Node 18+ 要件明記
- v1.16.0 (2026-05-14): 地雷塞ぎ 6 連発 + マスタープレイブック新設
- v1.15.1 (2026-05-13): Supabase Data API デフォルト変更対応
- v1.15.0 (2026-05-13): check-md-creation Hook と plansDirectory 推奨値の自己矛盾解消
