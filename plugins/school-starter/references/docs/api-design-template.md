# API 設計

> Server Actions・Cron ジョブ・outbox パターン・外部 API 連携をまとめる。

**Source of Truth**: [001_requirements.md](001_requirements.md)
**プロジェクトステータス**: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)
**関連タスク**: [{NNN}_task_backlog.md](#{NNN}_task_backlog) の T-50 (メール送信) / T-51 (リマインダー Cron)

---

## Server Actions 一覧

| Server Action | パス | 用途 | 認証要否 |
|--------------|------|------|---------|
| `signupCustomer` | `app/actions/signup.ts` | 顧客 signup（方案 A） | 不要（誰でも登録可） |
| `createReservation` | `app/actions/reservation.ts` | 予約成立 | 認証必須 |
| `cancelReservation` | `app/actions/reservation.ts` | 顧客キャンセル | 認証必須 + 本人 |
| `adminCancelReservation` | `app/actions/admin/reservation.ts` | 管理者キャンセル代行 | admin ロール |
| `markNoShow` | `app/actions/admin/reservation.ts` | ノーショー記録 | admin ロール |
| `withdrawCustomer` | `app/actions/customer.ts` | 退会処理 | 認証必須 + 本人 |
| ... | ... | ... | ... |

---

## 各 Server Action の詳細

### signupCustomer（方案 A）

**入力**: email, name, phone, password

**処理**:
1. 入力バリデーション（zod）
2. `service_role` で `auth.admin.createUser({ email_confirm: false })`
3. customers テーブルに INSERT（user_id 紐付け）
4. `auth.admin.generateLink({ type: 'signup' })` で確認リンク取得
5. Resend で確認メール送信（outbox 経由）
6. 「確認メールをお送りしました」を返す

**エラーハンドリング**:
- メール重複: 「既に登録済みのメールアドレスです」
- Resend 失敗: outbox に `failed` で記録 → 次回 Cron でリトライ

**詳細**:
- セキュリティ: [{NNN}_security_design.md]({NNN}_security_design.md) の「signupCustomer 方案 A」
- DB: [{NNN}_db_schema.md]({NNN}_db_schema.md) の customers / notification_deliveries

### createReservation

**入力**: customer_id, course_id, start_at

**処理**:
1. 認証チェック（自分の customer_id のみ）
2. `pg_advisory_xact_lock(hashtext(start_at::text))` で行ロック
3. アプリ層で重複チェック（reservations + blocked_slots を跨ぎ確認）
4. INSERT（DB 層 EXCLUDE USING gist が同一テーブル内重複を最終防御）
5. 予約番号生成（UUID または `RV-YYYYMMDD-XXXX` 形式）
6. outbox に予約完了メールを INSERT
7. 予約詳細を返す

**エラーハンドリング**:
- ダブルブッキング: 「申し訳ありません。この時間は予約できません」
- DB 制約エラー: 同上

---

## Cron ジョブ

### リマインダーメール送信

**スケジュール**: 毎日 8:00 JST（前日朝）

**実装**: Vercel Cron Jobs（`vercel.json` で設定）+ `app/api/cron/reminder/route.ts`

**処理**:
1. 翌日の `confirmed` 予約を抽出
2. notification_deliveries に未送信の `reminder` レコードを INSERT
3. Resend で順次送信
4. 成功時 `status = sent` / 失敗時 `status = failed`

**べき等性**: notification_deliveries の `(reservation_id, type, target_date)` で UNIQUE 制約 → 重複送信防止

### 予約状態自動更新（completed）

**スケジュール**: 毎日 0:00 JST

**処理**:
1. `confirmed` で `end_at < now()` の予約を抽出
2. `status = completed` に UPDATE

---

## outbox パターン（メール送信のべき等性）

### 問題

- INSERT → Resend 送信 → 失敗時 DELETE のパターンは Process Crash で「送ったか不明」になる

### 解決

**notification_deliveries テーブル**:

```sql
CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid REFERENCES reservations(id),
  type text NOT NULL,  -- 'signup_confirm', 'reservation_complete', 'reminder', 'cancel'
  target_date date,    -- リマインダー対象日（重複防止用）
  status text NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed'
  payload jsonb,       -- 送信内容
  attempts int DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (reservation_id, type, target_date)  -- べき等性キー
);
```

**フロー**:
1. Server Action / Cron で notification_deliveries に `pending` で INSERT（ここで TX commit）
2. 別プロセス（Cron or Server Action 末尾）で `pending` を取得 → Resend 送信
3. 成功時 `status = sent` + `sent_at = now()`
4. 失敗時 `status = failed` + `last_error` + `attempts +1`
5. リトライ Cron で `failed` && `attempts < 3` を再送

**メリット**:
- Process Crash でもメール送信状態が DB に永続化される
- 重複送信を UNIQUE 制約で防止

---

## 外部 API 連携

### Resend

- API Key: `RESEND_API_KEY`（Vercel 環境変数 Sensitive ON）
- From アドレス: `RESEND_FROM_EMAIL`（DNS SPF/DKIM 設定済みドメイン推奨）
- 送信制限: Free プランは月 3,000 通 / 100 通/日

### メールテンプレ

各メール種別の構成要素（要件定義 7.3 参照）:

| 種別 | 件名 | 本文構成要素 |
|------|------|------------|
| signup_confirm | 「[アプリ名] メールアドレスのご確認」 | 確認リンク + 期限 + 問い合わせ先 |
| reservation_complete | 「[アプリ名] ご予約が確定しました」 | 予約番号・日時・場所・キャンセルリンク・問い合わせ先・持ち物 |
| reminder | 「[アプリ名] 明日のご予約のお知らせ」 | 日時・場所・キャンセルリンク・問い合わせ先 |
| cancel | 「[アプリ名] ご予約をキャンセルしました」 | 予約番号・元日時・問い合わせ先 |

---

## バックリンク

- 要件定義: [001_requirements.md](001_requirements.md)
- プロジェクトステータス: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)
- タスクバックログ: [{NNN}_task_backlog.md]({NNN}_task_backlog.md)
- DB 設計: [{NNN}_db_schema.md]({NNN}_db_schema.md)
- セキュリティ設計: [{NNN}_security_design.md]({NNN}_security_design.md)
