---
description: スクール環境の初期セットアップ（sandbox有効化・セキュリティ確認）
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion
---

スクール受講生の環境をセットアップする。以下を順番に実行する。

## 1. sandbox有効化の確認

`~/.claude/settings.json` を読み、`sandbox.enabled` が `true` かを確認する。

設定されていない場合:
- ユーザーに「sandboxを有効化しますか？AIの操作を安全に制限できます（推奨）」と確認
- OKなら settings.json に以下を追加:
```json
{
  "sandbox": {
    "enabled": true
  }
}
```

既に有効なら「sandbox: 有効」と報告。

## 2. .claudeignore の確認

プロジェクトルートに `.claudeignore` があるか確認。なければ以下を作成:
```
.env*
*.pem
*.key
credentials/
```

## 3. .gitignore の確認

`.gitignore` に `.env*` が含まれているか確認。なければ追加を提案。

## 4. 結果レポート

```
## セットアップ結果
- sandbox: 有効/無効
- .claudeignore: 作成済み/既存
- .gitignore: .env*あり/追加済み
```
