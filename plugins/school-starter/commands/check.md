---
description: プロジェクトのセキュリティ・品質チェック
allowed-tools: Bash, Read, Glob, Grep
---

プロジェクトの安全性と品質をチェックする。以下を確認して結果を報告する。

## チェック項目

### セキュリティ
1. `.env*` ファイルが `.gitignore` に含まれているか
2. `service_role` キーがコード内にハードコードされていないか（grep で確認）
3. APIキーらしき文字列がコード内にないか
4. `~/.claude/settings.json` にdenyリスト（`~/.ssh/**`・`Read(./.env*)`・`Bash(* .env*)` 等）が設定されているか（**機密ファイルを Claude に読ませない本当の壁はここ**）
5. sandbox の状態（※ Claude Code は sandbox 状態を settings.json 等のファイルに書き込まない仕様のため、検出はできない。OK/NG 判定はせず案内のみ行う）

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
- ハードコードされたキー: なし/あり（ファイル名）
- denyリスト: OK/不足あり
- sandbox: ファイルから検出不可（仕様）。`/sandbox` 実行時に `✓ Sandbox enabled` を見ていればOK

### コード品質
- lint: OK/NG/スキップ
- 型チェック: OK/NG/スキップ
- ビルド: OK/NG/スキップ

### Git
- 未コミット変更: あり/なし
- .envの漏洩: なし/あり
```

## 結果の読み方（NG が出たらこう判断する）

受講生向けに、各項目の意味と NG 時のアクションを明示する:

| 項目 | OK の意味 | NG の意味・対応 |
|------|-----------|----------------|
| `.gitignore` に `.env*` | `.env` 系が git 管理外 | **即対応**: `.gitignore` に `.env*` を追記。既にコミット済みなら `git rm --cached .env*` |
| ハードコードされたキー | `service_role` / API key がコード内に直書きされていない | **即対応**: そのキーを `.env.local` に移動。既に GitHub に push 済みの場合はキーを **ローテート**（新しい値を発行して古いものを無効化） |
| deny リスト | `~/.claude/settings.json` の deny に `~/.ssh/**` 等の基本項目あり | **対応**: `/school-starter:setup` を再実行して最新 deny リストを適用 |
| sandbox | ファイルから状態を検出できない仕様（Claude Code は settings.json に書かない）。`/sandbox` 実行時に `✓ Sandbox enabled` を見ていればOK | **対応**: 未確認なら `/sandbox` を実行（既に有効でも冪等＝3択UIが出るだけで害なし）。コードレビュー運用はこれ前提で設計されている |
| lint / 型 / ビルド | エラー 0 件 | **即対応**: エラーメッセージを Claude に貼り付けて「これを直して」と依頼。テスト・lint の設定自体を緩めない（`~/.claude/rules/test.md` 参照） |
| 未コミット変更 | 全部コミット済み or 意図的に手元にある | **判断**: 納品前は全部 push する。作業中なら問題なし |
| `.env` の漏洩 | `git ls-files` に `.env*` がない | **最優先対応**: 即 `git rm --cached .env*` + GitHub に push 済みなら全キー **ローテート必須**（履歴に残るため削除だけでは不十分） |

**NG が 1 件でも残っている状態で納品しない**。特に `.env` の漏洩・ハードコードされたキーは、既に外部に出ている前提で**キーのローテートまでやらないと穴が塞がらない**（commit 履歴から消してもコピーが誰かのローカルにある可能性）。
