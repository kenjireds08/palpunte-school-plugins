# palpunte-school-plugins

ぱるぷんて���クール上級コース用の Claude Code プラグイン。
1回のインストール + setupで、プロの開発環境が整います。

## インストール

```
/plugin install school-starter@kenjireds08/palpunte-school-plugins
```

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

```
/plugin update school-starter@kenjireds08/palpunte-school-plugins
```
