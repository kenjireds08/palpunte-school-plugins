# palpunte-school-plugins

ぱるぷんてスクール上級コース用の Claude Code プラグイン。

## インストール

```
/plugin install school-starter@kenjireds08/palpunte-school-plugins
```

## 含まれるもの

### コマンド

| コマンド | 説明 |
|---------|------|
| `/school-starter:setup` | sandbox有効化・.claudeignore作成など初期セットアップ |
| `/school-starter:check` | セキュリティ・コード品質・Gitの一括チェック |

### スキル

| スキル | 説明 |
|--------|------|
| codex-review | Codex反復コードレビュー（最大10回自動ループ） |

**注意**: codex-reviewを使うには別途 Codex プラグイン（`/plugin install codex@openai-codex`）と OpenAI 有料プランが必要です。

### Hooks

| イベント | 動作 |
|---------|------|
| Stop（作業完了時） | 通知音を鳴らす（macOS） |

## 更新

```
/plugin update school-starter@kenjireds08/palpunte-school-plugins
```
