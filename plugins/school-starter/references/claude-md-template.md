# グローバル設定（ぱるぷんてスクール上級コース）

## 基本設定
- **言語**: 日本語で回答
- **コミット**: 日本語でメッセージ

## 開発ルール
- **詳細ルール**: `~/.claude/rules/development.md` を参照
- 開発原則、コード実装前の確認、セキュリティ、テストコマンド、検証ルール

## Plan Mode（計画モード）
- **用途**: 新規アプリ開発、大きな機能追加の前に方針を固める
- **切り替え**: Shift+Tab
- **原則: 計画を承認するまでコードを書かない**

## 技術スタック
- **Node**: 最新LTS
- **パッケージ**: npm（統一）
- **Framework**: Next.js（App Router）
- **UI**: shadcn/ui + Tailwind CSS
- **DB・認証**: Supabase（Auth + Storage + PostgreSQL）
- **デプロイ**: Vercel

## デプロイ
- GitHubにpush → Vercel自動デプロイ
- Vercel CLIは使用しない（安全性重視）

## セキュリティ
- **詳細ルール**: `~/.claude/rules/env-security.md` を参照
- .envファイルはコミットしない
- APIキーはVercel環境変数で管理
- 認証情報をログに出力しない
- **.envの値をチャットに表示しない**（存在確認のみOK）

### Supabase RLS（必須チェック）
- **納品前に必ずRLS設定を確認**する
- 全テーブルで `ENABLE ROW LEVEL SECURITY` が有効か
- 適切なポリシーが設定されているか
- `service_role` キーがクライアントコードに露出していないか

## テスト・検証
- テストコマンド・検証ルールは `~/.claude/rules/development.md` を参照
- 実装完了後は検証コマンドを実行し、エラーがなくなるまで修正すること

## 便利なコマンド
- `/interview` — 要件ヒアリング → 仕様書を自動生成
- `/school-starter:check` — セキュリティ・品質の一括チェック
