# セキュリティ設計

> 認証・認可・RLS・環境変数・法令対応をまとめる。

**Source of Truth**: [001_requirements.md](001_requirements.md)
**プロジェクトステータス**: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)
**関連タスク**: [{NNN}_task_backlog.md](#{NNN}_task_backlog) の T-21 (認証画面)

---

## 認証フロー

### Supabase Auth + signupCustomer 方案 A（lesson-03 で確立）

**問題背景**:
- Supabase Auth の `confirm_email = ON` 設定では、同一リクエスト内 RLS 自己 INSERT が不成立
- → クライアント直接 signup → customers テーブル INSERT は失敗する

**解決策（方案 A）**:
1. Server Action でリクエスト受信
2. `service_role` クライアント経由で `auth.admin.createUser()` を呼び出し
3. 同じく `auth.admin.generateLink()` で確認用リンクを生成
4. Resend で自前メール送信（テンプレ管理しやすく、Supabase 標準メールテンプレを使わない）
5. ユーザーがリンク踏んで認証完了 → セッション確立 → アプリ内フローへ

**実装場所**:
- `app/actions/signup.ts`（Server Action）
- `lib/supabase/admin.ts`（service_role クライアント・サーバーサイドでのみ使用）

### login

- `signInWithPassword`（メールアドレス + パスワード）
- 失敗時は固定エラーメッセージ（「メールアドレスまたはパスワードが正しくありません」）→ ユーザー存在/非存在を区別しない

### パスワード再設定

- `resetPasswordForEmail` でリセットリンクを Resend 経由送信
- リンク踏んで → パスワード変更画面 → 新パスワード保存

---

## 認可ポリシー

### ロール

| ロール | 用途 | 識別 |
|------|------|------|
| customer | 顧客（予約・マイページ） | `auth.users` に登録された一般ユーザー |
| admin | 管理者（管理画面操作） | `app_metadata.role = 'admin'` で識別 |

### admin 判定

```typescript
// middleware.ts または各管理画面の page.tsx で
const { data: { user } } = await supabase.auth.getUser()
if (user?.app_metadata?.role !== 'admin') {
  redirect('/login')
}
```

`app_metadata` はクライアントから書き換え不可（service_role でしか変更できない）→ 安全。

---

## RLS ポリシー詳細

詳細は [{NNN}_db_schema.md]({NNN}_db_schema.md) を参照。要点:

- 全テーブル `ENABLE ROW LEVEL SECURITY`
- 顧客テーブル: 自分のレコードのみ SELECT/UPDATE 可（auth.uid() = user_id）
- 予約テーブル: 自分の予約のみアクセス可
- 管理者は service_role 経由で全件アクセス（管理画面 Server Action 内のみ）

### SECURITY DEFINER 関数の search_path 固定

```sql
CREATE OR REPLACE FUNCTION ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- 固定（lesson-03 Codex 指摘・ハードニング）
AS $$
...
$$;
```

理由: search_path 固定しないと、攻撃者が同名関数を別スキーマに置いて呼び出される可能性。

---

## 環境変数

### .env.local（ローカル開発）

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # サーバーサイドのみ・絶対にクライアント露出しない

# Resend
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@example.com

# その他
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Vercel 環境変数

| 変数名 | Sensitive フラグ | 環境 |
|------|----------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | OFF（公開 OK） | Production / Preview / Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | OFF（公開 OK） | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | **ON 必須** | Production のみ推奨 |
| `RESEND_API_KEY` | **ON 必須** | Production / Preview |
| `RESEND_FROM_EMAIL` | OFF | 全環境 |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` を Sensitive OFF で運用すると、Vercel 内部侵害時に値が読み取られる。**必ず Sensitive ON**。

### 三層防御（lesson-04 で確立）

`.env.local` を守る 3 つの壁:
1. **`.gitignore`**: GitHub に上げない（コミット・push を防ぐ）
2. **`permissions.deny`（Read + Bash）**: Claude に読ませない。`Read(./.env*)` で Read ツールを、`Bash(* .env*)` で `cat .env` 等の Bash 経路を**両方**塞ぐ（Read deny だけだと Bash で読めてしまう公式仕様の穴を埋める）
3. **sandbox**: OS レベルで Bash サブプロセス・MCP 経由まで一律に遮断

> ⚠️ かつて `.claudeignore` を「Claude が読み取らない壁」として挙げていたが、**`.claudeignore` は Claude Code の公式機能ではなく置いても完全に無視される**（公式ドキュメントの `.claude` ディレクトリ構成表に存在しない）。機密ファイルを読ませない本当の壁は `permissions.deny` であり、`.gitignore` はあくまで git 用でセキュリティ境界ではない。

---

## 法令対応

### 要配慮個人情報

要件定義に「健康情報」「既往歴」「ケガ」記述がある場合:

- 個人情報保護法 2 条 3 項の「病歴」に該当する可能性（グレーゾーン）
- 該当しうる前提で**要配慮個人情報相当の保護**を実装する
- 利用目的・保存期間・開示請求・委託先国外移転を明示する

### 利用規約・プライバシーポリシー

- テンプレートをクライアントに提供 → クライアントカスタマイズ
- 弁護士確認は最終的にクライアント責務（要件定義に明記）

### 退会時のデータ扱い

- 個人を特定できる情報は匿名化
- 予約履歴・ノーショー記録は事業継続のため残す
- 詳細は [{NNN}_db_schema.md]({NNN}_db_schema.md) の「退会フロー」セクション

---

## OWASP Top 10 対応

| カテゴリ | 対応 |
|---------|------|
| A01 アクセス制御の不備 | RLS + admin 判定で多層防御 |
| A02 暗号化の不備 | Supabase の暗号化標準 + HTTPS 強制 |
| A03 インジェクション | Supabase クライアント経由（パラメータ化クエリ） |
| A04 不安全な設計 | 要件定義 + Codex レビューで設計時に防ぐ |
| A05 セキュリティ設定不備 | RLS 有効化チェック + Sensitive フラグ ON |
| A07 認証・識別の不備 | Supabase Auth + 失敗時固定エラー |
| A08 ソフトウェアとデータの整合性 | EXCLUDE USING gist + advisory lock |

---

## バックリンク

- 要件定義: [001_requirements.md](001_requirements.md)
- プロジェクトステータス: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)
- タスクバックログ: [{NNN}_task_backlog.md]({NNN}_task_backlog.md)
- DB 設計: [{NNN}_db_schema.md]({NNN}_db_schema.md)
- API 設計: [{NNN}_api_design.md]({NNN}_api_design.md)
