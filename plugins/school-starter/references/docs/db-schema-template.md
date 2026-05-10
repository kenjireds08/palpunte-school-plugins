# DB スキーマ設計

> Supabase（PostgreSQL）のテーブル設計・DDL・RLS ポリシーをまとめる。

**Source of Truth**: [001_requirements.md](001_requirements.md)
**関連タスク**: [{NNN}_task_backlog.md](#{NNN}_task_backlog) の T-11 (Supabase 作成) / T-12 (マイグレーション)
**プロジェクトステータス**: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)

---

## テーブル一覧

| テーブル名 | 用途 | 主要カラム |
|----------|------|----------|
| customers | 顧客情報 | id (uuid), email, name, phone, ... |
| reservations | 予約 | id (uuid), customer_id, course_id, start_at, end_at, status |
| blocked_slots | 休業時間枠 | id, start_at, end_at, reason |
| notification_deliveries | 通知履歴（outbox） | id, reservation_id, type, status, sent_at |
| ... | ... | ... |

---

## DDL

### customers

```sql
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  name text NOT NULL,
  phone text,
  birth_date date,
  emergency_contact text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- partial unique index: アクティブな顧客のメールのみ unique
CREATE UNIQUE INDEX customers_email_active_unique
  ON customers (email)
  WHERE status = 'active';
```

### reservations

```sql
CREATE TYPE reservation_status AS ENUM (
  'confirmed',  -- 予約確定
  'completed',  -- 実施完了
  'cancelled',  -- キャンセル済
  'no_show'     -- ノーショー
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  course_id text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status reservation_status NOT NULL DEFAULT 'confirmed',
  request_note text,
  reservation_number text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ダブルブッキング防止: EXCLUDE USING gist
ALTER TABLE reservations ADD CONSTRAINT no_overlap_reservations
  EXCLUDE USING gist (
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('confirmed', 'completed'));
```

### 状態遷移表（reservations.status）

```
confirmed → completed   (実施日時を過ぎたら自動更新 or 管理画面から手動)
confirmed → cancelled   (顧客キャンセル or 管理者キャンセル代行)
confirmed → no_show     (実施日時を過ぎても来店無し → 管理画面でチェック)
```

---

## RLS ポリシー

```sql
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- customers: 自分のレコードのみ読み書き可
CREATE POLICY customers_self_select ON customers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY customers_self_update ON customers
  FOR UPDATE USING (auth.uid() = user_id);

-- reservations: 自分の予約のみ
CREATE POLICY reservations_self_select ON reservations
  FOR SELECT USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- 管理者は service_role 経由で全件アクセス可
```

---

## 制約・トリガ

### ダブルブッキング防止

- **DB 層**: `EXCLUDE USING gist` で同一テーブル内の重複時間を拒否
- **アプリ層**: 予約成立直前に `pg_advisory_xact_lock` で行ロック → アプリ層チェック → INSERT
- **理由**: テーブル跨ぎ（reservations と blocked_slots）は EXCLUDE では防げないため、advisory lock 必須

### updated_at 自動更新

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- 他テーブルにも同様
```

---

## 退会フロー

要件定義の「退会時 = 匿名化（氏名連絡先を退会済顧客化・予約履歴とノーショー記録は残す）」に対応。

```sql
-- 1. customers.status を 'withdrawn' に
-- 2. customers.email / name / phone / emergency_contact / birth_date を NULL or "退会済顧客" に
-- 3. auth.users は残す（予約履歴の参照整合性のため）
UPDATE customers SET
  email = NULL,
  name = '退会済顧客',
  phone = NULL,
  birth_date = NULL,
  emergency_contact = NULL,
  status = 'withdrawn'
WHERE id = $1;
```

partial unique index により、複数の退会済顧客が email = NULL でも衝突しない。

---

## バックリンク

- 要件定義: [001_requirements.md](001_requirements.md)
- プロジェクトステータス: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)
- タスクバックログ: [{NNN}_task_backlog.md]({NNN}_task_backlog.md)
- セキュリティ設計（RLS の認可ロジック詳細）: [{NNN}_security_design.md]({NNN}_security_design.md)
