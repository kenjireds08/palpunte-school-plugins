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

### 1-10. feature-dev プラグインのセットアップ伴走（必須）

**Anthropic 公式の設計支援プラグイン**。要件定義・設計判断・複雑な機能追加の場面で、code-explorer / code-architect / code-reviewer の3つの専門エージェントが並列で動き、調査→設計案比較→レビューまで一気通貫で行う。

スクール生は第3回（要件定義）以降で使うため、**setup の段階で入れておく**のが望ましい。

以下のパスで既にインストールされているかを確認:
- `~/.claude/plugins/cache/claude-plugins-official/feature-dev`
- `~/.claude/plugins/cache/claude-code-plugins/feature-dev`

どちらかが存在すれば「feature-dev: 利用可能」と報告。

**未インストール** → 以下のフローで伴走:

```
📝 feature-dev プラグインのセットアップ

feature-dev は要件定義・設計判断の場面で使う Anthropic 公式プラグインです。
コードベース調査・設計案比較・レビューを並列エージェントで一気通貫で行います。

第3回（要件定義）以降で使うので、ここで入れておきましょう。

【インストール手順】
Claude Code で以下のコマンドを実行してください:

  /plugin install feature-dev@claude-plugins-official

インストール後、自動で有効化されます（再起動不要）。

【使い方のイメージ】
- 「予約管理アプリの全体設計を考えたい」→ /feature-dev
- 「認証機能の実装方針を比較したい」→ /feature-dev
- 単純な変更は /feature-dev 不要（Plan Mode だけで十分）
```

ユーザーに `AskUserQuestion` で確認:
```
question: feature-dev プラグインのセットアップ方法
options:
  - label: "今すぐインストールする（推奨）"
    description: /plugin install feature-dev@claude-plugins-official を実行
  - label: "後で自分でやる"
    description: 第3回までに /school-starter:setup を再実行するか、手動インストール
  - label: "今回はスキップ"
    description: feature-dev は使わない方針（Plan Mode のみで進める）
```

「今すぐインストール」を選んだ場合、ユーザーに Claude Code の入力欄に以下のコマンドを貼り付けて実行するよう案内する:
```
/plugin install feature-dev@claude-plugins-official
```

インストール完了後は再度 `/school-starter:setup` を実行してもらい、このセクションで「feature-dev: 利用可能」と確認できる状態にする。

**補足**: `claude-plugins-official` と `claude-code-plugins` の2つのマーケットに同名プラグインがあるが、**`claude-plugins-official` 版を推奨**（Anthropic 公式マーケット）。

### 1-11. Google Docs マークダウン設定の案内

GWS CLI を使わなくても、見積もり書（mdファイル）を Google Docs にきれいに貼り付けられる。
スクール生に以下を案内する:

```
📝 Google Docs のマークダウン設定（1回だけやればOK）

スクール生の見積もり書は docs/006_estimate.md にmdで作成し、
Google Docs に貼り付けて納品します。
そのために、Google Docs 側で1回だけ設定が必要です:

1. https://docs.google.com/ で新規ドキュメントを開く
2. ツール → 設定
3. 「全般」タブの「マークダウンを有効にする」にチェック
4. OK

これで以降、右クリック → 「マークダウンから貼り付け」が使えます。
（普通の Cmd+V だとマークダウン記法のままになるので注意）

詳しい使い方は /new-project の流れで Claude Code が案内します。
```

この設定はユーザー側のGoogleアカウント設定なので、Claude Code側では何も配置しない。
案内のみを表示する。

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
## セットアップ結果（v1.6.3）

### グローバル設定（全プロジェクト共通）
- rules/env-security.md: 作成 / 更新 / 最新
- rules/development.md: 作成 / 更新 / 最新
- rules/test.md: 作成 / 更新 / 最新
- rules/web-content-security.md: 作成 / 更新 / 最新
- skills/interview: 作成 / 更新 / 最新
- commands/clear-prep: 作成 / 更新 / 最新
- commands/new-project: 作成 / 更新 / 最新
- CLAUDE.md: 作成 / 既存（スキップ）
- denyリスト: 設定済み / N項目追加
- sandbox: 有効 / 無効（Codex優先） / 要設定
- Codexレビュープラグイン: 利用可能 / 未導入（オプション）
- Codex CLI: 利用可能 / インストール済み / スキップ
- feature-dev プラグイン: 利用可能 / インストール済み / スキップ
- Google Docs マークダウン設定: 案内表示済み

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
