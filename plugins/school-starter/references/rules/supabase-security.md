---
paths:
  - "**/migrations/**"
  - "**/*.sql"
  - "**/supabase/**"
  - "**/lib/supabase/**"
  - "**/utils/supabase/**"
  - "**/*supabase*.{ts,tsx,js,jsx}"
---

# Supabase RLS・セキュリティチェック

このルールは Supabase 関連ファイル（migrations/ や *.sql、lib/supabase/ 等）を編集するときだけ自動でロードされます。

## なぜ必要か

Supabase は便利ですが、**RLS（Row Level Security）の設定漏れで誰でもデータを読み書きできる状態**になることが頻繁に起きます。納品前・本番リリース前に必ずチェックしましょう。

## 必須チェックリスト（納品前）

- [ ] **全テーブルで `ENABLE ROW LEVEL SECURITY` が有効か**（無効だと誰でもアクセス可能）
- [ ] **各テーブルに適切な RLS ポリシーが設定されているか**（SELECT / INSERT / UPDATE / DELETE 別に）
- [ ] **`service_role` キーがクライアントコードに露出していないか**（露出 = 全データへのフルアクセスを公開しているのと同じ）
- [ ] **anon key と service_role key の使い分けが正しいか**（クライアントは anon key、サーバーサイドのみ service_role key）
- [ ] **Storage の RLS ポリシーも設定されているか**（テーブルだけでなくStorageもRLS必須）

## Supabase 固有の落とし穴（よくあるミス）

| 罠 | 内容 |
|----|------|
| `user_metadata` 誤用 | クライアントから書き換え可能なので「権限情報」を入れない |
| UPDATE には SELECT も必要 | UPDATE ポリシーだけだと WHERE 条件が機能せず更新失敗 |
| Views は RLS をバイパス | View 経由でアクセスすると RLS が効かない場合がある |
| Storage upsert 権限の見落とし | INSERT だけでなく UPDATE/upsert も別ポリシーで必要 |
| Edge Functions の JWT検証 | Edge Functions では明示的に JWT を検証する必要がある |

## チェック手順

1. Supabase ダッシュボード → Authentication → Policies で全テーブル確認
2. 「RLS Disabled」と表示されているテーブルがあれば即座に有効化
3. 各テーブルのポリシーが業務要件と一致しているか確認
4. クライアントコードを grep で検索:
   ```bash
   grep -r "SUPABASE_SERVICE_ROLE_KEY\|service_role" src/ app/ components/
   ```
5. クライアント側コードに `service_role` が含まれていれば即削除（Server Component / API Route / Edge Function に移動）

## 関連リソース

- `~/.claude/rules/env-security.md`: .env / シークレット情報の取り扱い
- Supabase 公式ドキュメント: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
