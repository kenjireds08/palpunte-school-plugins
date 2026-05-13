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

## 必須チェックリスト（納品前・OWASP マッピング付き）

IMPORTANT: 納品前に以下をすべて確認する。1 つでも抜けると本番で事故る。

- [ ] 全テーブルで `ENABLE ROW LEVEL SECURITY` が有効 — **OWASP A01: Broken Access Control**
- [ ] `anon` / `authenticated` 両ロールのポリシーが適切に分かれている — **OWASP A01: Broken Access Control**
- [ ] `service_role` キーがクライアントコード（`NEXT_PUBLIC_*` やブラウザから見える場所）に露出していない — **OWASP A02: Cryptographic Failures / A07: Identification and Authentication Failures**
- [ ] UPDATE ポリシーに SELECT ポリシーも併記（UPDATE だけだと RETURNING が効かず「謎のバグ」になる） — **OWASP A01: Broken Access Control**
- [ ] Views は `SECURITY INVOKER` を明示指定（デフォルト definer だと RLS バイパスで権限昇格） — **OWASP A01: Broken Access Control / A04: Insecure Design**
- [ ] ロール判定は `raw_app_meta_data` を使う（`raw_user_meta_data` はユーザー自身が書き換え可能で権限昇格の穴になる） — **OWASP A01: Broken Access Control / A04: Insecure Design**
- [ ] Storage bucket で `upsert: true` + `public` の組み合わせがない（他人のファイル上書きリスク） — **OWASP A01: Broken Access Control**
- [ ] Edge Functions で `service_role` を使う場合、呼び出し側の認可を自前で実装している — **OWASP A01: Broken Access Control / A07: Identification and Authentication Failures**
- [ ] Next.js の `'use client'` コンポーネントに `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_*` 以外の機密が漏れていない — **OWASP A02: Cryptographic Failures**
- [ ] `middleware.ts` の `matcher` の除外パターンが広すぎないか（認可バイパスの穴になる） — **OWASP A01: Broken Access Control / A07: Identification and Authentication Failures**
- [ ] Storage 署名 URL 発行時に `expiresIn` を必ず明示（デフォルト未指定だと長期間有効な URL がログや履歴に流出する。納品アプリの画像 / PDF 表示でありがち） — **OWASP A02: Cryptographic Failures / A04: Insecure Design**
- [ ] Supabase Auth の Redirect URL allowlist に `*` / `localhost` / `http://` スキームが本番環境に残っていない（PWA 予約管理アプリのメールリンク認証で狙われる） — **OWASP A07: Identification and Authentication Failures / A10: SSRF 隣接**
- [ ] `emailRedirectTo` / `signInWithOAuth.redirectTo` を **URL パラメータや外部入力から動的生成していない**（Open Redirect → フィッシング踏み台になる。サーバー側で allowlist ドメインに固定する） — **OWASP A01: Broken Access Control / A10: SSRF 隣接**
- [ ] Supabase Auth ダッシュボードで **Rate Limit（Magic Link / OTP / Signup）** を本番値に設定済み（デフォルトはゆるめで総当たり耐性が低い） — **OWASP A07: Identification and Authentication Failures**
- [ ] **SECURITY DEFINER 関数には `SET search_path = public, pg_temp` を明示**（未固定だと search_path ハイジャックで悪意のある同名関数を呼ばされ権限昇格。`CREATE FUNCTION ... SECURITY DEFINER SET search_path = public, pg_temp AS $$ ... $$`） — **OWASP A03: Injection / A04: Insecure Design**
- [ ] RPC や `rest/v1/rpc/` 経由の関数で、ユーザー入力を `EXECUTE format('... %s', input)` で組み立てていない（**%L / %I で必ず quote**、または bind 変数を使う） — **OWASP A03: Injection**
- [ ] カラムレベルで機密列を制限している（例: `payments.amount` を admin ロールのみ / `users.phone` / `users.line_id` は本人のみ見えるようビュー or `GRANT SELECT (col1, col2) ON TABLE` で隔離） — **OWASP A01: Broken Access Control**
- [ ] 納品前に `npm audit --omit=dev` / `pnpm audit --prod` を 1 回走らせ、**High / Critical がゼロ**を確認（本番依存の既知脆弱性検出） — **OWASP A06: Vulnerable and Outdated Components**
- [ ] `next.config.js` の `headers()` で **CSP / HSTS / X-Frame-Options / Referrer-Policy / Permissions-Policy** を本番向けに設定（特に `Content-Security-Policy` の `connect-src` を Supabase URL に絞る） — **OWASP A05: Security Misconfiguration**
- [ ] **`CREATE TABLE` 後に `GRANT` 文を必ず付与**（後述「Data API デフォルト変更」セクション参照。2026-05-30 以降の新規プロジェクト / 10-30 以降の既存プロジェクトで必須化） — **OWASP A01: Broken Access Control / A05: Security Misconfiguration**

※ 上記項目は OWASP Top 10 2021 のうち **A01 (Broken Access Control)** / **A02 (Cryptographic Failures)** / **A03 (Injection)** / **A04 (Insecure Design)** / **A05 (Security Misconfiguration)** / **A06 (Vulnerable and Outdated Components)** / **A07 (Identification and Authentication Failures)** / **A10 (SSRF)** をカバー。`@agent-security-auditor` は A08 (Software and Data Integrity Failures) / A09 (Security Logging and Monitoring Failures) も見る。

## Supabase 固有の落とし穴（よくあるミス・補足）

| 罠 | 内容 |
|----|------|
| `user_metadata` 誤用 | クライアントから書き換え可能なので「権限情報」を入れない |
| UPDATE には SELECT も必要 | UPDATE ポリシーだけだと WHERE 条件が機能せず更新失敗 |
| Views は RLS をバイパス | View 経由でアクセスすると RLS が効かない場合がある（`SECURITY INVOKER` 明示で回避） |
| Storage upsert 権限の見落とし | INSERT だけでなく UPDATE/upsert も別ポリシーで必要 |
| Edge Functions の JWT 検証 | Edge Functions では明示的に JWT を検証する必要がある |

## チェック手順

1. Supabase ダッシュボード → Authentication → Policies で全テーブル確認
2. 「RLS Disabled」と表示されているテーブルがあれば即座に有効化
3. 各テーブルのポリシーが業務要件と一致しているか確認
4. クライアントコードを grep で検索:
   ```bash
   grep -r "SUPABASE_SERVICE_ROLE_KEY\|service_role" src/ app/ components/
   ```
5. クライアント側コードに `service_role` が含まれていれば即削除（Server Component / API Route / Edge Function に移動）
6. 納品前は `@agent-security-auditor` に「Supabase RLS と認証周りを OWASP Top 10 観点でレビューして」と頼んで第三者監査を入れる

## 2026-05/10 Supabase Data API デフォルト変更（超重要・必読）

**何が変わるか**: `public` スキーマの新規テーブルが Data API（supabase-js / PostgREST / GraphQL）にデフォルトで露出しなくなる。**明示的な `GRANT` 文を書かないとクライアントから読み書きできなくなる**。

| 適用日 | 対象 |
|--------|------|
| **2026-05-30** | **新規プロジェクト** に適用 |
| **2026-10-30** | **既存プロジェクト** にも適用 |

| 影響あり | 影響なし |
|---------|---------|
| supabase-js を使う Next.js / React アプリ | psql / ORM / app server からの直接接続 |
| PostgREST `/rest/v1/` 経由のアクセス | 既存テーブル（grants 維持） |
| GraphQL `/graphql/v1/` 経由のアクセス | - |

### 受講生がやるべきこと（必須）

migration ファイルで **`CREATE TABLE` 後に必ず `GRANT` 文をセット**で書く。これからは下記テンプレを **コピペ運用**にする：

```sql
-- 1. テーブル作成
create table public.your_table (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  -- ...
);

-- 2. ロール権限付与（2026-05-30 以降の新規プロジェクトで必須・必ず書く）
grant select on public.your_table to anon;
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;

-- 3. RLS 有効化
alter table public.your_table enable row level security;

-- 4. ポリシー追加
create policy "users can read own rows"
  on public.your_table for select to authenticated
  using (auth.uid() = user_id);

create policy "users can insert own rows"
  on public.your_table for insert to authenticated
  with check (auth.uid() = user_id);
```

### GRANT 漏れ時のエラー

PostgREST は `42501` エラーコードを返し、**エラーメッセージに必要な `GRANT` 文がそのまま含まれる**ので、エラーが出たらそのままコピペで直せる。

```
ERROR:  permission denied for table your_table
HINT:  Run: grant select on public.your_table to anon;
```

### 既存プロジェクトの確認

Supabase ダッシュボード → **Security Advisor** で各プロジェクトの状況を確認できる。

## 関連リソース

- `~/.claude/rules/env-security.md` — `.env` / シークレット情報の取り扱い
- Supabase 公式ドキュメント: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Supabase 公式ブログ: Data API default schema change（2026-05 発表）
