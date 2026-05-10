---
mode: order_won
current_phase: phase_b5
phase_status: completed
last_updated: YYYY-MM-DD
total_tasks: 0
completed_tasks: 0
---

# [プロジェクト名] - プロジェクトステータス

> このファイルは **3 階層構造のダッシュボード** です。100-200 行を目安に保ち、詳細はリンク先で見ます。

## 📍 現在地

**[現在の Phase] [in_progress | completed]**

### 次のアクション

→ [次にやるべきタスク ID]: [タスク名]（[詳細]([NNN]_task_backlog.md#[task-id])）

> ⚠️ **このフィールドは /clear 耐性の入口です。空欄禁止。**

### 詳細リンク

- 要件定義: [001_requirements.md](001_requirements.md)
- タスク詳細: [{NNN}_task_backlog.md]({NNN}_task_backlog.md)
- DB 設計: [{NNN}_db_schema.md]({NNN}_db_schema.md) ※該当時のみ
- セキュリティ: [{NNN}_security_design.md]({NNN}_security_design.md) ※該当時のみ
- API 設計: [{NNN}_api_design.md]({NNN}_api_design.md) ※該当時のみ

---

## 双方向リンク構造図

```
000_PROJECT_STATUS.md（このファイル・ダッシュボード）
        ↓ 各タスクから「詳細」リンク
{NNN}_task_backlog.md（タスク作業手順）
        ↓ 大型タスクから「関連リンク」
{NNN}_db_schema.md / {NNN}_security_design.md / {NNN}_api_design.md
```

どのファイルからでも他 2 つにジャンプできる構造。

---

## 全体進捗

### Phase B3: 環境構築 (0/N)

- [ ] T-10: Next.js プロジェクトセットアップ → [詳細]({NNN}_task_backlog.md#t-10)
- [ ] T-11: Supabase プロジェクト作成 → [詳細]({NNN}_task_backlog.md#t-11)
- [ ] T-12: マイグレーション実行 → [詳細]({NNN}_task_backlog.md#t-12) → [DB 設計]({NNN}_db_schema.md)
- [ ] ...

### Phase B4: 顧客側機能 (0/N)

- [ ] T-20: LP 実装 → [詳細]({NNN}_task_backlog.md#t-20)
- [ ] T-21: 認証画面 → [詳細]({NNN}_task_backlog.md#t-21) → [セキュリティ]({NNN}_security_design.md)
- [ ] ...

### Phase B5: 管理側機能 (0/N)

- [ ] T-40: 管理ダッシュボード → [詳細]({NNN}_task_backlog.md#t-40)
- [ ] ...

### Phase B6: メール + Cron (0/N)

- [ ] T-50: 予約完了メール送信 → [詳細]({NNN}_task_backlog.md#t-50) → [API 設計]({NNN}_api_design.md)
- [ ] ...

### Phase B7: 受入 + デプロイ (0/N)

- [ ] T-60: DoD チェックリスト消化 → [詳細]({NNN}_task_backlog.md#t-60)
- [ ] T-61: Vercel デプロイ → [詳細]({NNN}_task_backlog.md#t-61)
- [ ] ...

---

## 完了タスク（直近 5 件）

実装が進むたびにここに移動する。古いものは消えていく（直近 5 件のみ表示）。

- ~~T-04: Codex 最終ゲート通過~~（YYYY-MM-DD）
- （まだなし）

---

## 運用ルール

### /clear 耐性
- 「📍 現在地」と「次のアクション」を必ず最新化する
- /clear 後の新セッション Claude はこのファイルを最初に読む

### タスク完了時
- 該当チェックボックスを `[x]` に
- フロントマターの `completed_tasks` を +1
- 「次のアクション」を次のタスクに更新
- 直近 5 件の完了タスクセクションに追記（古いものは押し出される）

### Phase 移行時
- フロントマターの `current_phase` を更新
- `phase_status` を `in_progress` または `completed` に切替

### 新タスク追加時
- このファイルと task_backlog.md の **両方に追加**（双方向リンクを保つ）
- 番号は連番（T-XX）で揃える

### 番号体系（ちーけん流）
- このファイル: **000_PROJECT_STATUS.md**（固定）
- 要件定義: **001_requirements.md**（固定）
- それ以外（task_backlog / db_schema / security_design / api_design 等）: **その時の `docs/` の空き番号** を Claude Code が選ぶ
