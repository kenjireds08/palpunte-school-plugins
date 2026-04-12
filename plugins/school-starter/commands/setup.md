---
description: スクール環境の初期セットアップ・更新（グローバル設定 + プロジェクト設定）
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Glob
---

スクール受講生の環境をセットアップする。初回でもアップデート後でも同じコマンドで対応する。

プラグイン内のテンプレートは `${CLAUDE_PLUGIN_ROOT}/references/` にある。

---

## Part 1: グローバル設定

### 1-1. バージョン確認

`~/.claude/.school-starter-version` を確認し、プラグインの現在のバージョンと比較する。
プラグインの現在バージョンは `${CLAUDE_PLUGIN_ROOT}/../.claude-plugin/plugin.json` の `version` フィールドから取得する。

- **ファイルが存在しない（初回）**: 全ファイルを新規配置
- **バージョンが同じ**: 「最新です」と報告し、Part 1のファイル配置をスキップ（Part 2は実行）
- **バージョンが異なる（更新あり）**: 更新されたテンプレートで上書き配置

配置完了後、`~/.claude/.school-starter-version` に現在のバージョンを書き込む。

### 1-2. グローバルルール（~/.claude/rules/）

`~/.claude/rules/` ディレクトリを確認し、以下の4ファイルを配置:

| ファイル | テンプレート元 | 役割 |
|---------|-------------|------|
| `~/.claude/rules/env-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/env-security.md` | .env取り扱いルール |
| `~/.claude/rules/development.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/development.md` | 開発原則 |
| `~/.claude/rules/test.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/test.md` | テスト・lint改ざん防止 |
| `~/.claude/rules/web-content-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/web-content-security.md` | 外部コンテンツ安全性 |

初回: テンプレートを読み込んで作成
更新時: テンプレートの最新版で上書き

### 1-3. interviewスキル（~/.claude/skills/interview/）

`${CLAUDE_PLUGIN_ROOT}/references/skills/interview/SKILL.md` を読み込んで `~/.claude/skills/interview/SKILL.md` に配置。

初回: 新規作成
更新時: 最新版で上書き

### 1-4. clear-prepコマンド（~/.claude/commands/clear-prep.md）

`${CLAUDE_PLUGIN_ROOT}/references/commands/clear-prep.md` を読み込んで `~/.claude/commands/clear-prep.md` に配置。

初回: 新規作成
更新時: 最新版で上書き

### 1-4a. new-projectコマンド（~/.claude/commands/new-project.md）

`${CLAUDE_PLUGIN_ROOT}/references/commands/new-project.md` を読み込んで `~/.claude/commands/new-project.md` に配置。

これにより、スクール生は新しいプロジェクトフォルダで `/new-project` だけで初期セットアップが走る。
配置後は project-flow スキル（プラグイン内）が自動発動してフェーズ進行をガイドする。

初回: 新規作成
更新時: 最新版で上書き

### 1-4b. ドキュメント管理ガイド（~/.claude/docs/）

`${CLAUDE_PLUGIN_ROOT}/references/docs/` 配下の以下のファイルを `~/.claude/docs/` に配置:

| ファイル | テンプレート元 | 役割 | 上書きルール |
|---------|-------------|------|------------|
| `~/.claude/docs/documentation.md` | `references/docs/documentation.md` | ドキュメント管理ルール | 毎回上書き |
| `~/.claude/docs/project-status-template.md` | `references/docs/project-status-template.md` | STATUS雛形 | 毎回上書き |
| `~/.claude/docs/task-backlog-template.md` | `references/docs/task-backlog-template.md` | バックログ雛形 | 毎回上書き |
| `~/.claude/docs/error-solutions.md` | `references/docs/error-solutions-template.md` | エラー蓄積ログ | **初回のみ作成（追記型）** |
| `~/.claude/docs/skill-health.md` | `references/docs/skill-health-template.md` | スキル健全性ログ | **初回のみ作成（追記型）** |

error-solutions.md と skill-health.md は追記型のため、既に存在する場合は上書きしない（ユーザーの記録を保護）。

結果レポートのグローバル設定セクションに以下の行を追加:
```
- docs/documentation.md: 作成 / 更新 / 最新
- docs/project-status-template.md: 作成 / 更新 / 最新
- docs/task-backlog-template.md: 作成 / 更新 / 最新
- docs/error-solutions.md: 作成 / 既存（スキップ）
- docs/skill-health.md: 作成 / 既存（スキップ）
```

### 1-5. グローバルCLAUDE.md（~/.claude/CLAUDE.md）

`~/.claude/CLAUDE.md` が存在するか確認。

- **存在しない（初回）** → `${CLAUDE_PLUGIN_ROOT}/references/claude-md-template.md` を読み込んで作成
- **存在する** → 上書きしない。「既存のためスキップ（ユーザーがカスタマイズしている可能性があるため）」と報告

※ CLAUDE.mdだけは上書きしない。ユーザーが自分で育てていくファイルのため。

### 1-6. セキュリティ設定の強化（settings.json deny リスト）

`~/.claude/settings.json` を読み、`permissions.deny` の内容を確認する。

以下のdenyリストが設定されているか確認し、不足があれば**既存設定を保持したまま**不足分を追加する:

```json
{
  "permissions": {
    "deny": [
      "Read(~/.ssh/**)",
      "Read(~/.gnupg/**)",
      "Read(~/.aws/**)",
      "Read(~/.azure/**)",
      "Read(~/.npmrc)",
      "Read(~/.git-credentials)",
      "Read(~/.config/gh/**)"
    ]
  }
}
```

- 既に全項目あり → 「denyリスト: 設定済み」と報告
- 不足あり → 不足分を追加し「denyリスト: N項目追加」と報告
- `permissions.allow` や他の設定がある場合は絶対に消さない（マージする）

**補足:** rules/のルールファイルはClaudeが「やるべきでない」と理解して自制する仕組み。denyリストはツールレベルでブロックするため、プロンプトインジェクションでも突破できない。両方あることで防御が二重化される。

### 1-7. sandbox有効化の確認

`~/.claude/settings.json` を読み、`sandbox.enabled` が `true` かを確認する。

**重要: sandboxとCodexレビューは現時点で同時に使えない。** sandboxが有効だとCodex CLIがネットワークアクセスをブロックされてレビューが実行できない。

以下のロジックで判断する:

1. Codexプラグインがインストールされているか確認（`~/.claude/plugins/cache/openai-codex` の存在）
2. sandboxの状態を確認

**パターン別の報告:**

- **sandbox有効 + Codex未導入** → 「sandbox: 有効」と報告。問題なし
- **sandbox有効 + Codex導入済み** → 以下を警告:
```
⚠ sandboxとCodexレビューの競合
sandboxが有効ですが、Codexレビュー（/codex-review）はsandbox環境では
ネットワークがブロックされるため動作しません。

どちらかを選んでください:
  A. sandboxを優先（Codexレビューは使えない）
  B. Codexレビューを優先（sandboxをオフにする）

※ sandboxなしでも、このプラグインのルールファイル + denyリストで
  主要な攻撃パターンは防げます。
```
AskUserQuestionで選択を求め、Bの場合は `/sandbox` でオフにするよう案内する。

- **sandbox無効 + Codex導入済み** → 「sandbox: 無効（Codexレビュー優先）」と報告。問題なし
- **sandbox無効 + Codex未導入** → 以下を表示:
```
sandboxが無効です。セットアップ完了後に以下を実行してください:
  /sandbox
（Claude Codeの公式コマンドで、AIの操作を安全に制限できます）
```

### 1-8. Codexレビュー機能の案内

`~/.claude/plugins/cache/openai-codex` の存在を確認。

- インストール済み → 「Codexレビュー: 利用可能」と報告
- 未インストール → 以下を表示:
```
Codexレビュー機能（オプション）
Claude Codeが書いたコードを、OpenAIのCodexが自動レビューする機能が使えます。
OpenAIの無料アカウントでも今は試せます（期間限定プロモーション中）。
使ってみたい場合:
  /plugin install codex@openai-codex
※ 安定利用にはOpenAI有料プラン（Plus $20/月〜）が必要です
※ なくても講義には一切影響ありません
※ sandboxが有効な場合、Codexレビューは使えません（1-7参照）
```

### 1-9. Codex CLI のセットアップ伴走（必須）

**Claude Code 内のCodexプラグインとは別物**。スタンドアロンのCodex CLIを使い、project-flowスキルからD&D方式で第三者レビューに使う。sandboxとも干渉しない。

`which codex` で確認:

- **インストール済み** → 「Codex CLI: 利用可能」と報告
- **未インストール** → 以下のフローで伴走:

```
🔍 Codex CLI のセットアップ

Codex CLI は要件定義・DB設計・実装計画の第三者レビューに使います。
別ターミナルでこのCLIを起動し、レビューしてほしいmdファイルを
ドラッグ＆ドロップするだけで使えます。

【インストール手順】
1. 公式: https://www.npmjs.com/package/@openai/codex
2. 以下のコマンドでインストール:
     npm install -g @openai/codex
   または
     brew install --cask codex
   ※ Node.js が必要です（npmの場合）
3. 認証:
     codex login
   → ブラウザが開くので OpenAI アカウントでログイン
4. 動作確認:
     codex --version

【無料プランで試せる範囲】
- 期間限定プロモーション中は無料アカウントでも利用可能
- 安定利用には OpenAI Plus ($20/月) 推奨
- 無くても /new-project の流れは動きますが、第三者レビューがスキップされます
```

ユーザーに `AskUserQuestion` で確認:
```
question: Codex CLI のセットアップ方法
options:
  - label: "今すぐインストールする（推奨）"
    description: 上記のコマンドを実行してインストール・認証まで完了させる
  - label: "後で自分でやる"
    description: 必要になったら後で /school-starter:setup を再実行する
  - label: "今回はスキップ"
    description: Codex レビューは使わない（project-flowスキルでは案内のみ表示）
```

「今すぐインストール」を選んだ場合、`Bash` で `npm install -g @openai/codex` を実行し、その後 `codex login` の手順をユーザーに案内する。

### 1-10. ガイドドキュメントの配布（~/.claude/docs/）

**重要**: 1-11 (GWS CLI セットアップ伴走) よりも先にこのステップを実行する。
GWS セットアップ時にユーザーへ参照させるドキュメントを、その時点で配布済みにしておくため。

`${CLAUDE_PLUGIN_ROOT}/references/docs/google-workspace-cli.md` を読み込んで `~/.claude/docs/google-workspace-cli.md` に配置。

これにより、スクール生は後からいつでも GWS CLI の使い方を参照できる。

初回: 新規作成
更新時: 最新版で上書き

### 1-11. GWS CLI のセットアップ伴走（必須）

GWS CLI は見積書のGoogleドキュメント化、スプレッドシート操作、Drive操作などに使う。全案件で必須レベルで使う。

`which gws` で確認:

- **インストール済み** → 認証状態を `gws auth status` で確認
  - 認証済み → 「GWS CLI: 利用可能」と報告
  - 未認証 → 認証手順へ
- **未インストール** → インストール手順へ

#### インストール手順
```bash
npm install -g @googleworkspace/cli
gws --version
```

#### GCP プロジェクト準備の案内
```
🔧 Google Cloud Platform の準備が必要です

詳細手順は ~/.claude/docs/google-workspace-cli.md を参照してください
（1-10 で配布済み）。

ざっくり手順:
1. https://console.cloud.google.com/ にアクセス
2. プロジェクト作成（例: gws-cli-自分の名前）
3. 以下のAPIを有効化:
   - Google Drive API
   - Google Sheets API
   - Google Docs API
4. OAuth認証情報を作成（デスクトップアプリ）
5. JSON をダウンロード
```

#### 認証
```bash
gws auth login --client-secret ./ダウンロードしたファイル.json
```

ブラウザが開いて Google アカウントでログイン → 完了。

ユーザーに `AskUserQuestion` で確認:
```
question: GWS CLI のセットアップ方法
options:
  - label: "今すぐ全部やる（推奨）"
    description: インストール・GCP設定・認証まで伴走する
  - label: "インストールだけ今やる"
    description: GCP設定と認証は後で自分でやる
  - label: "後で自分で全部やる"
    description: ~/.claude/docs/google-workspace-cli.md を見ながら自分でやる
```

選択に応じて伴走する。「今すぐ全部やる」の場合、各ステップで `Bash` を実行しながら確認していく（GCP のブラウザ作業はユーザー任せ）。

---

## Part 2: プロジェクト設定（毎回）

### 2-1. .claudeignore の確認

プロジェクトルートに `.claudeignore` があるか確認。なければ以下を作成:
```
.env*
*.pem
*.key
credentials/
```

### 2-2. .gitignore の確認

`.gitignore` に `.env*` が含まれているか確認。なければ追加を提案。

---

## 結果レポート

すべての確認結果を以下の形式でまとめて報告:

```
## セットアップ結果（v1.6.0）

### グローバル設定（全プロジェクト共通）
- rules/env-security.md: 作成 / 更新 / 最新
- rules/development.md: 作成 / 更新 / 最新
- rules/test.md: 作成 / 更新 / 最新
- rules/web-content-security.md: 作成 / 更新 / 最新
- skills/interview: 作成 / 更新 / 最新
- commands/clear-prep: 作成 / 更新 / 最新
- commands/new-project: 作成 / 更新 / 最新
- docs/google-workspace-cli.md: 作成 / 更新 / 最新
- CLAUDE.md: 作成 / 既存（スキップ）
- denyリスト: 設定済み / N項目追加
- sandbox: 有効 / 無効（Codex優先） / 要設定
- Codexレビュープラグイン: 利用可能 / 未導入（オプション）
- Codex CLI: 利用可能 / インストール済み / スキップ
- GWS CLI: 利用可能 / インストール済み / スキップ

### プロジェクト設定
- .claudeignore: 作成済み / 既存
- .gitignore: .env*あり / 追加済み

✅ セットアップ完了！
グローバル設定は今後作成するすべてのプロジェクトに自動で適用されます。

📌 次にやること:
新しいアプリ開発を始めるときは、フォルダを作って Claude Code を起動したら
最初に /new-project と入力してください。
あとは Claude Code が対話形式でフェーズを進めてくれます。

💡 プラグインの更新があった場合:
  1. /plugin update school-starter
  2. /school-starter:setup（このコマンドを再実行）
```
