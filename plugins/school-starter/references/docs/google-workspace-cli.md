# Google Workspace CLI (gws) — スクール生向けガイド

## いつ使うか
- Google Drive / Sheets / Docs / Gmail / Calendar / Slides / Tasks の操作が必要なとき
- クライアントへの**見積書をGoogleドキュメント化**するとき
- スプレッドシートでデータ管理したいとき
- 全プロジェクトで使えます（一度セットアップすればOK）

## なぜ Composio ではなく gws CLI なのか

| 操作 | おすすめ |
|------|---------|
| **Google Workspace全般** | **gws CLI（こちらを使う）** |
| Notion操作 | Notion MCP |
| Google以外（Slack等） | Composio |

gws CLI のほうが Google サービスに対して安定して動作し、認証も一度で済みます。

## セットアップ手順

### 1. インストール

```bash
npm install -g @googleworkspace/cli
```

インストール確認:
```bash
gws --version
```

### 2. Google Cloud Platform プロジェクトの準備

gws CLI を使うには自分の GCP プロジェクトが必要です。初めての方は以下の手順で:

1. https://console.cloud.google.com/ にアクセス（Googleアカウントでログイン）
2. 「プロジェクトを作成」→ 任意の名前（例: `gws-cli-自分の名前`）
3. 作成したプロジェクトを選択
4. 「APIとサービス」→「ライブラリ」で以下のAPIを有効化:
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Gmail API
   - Google Calendar API
   - Google Slides API

### 3. OAuth認証情報の作成

1. 「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「OAuthクライアントID」
3. アプリケーションの種類: **デスクトップアプリ**
4. 名前: 任意（例: `gws-cli`）
5. 作成後、JSONをダウンロード

### 4. gws CLI の認証

```bash
gws auth login --client-secret ./ダウンロードしたファイル.json
```

ブラウザが開くので Google アカウントでログインして許可。これで認証完了です。

## 基本コマンド

### Google Drive
```bash
# ファイル一覧
gws drive files list --params '{"pageSize": 10, "fields": "files(id,name,mimeType)"}'

# フォルダ作成
gws drive files create --json '{"name":"フォルダ名","mimeType":"application/vnd.google-apps.folder","parents":["親フォルダID"]}'

# ファイルアップロード
gws drive files create --upload ./file.pdf --params '{"name":"ファイル名","parents":"フォルダID"}'

# ファイル情報取得（共有用URL含む）
gws drive files get --params '{"fileId":"ファイルID","fields":"id,name,webViewLink"}'
```

### Google Sheets
```bash
# スプレッドシート作成
gws sheets spreadsheets create --json '{"properties":{"title":"シート名"}}'

# データ読み取り
gws sheets spreadsheets-values get --params '{"spreadsheetId":"ID","range":"Sheet1!A1:D10"}'

# データ書き込み
gws sheets spreadsheets-values update --params '{"spreadsheetId":"ID","range":"Sheet1!A1","valueInputOption":"USER_ENTERED"}' --json '{"values":[["A1","B1"],["A2","B2"]]}'

# 行追加
gws sheets spreadsheets-values append --params '{"spreadsheetId":"ID","range":"Sheet1!A1","valueInputOption":"USER_ENTERED"}' --json '{"values":[["新しい行のデータ"]]}'
```

### Google Docs
```bash
# ドキュメント作成
gws docs documents create --json '{"title":"ドキュメント名"}'

# ドキュメント取得
gws docs documents get --params '{"documentId":"ID"}'
```

### Google Slides
```bash
# プレゼンテーション作成
gws slides presentations create --json '{"title":"タイトル"}'
```

## スクール生向けのよくある使い方

### 見積書をGoogleドキュメント化
1. Claude Code に「`docs/006_estimate.md` をGoogle Docsにして」と頼む
2. Claude Code が gws CLI を使って Google Docs を作成
3. 完了したら共有URLをクライアントに送る

### スプレッドシートでデータ管理
- 顧客リスト・予約データ・在庫管理などを Claude Code に作ってもらえる
- 「○○のデータをスプレッドシートにまとめて」と頼むだけ

## 注意
- `--dry-run` オプションでテスト実行可能
- 認証情報は `~/.config/gws/` に暗号化保存される（安全）
- クライアント案件で使う場合、クライアントのGoogleアカウントで認証することも可能（その場合は別途プロファイル作成）
