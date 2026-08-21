# palpunte-school-plugins

未来AI学院上級コース用の Claude Code プラグイン。
1回のインストール + setupで、プロの開発環境が整います。

## 事前準備（受講生・初日）

このプラグインは **VS Code 拡張機能版 Claude Code** が動作している前提です。

まだ Claude Code を入れていない方は、以下の Notion 記事の手順でセットアップしてください（10分で完了・公式仕様準拠）:

📘 **[Claude Code（VS Code拡張版）セットアップガイド ― 上級コース受講生向け](https://www.notion.so/Claude-Code-VS-Code-355af2ccb9b58198b3d7e1ec0e24b3de)**

ガイド内容: VS Code インストール / Claude Code 拡張機能インストール / サインイン / 推奨レイアウト（Claude Code パネル + ターミナル分割）/ 拡張機能ならではの便利機能 / 困った時の補助プロンプト

> 中級コースは Claude Code デスクトップ版を使うため、上級コースと差別化されています。VS Code 拡張版を使うことで、本格的なアプリ開発に必要な「IDE統合・ターミナル分割で複数Claude/Codex並列」運用が可能になります。

## インストール

Claude Code の入力欄に以下を順番に打つ:

### ステップ1: マーケットプレイスを追加

```
/plugin marketplace add kenjireds08/palpunte-school-plugins
```

### ステップ2: プラグイン本体をインストール

```
/plugin install school-starter@palpunte-school-plugins
```

→ scope の選択を聞かれたら **user** を選ぶ（全プロジェクトで使えるようにするため）

### ステップ3: プラグインをリロード

```
/reload-plugins
```

→ "Installed school-starter. Run /reload-plugins to apply." と表示されるので、必ずこのコマンドを打つ。打たずに setup を実行すると `Unknown command: /school-starter:setup` エラーが出る

## 初回セットアップ（必ず実行）

```
/school-starter:setup
```

これだけで以下が自動設定されます:

### グローバル設定（全プロジェクト共通・一度だけ）
| 設定 | 内容 |
|------|------|
| `~/.claude/rules/env-security.md` | .env・APIキーの取り扱いルール |
| `~/.claude/rules/development.md` | 開発原則（要件定義優先・既存パターン踏襲等） |
| `~/.claude/rules/test.md` | テスト・lint改ざん防止 |
| `~/.claude/rules/web-content-security.md` | 外部コンテンツの安全性ルール |
| `~/.claude/rules/vercel-deployment.md` | Vercel CLI 方針（vercel.json/next.config 編集時のみ自動ロード） |
| `~/.claude/rules/supabase-security.md` | Supabase RLS チェック（migrations/・*.sql 編集時のみ自動ロード） |
| `~/.claude/docs/design-md-template.md` | DESIGN.md カタログ（awesome-design-md-jp 24サービス + jp-ui-contracts 5プロファイル + 実運用Tips） |
| `~/.claude/docs/ui-prohibited-patterns.md` | AIっぽさ排除のUI禁止パターンチェックリスト（フロントエンド実装時に参照） |
| `~/.claude/skills/interview/` | 要件ヒアリング → 仕様書自動生成スキル |
| `~/.claude/CLAUDE.md` | グローバル設定テンプレート |

### プロジェクト設定（毎回）
| 設定 | 内容 |
|------|------|
| `.claudeignore` | AIに読ませないファイルの設定 |
| `.gitignore` | GitHubに上げないファイルの確認 |

## 使えるコマンド

| コマンド | 説明 |
|---------|------|
| `/school-starter:setup` | 環境セットアップ（初回: グローバル設定 + プロジェクト設定） |
| `/school-starter:check` | セキュリティ・コード品質・Gitの一括チェック |
| `/interview` | 要件ヒアリング → 仕様書自動生成（setupで配置されるグローバルスキル） |

## スキル

| スキル | 説明 |
|--------|------|
| review | 2段階コードレビュー。`feature-dev:code-reviewer` サブエージェントで内部レビュー → 必要な修正ループ → 最後に「作業サマリー（Codex独立レビュー用）」を必ず出力 |
| interview | 要件定義インタビュー（4フェーズ構成）。Grill Me風の深掘り質問 + Ubiquitous Language（用語集）確定 + 技術者向け要件定義 `docs/001_requirements.md` 生成 → ブラッシュアップ後「クライアント向けにまとめて」でフェーズ4発動 → 粒度選択（営業向け/実務担当向け/エンジニア向け/カスタム）→ `docs/001_requirements_for_client.md` を別ファイルで出力（Notion/Google Docs コピペ可） |
| project-flow | アプリ開発フェーズ進行ガイド |

**review スキルの前提**: `feature-dev` プラグインが必要です（`/plugin install feature-dev@claude-plugins-official`）。セットアップ時に自動で伴走します。

**Codex との連携**: `review` スキルが出力する「作業サマリー」を **Codex CLI（別ターミナル）または ChatGPT 別タブにコピペ**して独立レビューを受ける運用です。コピペ方式なので **sandbox 有効のまま** Codex 独立レビューが使えます。

## Hooks

| イベント | 動作 |
|---------|------|
| Stop（作業完了時） | 通知音を鳴らす（macOS / Windows / Linux対応） |

## 新しいプロジェクトを始めるとき

setupで配置したグローバル設定は自動的に適用されます。
新しいプロジェクトごとに必要なのは:

1. プロジェクトを作成
2. `/school-starter:setup` を実行（.claudeignore と .gitignore の確認のみ）
3. 開発開始

## 更新

`/plugin` の UI から更新する。**`/plugin update <名前>` というコマンド形式は存在しない**。

```
/plugin
```

→ `Installed` タブ → `school-starter` を選択 → `Update now` → `Esc` で閉じる

そのあと反映する（ここまでやらないと新しいスキル・コマンド・Hook が有効にならない）:

```
/reload-plugins
```

ルール・テンプレートに変更があるリリースでは `/school-starter:setup` も実行する（毎回実行しても害はない）。

受講生向けの操作解説動画:
https://drive.google.com/file/d/1-Ubb3KUf5KT2pVO_BEK8PSFudIsirYPy/view?usp=sharing
