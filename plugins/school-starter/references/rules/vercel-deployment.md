---
paths:
  - "**/vercel.json"
  - "**/next.config.*"
  - "**/.vercel/**"
  - "**/*vercel*"
---

# Vercel デプロイ・CLI 方針

このルールは Vercel 関連ファイル（vercel.json / next.config.* / .vercel/）を編集するときだけ自動でロードされます。

## デプロイの基本フロー

GitHub に push → Vercel 自動デプロイ（Vercel ダッシュボードで GitHub リポジトリ連携）。

カリキュラム第8回（Vercelデプロイ回）で詳しく扱います。

## Vercel CLI の使い方

### ✅ 読み取り系コマンドは Claude に使わせて OK

```bash
vercel logs <url>      # 本番エラーのデバッグ
vercel inspect <url>   # デプロイ詳細
vercel ls              # デプロイ一覧
vercel whoami          # ログインユーザー確認
```

→ デプロイ後にエラーが出たとき、Claude にログを見て原因を調べてもらえます。

### 🔴 破壊系・機密系コマンドはブロック済み

以下のコマンドは `settings.json` の deny リストでブロックされています:

```bash
vercel --prod              # 本番デプロイ
vercel deploy --prod
vercel env add|rm|pull     # .env 漏洩防止
vercel rollback
vercel rm
```

**理由:** 本番デプロイの誤発射と `.env` 漏洩を防止するためです。本番デプロイは GitHub の main ブランチへの push をトリガーにするのが安全です。

## 環境変数の扱い

- **シークレット系（API key / token / DB credential 等）は Vercel ダッシュボードで必ず "Sensitive" フラグ ON**
- "Sensitive" 化漏れがあると、Vercel 側のセキュリティインシデント時に値が読み取られるリスクがあります（2026年4月実例あり）
- ローカル `.env*` ファイルは決してコミットしない（`.claudeignore` と `.gitignore` で二重防御済み）

## 関連ルール

- `~/.claude/rules/env-security.md`: .env / シークレット情報の取り扱い全般
