# タスクバックログ

> 各タスクの**目的・依存・作業手順・完了条件**をまとめた作業手順書。
> 全体俯瞰は [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md) を見る。

**最終更新**: YYYY-MM-DD
**要件定義**: [001_requirements.md](001_requirements.md)
**プロジェクトステータス**: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md)

---

## 📐 タスク完了の定義（DoD 共通ルール・v1.16.0〜）

**YOU MUST: 各 T-XX の「完了条件 (DoD)」には必ず以下を含める**。書き漏れがあると AI が「テスト通った = 完了」と判断して納品事故に直結する。

### 共通完了条件テンプレート（コピペ用）

```markdown
**完了条件 (DoD)**:
- [ ] 機能要件: <要件定義書の該当項目>
- [ ] 動作確認: <ローカル / dev サーバーで手動操作が成立>
- [ ] テスト: `npm run lint` / `npm run build` が pass（既存テストがあれば `npm test` も）
- [ ] 3 段階レビュー実施（**Phase B5 以降は必須・Phase B3-B4 は規模に応じて**）:
  - [ ] ① `@agent-security-auditor`（OWASP / RLS / 認証観点）
  - [ ] ② `/school-starter:review`（feature-dev:code-reviewer 内部レビュー → 5 回ループ）
  - [ ] ③ Codex 独立レビュー（出力サマリーを別タブにコピペ）
- [ ] 実機検証（**第 4 のレビュー段階・本番デプロイを伴うタスクは必須**）: ブラウザコンソール / Vercel Function Logs / 実環境での体感品質
- [ ] ドキュメント更新: [000_PROJECT_STATUS.md](000_PROJECT_STATUS.md) のチェックボックス + このファイルの状態列を ✅ に
```

### 3 段階レビューを必須化する理由

- **AI 単体の出力は自己評価バイアスがかかる**（同じモデル系統では盲点が残る）
- **「テスト通った」と「動作正しい」は別物**（型は通るが意味は壊れているケースを Codex 軸が独立検出する）
- **環境依存バグ（CSP / フォント / DNS）は静的解析では見えない** → 第 4 のレビュー段階「実機検証」で初発見される

### スキップ判断（タスク規模で簡略化可・ただし Phase B5 以降は不可）

| タスク規模 | 3 段階レビュー | 実機検証 |
|---------|------------|---------|
| **typo / 1 行修正** | ②のみ（review スキル）でよい | 不要 |
| **1-2 ファイル変更** | ②＋③（security-auditor は規模次第） | 必要 |
| **3 ファイル以上 / 認証・RLS・DB スキーマ変更** | **①②③ 全部必須** | 必須 |
| **本番デプロイを伴う / Vercel 環境変数変更** | **①②③ 全部必須** | **必須**（Vercel Function Logs + ブラウザコンソール） |

**Codex 軸予測不能性は文脈単位で発現する** — 触っていないコードでも集約レビューで Medium 級指摘が出ることを実証済み（v1.15.x 開発時の Phase B5 9 タスク連続蓄積）。**「Codex は前タスクで OK だったから今回スキップ」は禁止**。

---

## 📋 全タスク一覧

| ID | Phase | タスク名 | 状態 | 関連ファイル |
|----|-------|---------|------|------------|
| T-10 | B3 | Next.js セットアップ | ⬜ | - |
| T-11 | B3 | Supabase プロジェクト作成 | ⬜ | [DB 設計]({NNN}_db_schema.md) |
| T-12 | B3 | マイグレーション実行 | ⬜ | [DB 設計]({NNN}_db_schema.md) |
| T-20 | B4 | LP 実装 | ⬜ | - |
| T-21 | B4 | 認証画面 | ⬜ | [セキュリティ]({NNN}_security_design.md) |
| T-50 | B6 | 予約完了メール送信 | ⬜ | [API 設計]({NNN}_api_design.md) |
| ... | ... | ... | ... | ... |

---

## Phase B3: 環境構築

### T-10: Next.js プロジェクトセットアップ

**目的**: モックアップを Next.js 16 に移植する土台作り

**依存**: なし

**作業手順**:
1. 既存ファイル退避（`mkdir _next_init_temp` + `mv mockups CLAUDE.md _next_init_temp/`）
2. `npx create-next-app@latest .` 実行（TypeScript / Tailwind / App Router / src-dir / Turbopack）
3. 退避ファイル復元（`mv _next_init_temp/* .` + `rmdir _next_init_temp`）
4. `npm run dev` で localhost:3000（or 3001）起動確認

**完了条件 (DoD)**:
- [ ] `npm run dev` でブラウザに Next.js デフォルト画面が表示される
- [ ] `mockups/` `CLAUDE.md` 等の既存ファイルが残っている
- [ ] `npm run build` が通る

**関連リンク**:
- PROJECT_STATUS: [Phase B3](000_PROJECT_STATUS.md#phase-b3-環境構築)

---

### T-11: Supabase プロジェクト作成

**目的**: DB と認証の土台を準備

**依存**: T-10 完了

**作業手順**:
1. https://supabase.com で新規プロジェクト作成
2. プロジェクト URL と anon key を取得
3. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
4. `npm install @supabase/supabase-js @supabase/ssr`
5. `lib/supabase/client.ts` と `lib/supabase/server.ts` を作成

**完了条件 (DoD)**:
- [ ] Supabase ダッシュボードにアクセスできる
- [ ] アプリから Supabase クライアントが初期化できる

**関連リンク**:
- PROJECT_STATUS: [Phase B3](000_PROJECT_STATUS.md#phase-b3-環境構築)
- DB 設計: [{NNN}_db_schema.md]({NNN}_db_schema.md)

---

### T-12: マイグレーション実行

**目的**: 要件定義通りのテーブル群を作成

**依存**: T-11 完了

**作業手順**:
1. `supabase/migrations/` に DDL ファイルを配置（[DB 設計]({NNN}_db_schema.md) を参照）
2. RLS ポリシーを有効化
3. ローカルテストデータを投入

**完了条件 (DoD)**:
- [ ] 全テーブルが Supabase 上に存在
- [ ] RLS が有効（無効なテーブルは無いこと）

**関連リンク**:
- DB 設計: [{NNN}_db_schema.md]({NNN}_db_schema.md)
- セキュリティ: [{NNN}_security_design.md]({NNN}_security_design.md)

---

## Phase B4: 顧客側機能

### T-20: LP 実装

**目的**: ランディングページを Next.js で実装

**依存**: T-10 完了

**作業手順**:
1. HTML モックを `src/app/(customer)/page.tsx` に移植
2. Tailwind v4 トークンを DESIGN.md と同期
3. 共通コンポーネント切り出し

**完了条件 (DoD)**:
- [ ] localhost で LP が表示される
- [ ] DESIGN.md のトーンと一致

**関連リンク**:
- DESIGN.md: [DESIGN.md](DESIGN.md)

---

### T-21: 認証画面

**目的**: signup / login / 認証メール認証完了の動線を実装

**依存**: T-11 完了

**作業手順**:
1. signup フロー（[セキュリティ]({NNN}_security_design.md) の方案 A 参照）
2. login フォーム
3. メール認証完了画面
4. パスワード再設定

**完了条件 (DoD)**:
- [ ] signup で確認メールが届く
- [ ] メール内リンクで認証完了 → アプリにログイン状態で戻る

**関連リンク**:
- セキュリティ: [{NNN}_security_design.md]({NNN}_security_design.md)
- API: [{NNN}_api_design.md]({NNN}_api_design.md)

---

## Phase B5: 管理側機能

### T-40: 管理ダッシュボード

（フォーマット同上）

---

## Phase B6: メール + Cron

### T-50: 予約完了メール送信

**目的**: 予約成立後に Resend 経由で確認メールを送信

**依存**: T-11, T-12, T-21 完了

**作業手順**:
1. `RESEND_API_KEY` を Vercel 環境変数に設定（Sensitive ON）
2. Server Action から outbox テーブルに INSERT
3. Resend SDK で送信 → outbox status を `sent` に
4. リトライ処理（送信失敗時は `failed` で再キュー）

**完了条件 (DoD)**:
- [ ] 予約成立 → 確認メールが届く
- [ ] outbox に履歴が残る（べき等性）

**関連リンク**:
- API 設計: [{NNN}_api_design.md]({NNN}_api_design.md)（outbox パターン）

---

## Phase B7: 受入 + デプロイ

### T-60: DoD チェックリスト消化

**目的**: 受入テスト全項目を消化

**依存**: 全実装タスク完了

**作業手順**:
1. 要件定義書の DoD セクションを参照
2. 各項目を順に手動テスト
3. 不具合は別タスクとして起票

**完了条件 (DoD)**:
- [ ] 全 DoD 項目に ✅
- [ ] クリティカル不具合ゼロ

---

### T-61: Vercel デプロイ

**目的**: 本番環境へデプロイ

**依存**: T-60 完了

**作業手順**:
1. Vercel プロジェクト作成
2. GitHub 連携 + 自動デプロイ設定
3. 環境変数設定（Sensitive フラグ厳守）
4. 本番ビルド成功確認

**完了条件 (DoD)**:
- [ ] 本番 URL でアプリが動く
- [ ] 環境変数 Sensitive フラグ ON
- [ ] preview デプロイも動く

**関連リンク**:
- セキュリティ: [{NNN}_security_design.md]({NNN}_security_design.md)（環境変数管理）

---

## 運用ルール

- **タスク完了時**: 「全タスク一覧」テーブルの状態列を `⬜ → ✅` に + 000_PROJECT_STATUS.md のチェックボックスも `[x]` に
- **新タスク追加時**: 一覧テーブルと詳細セクションの両方に追加 + 000_PROJECT_STATUS.md にも追加
- **タスク粒度**: 1 タスク = 半日〜2-3 日 / 機能単位（実装単位ではない）
