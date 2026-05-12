---
name: supabase-connection
description: "Supabase案件で接続・DB操作・スキーマ管理が必要なとき。Supabase MCP は使わず、Supabase CLI + psql or Supabase Studio SQL Editor で進める方針を提供。受講生向けのデータ操作は SQL Editor を第一推奨。トリガー: 「Supabaseに接続」「DBの中身を確認」「テーブルを作成」「マイグレーション」「データを削除」「SQLを実行」「.env.local に SUPABASE_URL を設定」等。"
---

# Supabase 接続・DB操作（MCP不使用方針）

## このスキルを発動する条件

以下のいずれかに該当したら、この方針に従って進める：

- Supabase案件で接続セットアップを行う
- データベースの中身を確認・SQL実行する
- テーブル作成・マイグレーション・スキーマ変更
- `.env.local` に `SUPABASE_URL` / `SUPABASE_ANON_KEY` を設定する

## 基本方針

**Supabase MCP は使わない。Supabase CLI + psql 直接接続で進める。**

### 理由

| 項目 | Supabase MCP | Supabase CLI + psql |
|------|------------|------------------|
| トークン消費（実測） | 1セッション 10.4M tokens | **3.7M tokens（約2.8倍効率）** |
| エラーリトライ | デバッグループに陥りやすい | 構造化エラー出力で一発解決しやすい |
| 出力形式 | JSON（agent向けではない） | --json で構造化、jq/grep可能 |

実証データソース: [@_avichawla の DocuRAG実証実験（2026-04-21）](https://x.com/_avichawla/status/2046500537584218438) / MCPMark V2 ベンチマーク

## セットアップ手順（Supabase案件開始時）

### Step 1: Supabase CLI のインストール

```bash
npm install -g supabase
supabase --version  # インストール確認
```

### Step 2: プロジェクトリンク

```bash
# Supabaseダッシュボードで作成済みのプロジェクトを link
cd プロジェクトディレクトリ
supabase link --project-ref <project-ref>
```

`<project-ref>` は Supabase ダッシュボード Settings → General → Reference ID で確認可能。

### Step 3: psql 直接接続用の DATABASE_URL を取得

Supabase ダッシュボード → Project Settings → Database → Connection string → URI 形式をコピー。

`.env` または `.envrc` に保存（`.gitignore` に必ず入れる）：

```bash
# .env
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

**パスワードに特殊文字（`*/%?@&` 等）が含まれる場合は URL エンコード必須。**

### Step 4: psql 接続テスト

```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

正常に PostgreSQL バージョンが表示されれば OK。

## SQL 実行の使い分け（v1.11.1〜・受講生向け対応で必読）

**目的別に「どの実行手段を使うか」「コピペ先はどこか」を AI が明示する**。受講生は「ターミナル？ブラウザ？どこに貼り付ければいいの？」で詰まりやすいため、曖昧にしない。

### 早見表

| 操作種別 | 第一推奨 | 補助 | 受講生に渡すときの一言 |
|---------|---------|------|---------------------|
| **データ操作**（SELECT / INSERT / UPDATE / DELETE）| **Supabase Studio の SQL Editor**（ブラウザ） | psql | 「ブラウザで Supabase Dashboard → 左サイドバー SQL Editor を開いてください」 |
| **スキーマ変更**（CREATE TABLE / ALTER TABLE 等） | `supabase migration new` + `supabase db push` | — | 「ターミナルで `supabase migration new <名前>` を実行 → 生成されたファイルに SQL を書く → `supabase db push`」 |
| **CSV ダンプ・大量データ・スクリプト処理** | psql 直接接続 | — | 「ターミナルで `psql "$DATABASE_URL"` を実行 → 対話プロンプトで SQL 貼り付け」 |

### IMPORTANT: 受講生向け SQL は Supabase Studio SQL Editor を第一推奨

理由:
- **結果がテーブル表示で見やすい**（psql のテキスト出力より直感的）
- **ブラウザだけで完結**（ターミナル操作に不慣れな受講生でも詰まらない）
- **auth.users 削除等の管理画面操作と同じ画面**で完結する
- **`.env` の `DATABASE_URL` 取得・URL エンコード・接続文字列の理解が不要**（受講生のハードルが一気に下がる）

### YOU MUST: コピペ先を必ず最初に明示する

❌ 悪い例: 「以下を実行してください: `SELECT * FROM customers;`」
（→ 受講生は「どこで実行するの？」で混乱）

✅ 良い例: 「**ブラウザで Supabase Dashboard → SQL Editor を開いて**、以下を貼り付けて Run してください:」
（→ 迷いなく実行できる）

### AI（Claude）が自走で SQL を実行する場合

Claude のサンドボックスは `.env` 読み取り deny + 認証情報 deny のため、**psql 直接接続が deny されるケースがある**。その場合は次のいずれかにフォールバック:

1. **受講生に SQL Editor で実行してもらう**（第一推奨。ちーけんさんに「これを Supabase の SQL Editor に貼ってください」と依頼）
2. supabase CLI のサブコマンド（`db diff` / `db pull` 等）で迂回
3. migration ファイルとして書き出して `supabase db push` で適用（スキーマ変更のみ）

### コマンド例（AI が自走する場合のみ）

```bash
# 直接 psql で実行（サンドボックスが deny した場合は SQL Editor へ切替）
psql "$DATABASE_URL" -c "SELECT count(*) FROM products;"

# ファイルから実行
psql "$DATABASE_URL" -f migration.sql
```

### スキーマ変更（マイグレーション）

```bash
# 新しいマイグレーションファイルを作成
supabase migration new add_users_table

# supabase/migrations/ に SQL ファイルが生成される。編集して中身を書く

# ローカル/リモートに適用
supabase db push
```

### スキーマを取り込み（既存DBから）

```bash
supabase db pull initial_schema --linked
```

### DB の状態確認

```bash
# テーブル統計
supabase inspect db table-stats --linked

# 長時間クエリ
supabase inspect db long-running-queries --linked
```

## やりがちなミス

- **MCP を使ってしまう**: トークン浪費。MCP関連の指示は無視して CLI + psql で進める
- **service_role キーをクライアントに露出**: `NEXT_PUBLIC_*` 環境変数に絶対入れない
- **RLS を有効化していない**: 公開スキーマの全テーブルで `ENABLE ROW LEVEL SECURITY` を必ず有効化
- **パスワードの特殊文字を URL エンコードし忘れる**: `*/%?@&` 等は URLエンコードする
- **`apply_migration` でスキーマ変更**: 履歴がぐちゃぐちゃになる。`db query` または直接 psql で iterate → 完成したら `migration new` でファイル化
- **コピペ先を曖昧にする**（v1.11.1〜追加）: 「以下を実行してください」だけでは受講生は「どこに？」で詰まる。**必ず「ブラウザで Supabase Dashboard → SQL Editor」or「ターミナルで psql プロンプト」**を最初に明示する
- **受講生にいきなり psql を勧める**（v1.11.1〜追加）: ターミナル不慣れな受講生は詰まる。データ操作は **SQL Editor を第一推奨**。psql は AI が自走する場合 or 大量データ処理の場合のみ

## RLS（Row Level Security）必須チェック

納品前に必ず確認：

- [ ] 公開スキーマ（`public`）の全テーブルで `ENABLE ROW LEVEL SECURITY` 有効
- [ ] 適切なポリシーが設定されている（`auth.uid()` ベース等）
- [ ] `service_role` キーがクライアントコード（特に `NEXT_PUBLIC_*`）に露出していない
- [ ] **UPDATE には SELECT ポリシーも必要**（無いと silently 0 rows 更新される）
- [ ] **Views は RLS バイパス**（Postgres 15+ は `WITH (security_invoker = true)` を使う）
- [ ] **Storage upsert は INSERT + SELECT + UPDATE 全部必要**

詳細なセキュリティチェックは Supabase 公式ドキュメントの security ガイドを参照。

## トラブルシューティング

### `supabase link` が失敗する

- `supabase login` を先に実行する
- project-ref が正しいか確認

### psql 接続エラー

- パスワードのURLエンコード忘れ
- IP allowlist の設定（Supabase Settings → Database → Connection Pooling）
- DATABASE_URL の `pooler` 部分のリージョンが正しいか確認（東京なら `aws-0-ap-northeast-1`）

### CLI のバージョンエラー

```bash
supabase --version
# v2.79.0 以下なら CLI を更新
npm update -g supabase
```

## 出典

- 設計根拠: [How to cut Claude Code costs by 3x (using Karpathy's context engineering principles) - @_avichawla](https://x.com/_avichawla/status/2046500537584218438)（2026-04-21）
- 実証データ: MCPMark V2 ベンチマーク
