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

### 1-4c. interview-light / interview-full コマンド（~/.claude/commands/）

以下の2ファイルを `~/.claude/commands/` に配置（`/interview` を打ったときにサジェスト候補として2つの選択肢が表示されるようにする）:

| ファイル | テンプレート元 | 役割 |
|---------|-------------|------|
| `~/.claude/commands/interview-light.md` | `${CLAUDE_PLUGIN_ROOT}/references/commands/interview-light.md` | 受注前・モックアップ用の軽量ヒアリング（5問完結） |
| `~/.claude/commands/interview-full.md` | `${CLAUDE_PLUGIN_ROOT}/references/commands/interview-full.md` | 受注後・本実装用の詳細ヒアリング（9観点） |

これらのコマンドは内部で `~/.claude/skills/interview/` のスキルを呼び出すラッパー。
スキル本体は `1-3` で配置済み。

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
      "Read(~/.config/gh/**)",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(nc *)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./config/credentials.json)",
      "Read(**/password)",
      "Read(**/secret)",
      "Bash(rm -rf ~*)",
      "Bash(rm -rf .*)",
      "Bash(git push --force *main*)",
      "Bash(git push -f *main*)",
      "Bash(git push --force *master*)",
      "Bash(git push -f *master*)"
    ],
    "ask": [
      "Bash(rm -rf *)"
    ]
  }
}
```

denyリストは大きく4カテゴリ:

1. **ホーム系認証情報のブロック**（`~/.ssh/**` 等） — サプライチェーン攻撃を受けても認証情報を抜かれない
2. **外部通信コマンドのブロック**（`Bash(curl *)`, `Bash(wget *)`, `Bash(nc *)`） — プロンプトインジェクションでAIが騙されても、情報を外部に送る手段を持たない
3. **プロジェクト内の機密ファイルのブロック**（`./.env` 等） — プロジェクト内のAPIキー・認証情報をAIが読めないように
4. **破壊的操作のブロック**（`rm -rf`, `git push --force`） — AIがパスミスで全削除したり、force pushで同僚のコミットを消したりする事故を予防

処理:
- 既に全項目あり → 「denyリスト: 設定済み」と報告
- 不足あり → 不足分を追加し「denyリスト: N項目追加」と報告
- `permissions.allow` や他の設定がある場合は絶対に消さない（マージする）
- `permissions.ask` がない場合は新規追加、ある場合はマージ

**補足:**
- rules/のルールファイルはClaudeが「やるべきでない」と理解して自制する仕組み。denyリストはツールレベルでブロックするため、プロンプトインジェクションでも突破できない。両方あることで防御が二重化される
- `Bash(curl *)` 等は**AIが勝手に使うこと**だけをブロックする。受講生自身がターミナルで手動実行する分には影響しない
- `Read(./.env)` / `Read(./.env.*)` は `.claudeignore` と役割が重なるが、denyはツールレベルで強制力が強い。二重に設定することで防御を厚くする
- `rm -rf ~*` / `rm -rf .*` は即時deny（ホームディレクトリや隠しファイル全削除の事故防止）
- `rm -rf *` は `ask`（確認プロンプト）。`build/`掃除などの正規用途は残しつつ、パスミスをユーザーが気づける
- `git push --force` のdenyは main / master 限定。個人のトピックブランチへのforce pushは通常通り可能

### 1-7. sandbox有効化の確認

`~/.claude/settings.json` を読み、`sandbox.enabled` が `true` かを確認する。

**このプラグインのレビュー運用はサンドボックス ON と両立するように設計されている。**
コードレビューは `review` スキル（`feature-dev:code-reviewer` サブエージェント + 最終サマリーを Codex別タブにコピペ）で行うため、Codex CLI/プラグインとネットワーク層で競合しない。

- **sandbox有効** → 「sandbox: 有効」と報告。問題なし（推奨状態）
- **sandbox無効** → 以下を表示し、有効化を推奨:
```
⚠ sandbox が無効です
このプラグインの推奨は「sandbox: 有効」です。
レビューは feature-dev:code-reviewer + Codex別タブコピペ方式なので、
sandbox ON と両立できます（コピペのため Codex CLI とネットワーク層で干渉しない）。

有効化する場合:
  /sandbox
```

### 1-8. Codex CLI のセットアップ伴走（必須）

**Codex CLI はスタンドアロン版**（Claude Code 内プラグインではなくOpenAIの独立CLI）。
このプラグインのレビュー運用では、`review` スキルが出力する「作業サマリー」を **Codex CLI または ChatGPT 別タブにコピペ**して独立レビューを受ける用途で使う。sandbox とも干渉しない。

`which codex` で確認:

- **インストール済み** → 「Codex CLI: 利用可能」と報告
- **未インストール** → 以下のフローで伴走:

```
🔍 Codex CLI のセットアップ

Codex CLI は以下の2用途で使います:
  ① 要件定義・DB設計・実装計画の md ファイルを D&D で第三者レビュー
  ② `review` スキルの「作業サマリー」をコピペして実装コードを独立レビュー

どちらも別ターミナルで Codex CLI を起動して実行します（sandbox と干渉しない運用）。

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

### 1-9. feature-dev プラグインのセットアップ伴走（必須）

**Anthropic 公式の設計支援プラグイン**。要件定義・設計判断・複雑な機能追加の場面で、code-explorer / code-architect / code-reviewer の3つの専門エージェントが並列で動き、調査→設計案比較→レビューまで一気通貫で行う。

このプラグインの `review` スキルは内部で **`feature-dev:code-reviewer` サブエージェント**を呼び出すため、**feature-dev プラグインのインストールは必須**。

スクール生は第3回（要件定義）以降でも使うため、**setup の段階で入れておく**。

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

### 1-9-a. セキュリティ監査エージェント（security-auditor）の配置

`${CLAUDE_PLUGIN_ROOT}/references/agents/security-auditor.md` を `~/.claude/agents/security-auditor.md` に配置する。

このエージェントは OWASP Top 10 / 認証・認可 / JWT / CORS / CSP / 暗号化 / Supabase RLS ポリシー妥当性などを専門とするセキュリティ監査官。**第7回（認証・セキュリティ）と第10回（納品前レビュー）で明示的に呼び出して使う**。

- **初回**: 新規作成
- **更新時**: 最新版で上書き（ユーザーが手動で書き換えている場合も、プラグイン側の最新を優先。カスタマイズが必要なら別名で保存してもらう方針）

受講生は `~/.claude/agents/security-auditor.md` が配置されると、以下のような明示呼び出しで利用できる:

```
@agent-security-auditor このフォルダの認証周りをレビューして、OWASP Top 10 観点でリスクがあれば指摘して
```

または `Agent` ツールに `subagent_type: "security-auditor"` を指定することでも発動する。

### 1-10-a. Plan Mode 出力先の設定（plansDirectory）

`~/.claude/settings.json` の `plansDirectory` 設定を確認する。

この設定がないと、Plan Mode で作った計画書が `~/.claude/plans/` にグローバル保存されてしまい、リポジトリごとに混ざって見づらくなる。`./plans` に設定するとプロジェクトルート配下の `plans/` に出力されるため、リポジトリごとに計画書を管理できる。

- **`plansDirectory` がない** → 既存設定を保持したまま `"plansDirectory": "./plans"` を追記。「plansDirectory: 設定済み（./plans）」と報告
- **既に設定済み** → 値がユーザーのカスタム設定（例: `"./docs/plans"`）の場合はそのまま尊重。「plansDirectory: 既存設定を保持（<値>）」と報告
- **`"./plans"` で既設定** → 「plansDirectory: 最新」と報告

`~/.claude/settings.json` の他の既存設定（`permissions`, `hooks`, `enabledPlugins`, `language`, `sandbox` 等）は絶対に消さないこと。`plansDirectory` キーだけを追記する。

### 1-10. Google Docs マークダウン設定の案内

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
## セットアップ結果（v1.12.2）

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
- sandbox: 有効（推奨）/ 無効（有効化を案内）
- Codex CLI（独立レビュー用）: 利用可能 / インストール済み / スキップ
- feature-dev プラグイン（内部レビュー用・必須）: 利用可能 / インストール済み / スキップ
- agents/security-auditor.md（セキュリティ監査用・第7回/第10回で使用）: 作成 / 更新 / 最新
- plansDirectory 設定: 設定済み（./plans）/ 既存設定を保持（<値>）/ 最新
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
