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
