---
description: 新規アプリ開発プロジェクトの初期セットアップ。基礎構造を作成し、project-flowスキルへ引き継ぐ
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Glob
---

新規アプリ開発プロジェクトを開始する。フォルダを作って Claude Code を起動した直後に、このコマンドを実行する。

このコマンドは「基礎構造の作成」と「案件状態の確認」までを担当する。
それ以降のフェーズ進行は **project-flow スキル** が自動的に引き継ぐ。

**配置されるファイルの種類（受講生への案内・重要）**:

| ファイル | 種別 | 編集対象か |
|---------|------|----------|
| `CLAUDE.md` | **ヒアリング結果から生成**（AI が案件情報を反映） | ✅ 案件固有情報なので受講生が編集 |
| `docs/000_PROJECT_STATUS.md` | **テンプレートから生成**（進捗を記録） | ✅ 進捗に合わせて更新 |
| `.gitignore` / `.claudeignore` | **テンプレートからコピー配置**（内容は共通） | ⚠ 既に存在すれば上書きしない |
| `.claude/rules/README.md` | **グローバル `~/.claude/rules/` の同内容を複製配置** | プロジェクト側の追加ルールだけ編集（グローバル版は触らない） |

受講生には「グローバル `~/.claude/rules/` とプロジェクト `.claude/rules/` は同じ内容の2箇所配置で、プロジェクト側が優先される」ことを明示する（「自動生成」と呼ぶと「AI が賢く案件に合わせて作った」と誤解されるため、**配置方法を具体的に伝える**）。

---

## Step 1: 環境チェック（軽量）

以下のコマンドで Codex CLI が入っているか確認:

```bash
which codex || echo "Codex CLI: 未インストール"
```

未インストールの場合は警告を表示:

```
⚠ Codex CLI が見つかりません。

以下のコマンドで再セットアップしてください:
  /school-starter:setup

Codex CLI は要件定義・DB設計・実装計画の第三者レビューに使います。
このまま続けることもできますが、第三者レビュー機能はスキップされます。
```

ユーザーに「続けますか？」と AskUserQuestion で確認。

## Step 2: 既存プロジェクトの確認

`/new-project` の初期化対象は「`CLAUDE.md` または `docs/000_PROJECT_STATUS.md` がまだ無いフォルダ」。
`package.json` だけがある状態（例: `create-next-app` 直後）は **既存コードあり初期化モード** として続行する。

### 判定ロジック

カレントディレクトリに以下のいずれかが存在するかチェック:
- `CLAUDE.md`
- `docs/000_PROJECT_STATUS.md`

**どちらかが存在する場合（= 既に初期化済み）**:
「このフォルダは既に `/new-project` で初期化済みのようです。
project-flow スキルが現在のフェーズを判定して次のアクションを提案します。
新しい案件を始めたい場合は別フォルダで `/new-project` を実行してください。」
と伝えて終了。

**どちらも無い場合**: 次のステップへ進む。
- `package.json` などが既に存在する場合は **既存コードあり初期化モード** として動作:
  - `.gitignore` が既にあれば**上書きしない**（既存内容を尊重）
  - `.claudeignore` が既にあれば上書きしない
  - その他の生成ファイルは通常通り作成
  - Step 5 のメッセージで「既存のコードベースに追加する形で初期化しました」と一言添える

## Step 3: 案件情報のヒアリング

AskUserQuestion で以下を順番に聞く（一度に全部ではなく、対話形式で）:

### 質問1: 案件の状態
```
question: この案件の現在の状況を教えてください
options:
  - label: "受注確定"
    description: クライアントから正式に依頼を受け、契約済み。本実装の準備に入る
  - label: "相談段階"
    description: まだ相談・見積もり段階。受注獲得を目指してモックアップや見積もりを作る
  - label: "自分用・学習用"
    description: 個人プロジェクトや学習用。商談フェーズはスキップして直接実装準備へ
```

### 質問2: 案件の概要（自由記述）
```
「どんなアプリを作る案件ですか？分かっている範囲で教えてください。
（業種・主な機能・ターゲットユーザーなど。曖昧でもOK）」
```

ユーザーの自由回答を受ける。

### 質問3: クライアント名（任意）
```
「クライアント名（または案件名）を教えてください。
※ 個人情報なので適宜「○○様」「A社」などに置き換えてもOK。
※ 不要なら「なし」と答えてください」
```

### 質問4: 技術スタック
```
question: 技術スタックは標準でいいですか？
options:
  - label: "標準（推奨）"
    description: Next.js + Supabase + Tailwind + shadcn/ui + Vercel
  - label: "カスタマイズしたい"
    description: 別のスタックを使いたい（後で詳細を聞きます）
```

「カスタマイズ」を選んだら、自由記述で何を変えたいか聞く。

## Step 4: 基礎構造の作成

ヒアリング内容をもとに、以下のファイル・ディレクトリを作成:

### 4-1. ルートファイル

**注意**: `.gitignore` と `.claudeignore` は **既にファイルが存在する場合は上書きしない**。
既存コードあり初期化モード（例: `create-next-app` 後）では、雛形が既に正しい内容を持っているため。
`CLAUDE.md` も既存があればスキップ（普通は Step 2 で弾かれるが念のため）。

#### `CLAUDE.md`（プロジェクト基本情報）
ヒアリング内容から生成:

```markdown
# CLAUDE.md - {案件名}

## 概要

{ヒアリングした案件概要を3-5行で}

## プロジェクト情報

| 項目 | 内容 |
|------|------|
| クライアント | {クライアント名 or "個人プロジェクト"} |
| 案件状態 | {受注確定 / 相談段階 / 自分用} |
| 開始日 | {今日の日付 YYYY-MM-DD} |
| 担当 | （あなたの名前） |

## 技術スタック

{選択したスタックを記載}

## 重要な決定事項

（プロジェクトが進むにつれて追記）

## 開発フロー

このプロジェクトは **project-flow スキル** によってフェーズ管理されます。
「次は何をすればいい？」と聞けば、現在のフェーズに応じた次のアクションを提案します。

哲学:
- いきなりコードを書かない
- 要件定義 → DB設計 → タスク管理 を整えてから実装開始
- 節目で Codex による第三者レビューを入れる
```

#### `.claudeignore`
```
.env*
*.pem
*.key
credentials/
.DS_Store
```

#### `.gitignore`
```
# dependencies
node_modules
.pnp
.pnp.js

# testing
coverage

# next.js
.next/
out/
build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# local env files
.env*
!.env.example

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

### 4-2. docs/ ディレクトリと初期ファイル

`docs/` ディレクトリを作成し、以下のファイルを配置:

#### `docs/000_PROJECT_STATUS.md`（初期版）

**重要**: フロントマターは project-flow スキルがフェーズ判定に使う。Step 3 のヒアリング結果に応じて `mode` を書き換える:
- 「受注確定」を選んだ → `mode: order_won`、`current_phase: phase_b1`
- 「相談段階」を選んだ → `mode: consultation`、`current_phase: phase_a1`
- 「自分用・学習用」を選んだ → `mode: personal`、`current_phase: phase_b2`
- 何も選ばれていない場合 → `mode: undecided`、`current_phase: phase_0`

```markdown
---
mode: {undecided | order_won | consultation | personal}
current_phase: {phase_0 | phase_a1 | phase_b1 | phase_b2}
phase_status: in_progress
last_updated: {YYYY-MM-DD}
---

# プロジェクトステータス

**現在のフェーズ**: （Claudeがフロントマターから読み取り、人間向けに表示）

---

## 進捗

- [x] プロジェクト初期化（`/new-project` 実行）
- [ ] 案件状態に応じた次のステップ

---

## 次のアクション

project-flow スキルが現在のフェーズを判定して提案します。
「次は何をすればいい？」と聞いてください。

---

## フェーズ管理について

このファイルの冒頭にあるフロントマター（`mode` / `current_phase` / `phase_status`）は
project-flow スキルが読み取って使います。手動で書き換える必要はありません。
Claude Code がフェーズ進行のたびに自動更新します。
```

#### `docs/001_requirements.md`（空の雛形）
```markdown
# 要件定義

**最終更新**: {YYYY-MM-DD}
**ステータス**: 作成中

---

## 概要

{Step 3 で聞いた案件概要をここに入れる}

## 機能要件

（ヒアリングを進めながら追記）

## 非機能要件

（パフォーマンス・セキュリティ・運用要件など）

## 制約事項

（予算・スケジュール・使用技術の制約など）
```

#### `docs/002_meeting_notes.md`（議事録置き場）
```markdown
# 議事録

打ち合わせ内容や録音文字起こしをここに記録する。

---

## YYYY-MM-DD 第N回打ち合わせ

**参加者**:
**場所**:
**議題**:

### 内容

（議事録本文）

### 決定事項

（決まったこと）

### 宿題

（持ち帰り事項）
```

#### `docs/003_client_request.md`（クライアント一次情報）
```markdown
# クライアント一次情報

クライアントからもらった最初の相談メッセージ・要望を原文で残す場所。

---

## 最初の相談内容

（クライアントからのメッセージや、ちーけんさんへの説明をそのまま貼り付け）

## クライアント情報

- 名前/会社名:
- 業種:
- 連絡手段:
- 予算感:
- 希望納期:
```

### 4-3. `.claude/rules/` の配置（案件特化ルール置き場）

**案件固有のビジネスロジック・コーディング規約を置く場所**を用意する。グローバル（`~/.claude/rules/`）とは分離。最初は README だけ配置し、受講生が必要になったときに `.md` ファイルを追加する運用。

1. `.claude/rules/` ディレクトリを作成
2. `${CLAUDE_PLUGIN_ROOT}/references/docs/project-rules-readme.md` を Read し、`.claude/rules/README.md` として Write

README には以下が含まれる:
- `.claude/rules/` の用途（案件特化ルール置き場）
- `paths:` フロントマターの書き方（Context 消費を節約しながら特定ファイルに絞れる）
- ファイル名の目安（booking-rules.md / client-style.md / compliance.md 等）
- 優先度（`.claude/rules/` > `~/.claude/rules/` > プラグイン配布ルール）
- 公式リファレンスへのリンク

この README は**受講生が後から読んで自分でルールを書き出す際のガイド**として機能する。最初は `.md` ルールファイルは配置しない（上級機能なので必要になるまで空のまま）。

### 4-4. .env の案内（重要）

Claude Code は `.env*` ファイルを作成できないため、以下を表示:

```
─────────────────────────────────────────────
🔐 .env.local の作成について

セキュリティ上の理由で、Claude Code は .env ファイルを作成できません。
別ターミナルで以下を実行してください:

cat > .env.local << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# その他のサービス（必要に応じて追加）
EOF

cat > .env.example << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
EOF

※ .env.local には実際の値を入れる（git には上がらない）
※ .env.example はダミー値（git に上げる）
─────────────────────────────────────────────
```

## Step 5: project-flow スキルへ引き継ぎ

すべての基礎構造を作成したら、以下のメッセージを表示:

```
✅ プロジェクト初期化が完了しました！

【作成したファイル】
- CLAUDE.md（プロジェクト基本情報）
- .claudeignore / .gitignore
- docs/000_PROJECT_STATUS.md
- docs/001_requirements.md
- docs/002_meeting_notes.md
- docs/003_client_request.md

【次のステップ】
案件状態: {選択した状態}

{案件状態に応じた次の提案を表示}
```

### 案件状態別の次の提案

#### 「受注確定」を選んだ場合:
```
受注確定とのことなので、本実装の準備モードで進めます。

次は要件定義を固めていきましょう。

質問1: 打ち合わせの録音や議事録、クライアントからの資料はありますか？
       あれば docs/002_meeting_notes.md に貼り付けてください。

質問2: 無い場合は、私から詳細をヒアリングしていきます。
       「ヒアリング開始」と言ってください。
```

#### 「相談段階」を選んだ場合:
```
相談段階とのことなので、受注獲得モードで進めます。

次のステップ:
1. クライアント情報・要望を docs/003_client_request.md にまとめる
2. モックアップを HTML で作成（クライアント提示用）
3. 見積もりドラフトを作成
4. Google Docs に変換してクライアントへ提示

まずは、クライアントから受け取った最初のメッセージや会話内容を
そのまま貼り付けてください。docs/003_client_request.md にまとめます。
```

#### 「自分用・学習用」を選んだ場合:
```
個人プロジェクトとして進めます。商談フェーズはスキップして、
直接「要件定義 → DB設計 → 実装準備」の流れに入ります。

次のステップ:
作りたいアプリの詳細を教えてください。私が要件定義を docs/001_requirements.md に
まとめていきます。

何でも構いません。「こんな機能が欲しい」「こんなユーザーが使う」など、
思いついたことから教えてください。
```

## 完了

以降は project-flow スキルが自動発動して、フェーズに応じた提案を続ける。
ユーザーは「次は何すればいい？」と聞けば、いつでも現在地と次のアクションが分かる。
