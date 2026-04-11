---
description: プロジェクトのセキュリティ・品質チェック
allowed-tools: Bash, Read, Glob, Grep
---

プロジェクトの安全性と品質をチェックする。以下を確認して結果を報告する。

## チェック項目

### セキュリティ
1. `.env*` ファイルが `.gitignore` に含まれているか
2. `.claudeignore` が存在するか
3. `service_role` キーがコード内にハードコードされていないか（grep で確認）
4. APIキーらしき文字列がコード内にないか
5. `~/.claude/settings.json` にdenyリスト（`~/.ssh/**` 等）が設定されているか
6. sandboxとCodexレビューの競合がないか（両方有効なら警告）

### コード品質
1. `npm run lint` が通るか（package.json にあれば）
2. `npm run typecheck` が通るか（同上）
3. `npm run build` が通るか（同上）

### Git
1. コミットされていない変更があるか
2. `.env*` ファイルがgit管理下に入っていないか（`git ls-files` で確認）

## 結果レポート

各項目を以下の形式で報告:
```
## プロジェクトチェック結果

### セキュリティ
- .gitignore に .env*: OK/NG
- .claudeignore: OK/NG
- ハードコードされたキー: なし/あり（ファイル名）
- denyリスト: OK/不足あり
- sandbox/Codex競合: なし/あり

### コード品質
- lint: OK/NG/スキップ
- 型チェック: OK/NG/スキップ
- ビルド: OK/NG/スキップ

### Git
- 未コミット変更: あり/なし
- .envの漏洩: なし/あり
```
