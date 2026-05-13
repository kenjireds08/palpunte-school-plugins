---
name: pre-delivery-check
description: "納品当日・本番デプロイ直前の最終総合チェック（10項目 YES/NO 形式）。コード自体の脆弱性検査（OWASP/RLS/認証）は `@agent-security-auditor` の責務、本スキルはその外側の『環境・運用・引き渡し』の最後の関門を担う。「納品前チェック」「これ納品して大丈夫？」「最後にチェックして」「リリース前確認」「公開して大丈夫？（運用面）」等の発話で発動。Vercel Sensitive flag / .env git 履歴 / npm audit / 本番セキュリティヘッダー / Supabase RLS 目視 / service_role 棚卸し / 規約 URL 動作 / 引き渡しパッケージ / OAuth App 棚卸し / 無料プラン pause 対策 の 10 項目を、PASS / FAIL / 要確認 / N/A の 4 状態で1ステップずつ対話的に確認し、最後にチェックリストレポートを出力する。"
---

# pre-delivery-check スキル — 納品前の総合健康診断 + 引き渡し書類確認

## このスキルの目的

実装が終わったコードを **本番デプロイ・クライアント引き渡しする直前** に、「コードの外側」（環境変数・デプロイ設定・運用ルール・引き渡しパッケージ）を 10 項目チェックする。

メタファー:
- `@agent-security-auditor` = **コードの中身を診る医者**（OWASP / RLS / JWT / 入力検証など脆弱性検査の本気版）
- `pre-delivery-check`（このスキル） = **退院前の総合健康診断 + 引き渡し書類確認**（環境・運用・引き渡しの最終ゲート）

両者は重複しない。コード自体のセキュリティチェックは security-auditor に委ね、本スキルは「設定・運用・書類」に集中する。

## いつ発動するか

以下の発話で自動発動する:

- 「**納品前チェック**」「**最後にチェックして**」「**リリース前確認**」
- 「これ**納品して大丈夫？**」「**公開して大丈夫？**（運用面）」
- 「**本番デプロイ前に**確認したい」「クライアントに**引き渡す前に**見て」
- 「**最終ゲートやって**」「**納品ゲート**」

普段使い（実装中・コミット前）は発動しない。**「納品当日・本番デプロイ直前」のためのスキル**。

## YOU MUST: 先に @agent-security-auditor を案内する

このスキルは **コード自体の脆弱性は見ない**。冒頭で必ず以下を案内する:

```
⚠️ コードの中身（OWASP / 認証 / RLS / 入力検証 / シークレット漏洩）は
   このスキルではなく `@agent-security-auditor` の責務です。

   まだセキュリティ監査をしていない場合、先に以下を実行してください:
     「セキュリティチェックして」 or 「@agent-security-auditor」

   既に実行済み / 並行で進める場合は、このまま 10 項目チェックを始めます。
```

ユーザーが「先に security-auditor」を選んだ場合はそちらに委ねて終了。「並行で進める」または「既に済」を選んだら次のステップへ。

## 起動時の意図確認（1問だけ）

受講生に質問を浴びせない。**1 問だけ聞いて分岐**する:

> 「**今回の納品は次のどちらですか？**」
> 1. **個人開発の納品**（自分用・社内ツール・無料プラン運用）（Recommended）
> 2. **クライアント案件の納品**（受託開発・Pro プラン推奨）

分岐の効果:
- **個人開発** → 項目 10（Supabase pause 対策）を **必須チェック**として扱う / 項目 4 の CSP は推奨扱い
- **クライアント案件** → 項目 10 は「N/A（Pro プラン契約済み）」を推奨し、項目 8（引き渡しパッケージ）+ 項目 4 の CSP を **必須**で厳しめに見る

不明・無回答なら **クライアント案件** をデフォルトにする（厳しい方に倒す）。

---

## 10 項目チェックリスト（1 ステップずつ対話で進める）

**重要な進め方**:
- 一度に 10 項目全部投げない
- **1 項目ずつ「確認方法」を提示 → ユーザーの結果報告を待つ → PASS/FAIL/要確認/N/A を判定 → 次へ**
- 各項目で「**コピペ先**」（ブラウザのどの画面 / ターミナル / SQL Editor / Vercel ダッシュボード / Supabase ダッシュボード）を**最初に明示**する
- 専門用語は使わず**高校生でも分かる言葉**に翻訳（必要なら「一言で言うと」を添える）
- Mac / Windows 両方の手順を併記（差がある場合のみ）

---

### 項目 1: Vercel 環境変数の Sensitive flag が ON か

**一言で言うと**: 「Vercel のダッシュボードに登録した API キーやパスワードに『シークレット扱い』のマークが付いているか」を確認します。これが OFF だと、もし Vercel 側で何かあったときに値が読まれる可能性があります（2026 年 4 月に実際にあった事件の教訓）。

**コピペ先**: **ブラウザで Vercel ダッシュボード → 該当プロジェクト → Settings → Environment Variables**

**確認方法**:
1. ブラウザで https://vercel.com/dashboard を開く
2. 該当プロジェクト → Settings → Environment Variables
3. 一覧の各変数の右端のラベルを確認
4. **以下は必ず "Sensitive" になっているか**:
   - `*_SECRET` / `*_KEY` / `*_TOKEN` / `*_PASSWORD` を含む名前
   - `SUPABASE_SERVICE_ROLE_KEY` / `STRIPE_SECRET_KEY` / `RESEND_API_KEY` 等
   - JWT 署名鍵 / OAuth client secret / DB 接続文字列

**PASS の条件**: 上記対象すべてが Sensitive 化されている

**FAIL の対処**:
1. 該当変数の「…」メニュー → Edit → "Sensitive" のチェックを ON にして Save
2. ⚠️ **Sensitive 化すると以降は値を読み返せなくなる**ので、手元のメモ（パスワードマネージャ）に控えてから ON にする
3. 完了後、本番デプロイを **Redeploy**（環境変数変更は再デプロイで反映）

**注意**: `NEXT_PUBLIC_*` で始まる変数は**ブラウザに露出する前提**なので Sensitive 化不要（してもブラウザコード内では値が見える）。もしシークレットを `NEXT_PUBLIC_*` に入れていたら、それは設計ミス → 変数名を変えて再登録する。

**N/A になるケース**:
- Vercel を使わない案件（さくらインターネット・AWS・Cloudflare Pages 等のみ） → 各プラットフォームの Secret 管理機能で同等チェックを実施
- ローカル開発のみで本番デプロイなし

---

### 項目 2: `.env*` が過去に git にコミットされていないか

**一言で言うと**: API キーが入った `.env` ファイルが**過去のコミット履歴**に紛れていないかチェックします。今は `.gitignore` で除外されていても、**過去 1 回でも push されていたら GitHub の履歴に永久に残る**ので、漏れたキーは全部ローテーション（再発行）が必要です。

**コピペ先**: **ターミナル（VS Code のターミナルでも別ターミナルでも可・プロジェクトフォルダ内）**

**確認方法**:
ターミナルで以下を実行（**追加コミット**だけを抽出して出力を絞る）:

```bash
git log --all --diff-filter=A -- ".env*" ".env"
```

何も出力されなければ OK。何か出たら過去にコミットされたことがあるので詳細を確認:

```bash
git log --all --diff-filter=A -p -- ".env*" ".env" | head -200
```

**PASS の条件**: 1 つ目のコマンドの出力が空（`.env*` が一度も git に追加されたことがない）

**FAIL の対処**（漏れていた場合）:
1. **まず該当 API キーを全部ローテーション**（再発行）— Supabase / Stripe / Resend / OpenAI / GitHub Token 等
2. 新しいキーを Vercel 環境変数（Sensitive 化）に再登録
3. git 履歴からのファイル削除は影響が大きい（共同開発者の手元と衝突）ので、**ちーけんさんに相談してから** `git filter-repo` 等で対応
4. 詳細手順: `~/.claude/docs/security-guide.md` の「インシデント対応」セクション参照

**注意**: `.gitignore` に入っているからセーフ、ではない。`.gitignore` は**今後の追加**を防ぐだけで、**過去にコミットしてしまった履歴**は別途確認が必要。`--diff-filter=A`（Added コミットだけ）で過去の追加履歴を網羅的に検出する。

**N/A になるケース**:
- まだ git init していない / GitHub に push していないプロジェクト（その場合は push 前に必ず `.gitignore` を整える）

---

### 項目 3: `npm audit` の Critical / High が 0 か

**一言で言うと**: 使っているライブラリに「**緊急（Critical）**」「**高リスク（High）**」の既知の脆弱性がないか自動チェックします。

**コピペ先**: **ターミナル（プロジェクトフォルダ内）**

**確認方法**:

```bash
npm audit --audit-level=high
```

Mac / Windows 共通。`pnpm` 使用なら `pnpm audit --prod`、`yarn` なら `yarn audit --level high`。

**PASS の条件**: `found 0 vulnerabilities` または Critical/High が 0 件

**FAIL の対処**:
1. まず自動修正を試す: `npm audit fix`
2. それで直らない場合: `npm audit fix --force`（**破壊的変更を含むのでテスト実行必須**・受講生は怖ければ次の手順へ）
3. 個別パッケージ更新: `npm update <package-name>`
4. **修正後は必ず**: `npm run build` + 動作確認 → 何か壊れていないか確認
5. Critical/High が **3rd-party 依存（自分の直接依存じゃない）** の場合は GitHub の Dependabot か `npm audit` の出力に従う

**N/A になるケース**:
- 純粋な静的サイト（依存パッケージなし）
- まだ実装初期で実質的な依存が `next` / `react` のみ

---

### 項目 4: 本番 URL の HTTPS / セキュリティヘッダー実応答確認

**一言で言うと**: 公開した URL が **HTTPS で動いていて**、ブラウザを守るための **セキュリティヘッダー**（HSTS / X-Frame-Options など）が**実際に返ってきているか**を確認します。「設定したつもり」と「実際に効いている」は違うので、本番 URL を直接叩いて確認します。

**コピペ先**: **ターミナル**

**確認方法**:

```bash
curl -I https://<本番URL>
```

例: `curl -I https://chiken-personal-gym.vercel.app`

返ってきたヘッダーの中に**以下があるか目視**:

| ヘッダー名 | あるべき値の例 | 何のため | 個人開発 | クライアント案件 |
|---------|-------------|---------|--------|---------------|
| `strict-transport-security` | `max-age=31536000` 等 | 次回以降 HTTPS 強制 | 必須 | 必須 |
| `x-frame-options` | `DENY` / `SAMEORIGIN` | クリックジャッキング防止 | 必須 | 必須 |
| `x-content-type-options` | `nosniff` | MIME タイプ詐称防止 | 必須 | 必須 |
| `referrer-policy` | `strict-origin-when-cross-origin` 等 | リファラ漏洩防止 | 必須 | 必須 |
| `content-security-policy` | `default-src 'self'` 等 | XSS 防止 | **推奨** | **必須** |

**Windows**: PowerShell で `curl.exe -I https://<本番URL>` （`curl` だけだと PowerShell の別エイリアスが当たることがある）

**PASS の条件（個人開発）**: 上記必須 4 ヘッダーが設定されている（CSP は推奨だが無くても PASS 扱い可）

**PASS の条件（クライアント案件）**: 上記 5 ヘッダー全部が設定されている（**CSP も必須**・XSS 攻撃が成立すると預かるユーザーデータが漏れるリスク）

**FAIL の対処**:
- Next.js の場合: `next.config.js` の `headers()` に追加 → 再デプロイ
- CSP は誤設定で本番サイトを壊しやすいので、Report-Only モード（`Content-Security-Policy-Report-Only` ヘッダー）から始めて挙動を確認 → 問題なければ強制モードに切替
- 設定例は `~/.claude/docs/security-guide.md` 参照

**N/A になるケース**:
- まだ本番デプロイしていない（その場合はそもそも納品前ではないので、このスキルを止めて先にデプロイへ）

---

### 項目 5: Supabase ダッシュボードで全テーブルの RLS が ON か（目視）

**一言で言うと**: データベースの**全テーブル**で「ログインしているユーザーしか自分のデータを見られない」というロック（RLS = Row Level Security）が ON になっているか、**ブラウザの管理画面で目視確認**します。migration ファイルで `ENABLE ROW LEVEL SECURITY` を書いていても、**手動でテーブルを追加していた場合などに ON し忘れる**ことがあるので、最終確認は目視。

**コピペ先**: **ブラウザで Supabase Dashboard → 該当プロジェクト → Authentication → Policies**（または Table Editor で各テーブルのアイコンを確認）

**確認方法**:
1. https://supabase.com/dashboard → 該当プロジェクト
2. 左サイドバー: **Authentication → Policies**
3. テーブル一覧が出る。各テーブル名の横の **緑 "RLS enabled"** or **赤 "RLS disabled"** を目視確認
4. すべてが **RLS enabled** になっているか確認

**PASS の条件**: `public` スキーマの全テーブルが RLS enabled

**FAIL の対処**:
- RLS disabled のテーブルがあったら **Table Editor** でそのテーブルを開く → 上部 **"Enable RLS"** をクリック
- ただし RLS だけ ON にして**ポリシーが 0 件**だと**全データが読めなくなる**ので、必ずポリシーをセットで追加
- ポリシー設計は `@agent-security-auditor` に「`<テーブル名>` の RLS ポリシーを設計して」と依頼するのが安全

**N/A になるケース**:
- Supabase を使わない案件(Turso / Firebase / 自前 Postgres など)→ 各 DB の権限設定を別途確認
- `public` スキーマを使わずプライベートスキーマだけで運用している（稀）

**補足**: コード側 RLS の妥当性チェック（ポリシー設計が正しいか）は `@agent-security-auditor` の責務。このスキルでは「ON / OFF の目視」だけを担当する。

---

### 項目 6: 不要な `createSupabaseAdminClient` / service_role 利用箇所の棚卸し

**一言で言うと**: **管理者権限（service_role）でデータベースを叩いている箇所**が、本当に管理者権限が必要なところだけに絞られているか確認します。これが普通のユーザー機能で使われていると、RLS（項目 5）が**実質効かない**状態になります。

**コピペ先**: **ターミナル（プロジェクトフォルダ内）**

**確認方法**:

```bash
grep -rn "createSupabaseAdminClient\|service_role\|SERVICE_ROLE_KEY" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  app/ lib/ pages/ src/ 2>/dev/null
```

Windows（PowerShell）:

```powershell
Get-ChildItem -Recurse -Include *.ts,*.tsx,*.js,*.jsx | `
  Select-String -Pattern "createSupabaseAdminClient|service_role|SERVICE_ROLE_KEY"
```

**PASS の条件**: ヒットした箇所が**以下のいずれかに限定**されているか目視:
- サインアップ処理（auth.users INSERT を含む処理）
- cron / バッチ処理（ユーザーセッションを持たない処理）
- 管理者専用 API ルート（ロール検証済み）
- 退会 / アカウント削除 RPC

**FAIL の対処**:
- 一般ユーザー画面・公開 API で service_role が使われていたら、通常の `createSupabaseServerClient`（anon key + RLS）に書き換える
- どうしても service_role が必要なロジックは、**サーバーサイド限定 + ロール検証ガード**を必ず入れる

**注意**: 値そのものをチャット・ログ・コミットメッセージに**絶対出さない**。grep の出力に値が混ざっていたらマスクする。

**N/A になるケース**:
- Supabase を使わない案件
- そもそも service_role キーを `.env` に登録していない（= 一度も使っていない）

---

### 項目 7: プライバシーポリシー / 利用規約 URL の動作確認

**一言で言うと**: フッターやサインアップ画面に貼った **プライバシーポリシー・利用規約のリンク**が、ちゃんと開けるか・空ページや 404 になっていないかを確認します。クライアント案件では特に必須。

**コピペ先**: **ブラウザで本番 URL を開いて目視 + ターミナルで疎通確認**

**確認方法**:
1. 本番サイトをブラウザで開く
2. フッター / サインアップ画面 / フッターメニューにあるリンクを**すべてクリック**
3. 各リンクで以下を確認:
   - ページが開く（404 / 500 が出ない）
   - 中身がある（空ページ / "TODO" のままになっていない）
   - 日付（最終更新日）が古すぎない
4. ターミナルで疎通確認:

```bash
curl -I https://<本番URL>/privacy
curl -I https://<本番URL>/terms
```

**PASS の条件**: すべてのリンクが 200 で返り、中身が空ではない

**FAIL の対処**:
- 404 → ページ作成（`app/privacy/page.tsx` 等）
- 空ページ → 必要事項を埋める。テンプレートが必要なら「プライバシーポリシーの雛形を作って」と Claude に依頼
- リンク先 URL が誤記 → 該当箇所を修正

**N/A になるケース**:
- 個人開発の社内ツール / 自分用ツール（外部ユーザーに公開しない）
- まだプライバシーポリシーが必要な機能（決済・個人情報収集）を入れていない MVP

---

### 項目 8: クライアント引き渡しパッケージ確認

**一言で言うと**: **クライアントに引き渡す書類が揃っているか**を確認します。「コードを納品して終わり」ではなく、クライアントが**自分で運用・修正・引き継ぎできる状態**になっているかが本質。

**コピペ先**: **エディタ（VS Code）で README.md を開く + ターミナルで一覧確認**

**確認方法**:

ターミナルで以下を確認:

```bash
ls -la README.md docs/handover.md 2>/dev/null
```

README.md（または別途の引き渡し文書）に以下が**全部**書かれているか目視:

| 項目 | 何のため |
|------|---------|
| **必要な環境変数一覧**（`.env.example` と整合） | クライアントが Vercel を別アカウントに移管したくなったとき |
| **デプロイ手順**（Vercel への接続 / 環境変数登録 / Custom Domain） | 引き継ぎ先で再現できるように |
| **DB バックアップ方法**（Supabase の場合は Backups タブの説明） | データ消失リスク対策 |
| **緊急連絡先**（ちーけんさん or サポート窓口） | 何か起きたとき誰に連絡するか |
| **無料プランの制約**（該当時のみ・項目 10 と連動） | 「動かなくなった」と連絡が来る前の予防線 |
| **ログイン情報**（管理者アカウント / Supabase / Vercel） | 安全な渡し方は別途（パスワードマネージャ共有等） |

**PASS の条件**: 上記 6 項目のうち**該当するもの全部**が文書化されている

**FAIL の対処**:
- 不足項目を README.md に追記
- ログイン情報は README に書かず、**1Password / Bitwarden の Secure Note 共有** か **暗号化 zip + 別チャネル**で渡す（チャットに平文で貼らない）

**注意**: README は **GitHub に push される前提**。ログイン情報・API キーは README に**絶対書かない**。

**N/A になるケース**:
- 個人開発（自分が運用するので引き渡しなし）
- ただし「**未来の自分**」も引き継ぎ先と考えれば書いておいた方が安全

---

### 項目 9: OAuth App 棚卸し（Vercel / GitHub / Google 連携アプリ）

**一言で言うと**: GitHub / Vercel / Google など各種サービスで **「このアプリにアクセス許可していますよ」リスト**を見直して、**使ってない or 過剰権限のアプリを削除**します。AI ツールに勢いで全権限を渡したまま放置していると、そのツールが侵害されたときに巻き添えになります。

**コピペ先**: **ブラウザで以下 3 つのページを順に開く**

**確認方法**:

1. **GitHub OAuth Apps**: https://github.com/settings/applications
   - 「Authorized OAuth Apps」と「Authorized GitHub Apps」のリストを確認
   - 使ってない / 何かわからないアプリ → **Revoke**
   - 残すアプリも **必要な最小権限**か確認

2. **Google アカウント連携**（個人 / 個人 Google Workspace 共通）: https://myaccount.google.com/permissions
   - 業務用 Google アカウントで AI ツール（ChatGPT / Claude / Composio / Zapier 等）に Drive / Gmail / Calendar の**フルアクセス**権限を渡していないか確認
   - 不要なものは **アクセス権を削除**
   - **組織管理の Google Workspace**（企業契約・受講生が組織のメンバーとして使う場合）の場合は、**管理者が** https://admin.google.com → セキュリティ → API のコントロール → アプリのアクセス制御 で組織全体のサードパーティアプリを管理できる。受講生個人で使う範囲では `myaccount.google.com/permissions` で十分

3. **Vercel Integrations**: https://vercel.com/account/integrations
   - 接続している外部サービス（GitHub / Slack / Supabase 等）が **最小権限**で接続されているか

**PASS の条件**:
- 心当たりのない / 使っていない連携が **0 件**
- 業務用 Google アカウントで AI ツールに過剰権限が**ない**

**FAIL の対処**: 不要なものをすべて Revoke / 削除。半年に 1 回の棚卸しをカレンダーに設定すると安全。

**N/A になるケース**:
- 連携している外部サービスがそもそもない（学習用プロジェクトのみ）

---

### 項目 10: Supabase 無料プラン 7 日 pause 対策（個人開発のみ）

**一言で言うと**: Supabase の**無料プラン**は **7 日間アクセスがないと DB が一時停止**します。一時停止中は普通にアクセスしてもエラーになります。個人開発で長期間放置するなら、**定期的に自動アクセスする仕組み**（keep-alive cron）を入れます。

**コピペ先**: **状況により分岐**（下記）

**この項目は分岐**:

#### 「個人開発」を選んだ場合（必須チェック）

**確認方法**:

**選択肢A: GitHub Actions で cron**（推奨）

```yaml
# .github/workflows/supabase-keepalive.yml
name: Supabase Keep-Alive
on:
  schedule:
    - cron: '0 */72 * * *'  # 3日に1回
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST root
        run: |
          curl -s -o /dev/null -w "%{http_code}\n" \
            "${{ secrets.SUPABASE_URL }}/rest/v1/" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

**より確実にしたい場合**（実際の DB クエリを発生させる）: 既存テーブルへの軽量 SELECT を発行する。例:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "${{ secrets.SUPABASE_URL }}/rest/v1/<テーブル名>?select=id&limit=1" \
  -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

※`SUPABASE_URL` / `SUPABASE_ANON_KEY` は GitHub の Repository secrets に登録（Settings → Secrets and variables → Actions）。

**選択肢B: Vercel Cron**（Vercel Pro 以上）

**選択肢C: そもそも Supabase Pro プランに上げる**（$25/月・クライアント案件は基本これ）

**PASS の条件**: A / B / C のいずれかで pause 対策ができている

**FAIL の対処**: 上記のいずれかを設定する

#### 「クライアント案件」を選んだ場合

**推奨対応**: クライアントに **Supabase Pro プラン契約**（$25/月）を提案して、無料プラン pause 問題自体を発生させない。引き渡しパッケージ（項目 8）に「**Supabase は Pro プラン必須**」の理由と契約方法を明記。

**この場合の本項目の判定**: **N/A（Pro プラン契約済み）** または **要確認（クライアントと契約形態を相談中）**

**注意**: Supabase 公式に「これを叩けば必ず pause 解除」という決定的なエンドポイント名のドキュメントは存在しない。`/rest/v1/` への anon key 付き GET（PostgREST ルート）が最も広く使われる慣習。より確実にしたい場合は実際の SELECT クエリを発行する。

---

## 最終レポート出力フォーマット

10 項目すべてのチェックが終わったら、以下の形式でレポートを出力する:

````markdown
---

## 📋 納品前チェックリスト最終レポート

**プロジェクト**: <プロジェクト名>
**実施日**: YYYY-MM-DD
**納品種別**: 個人開発 / クライアント案件
**実施者**: <受講生名>

| # | 項目 | 状態 | メモ |
|---|------|------|------|
| 1 | Vercel 環境変数 Sensitive flag | ✅ PASS / ❌ FAIL / ⚠️ 要確認 / ➖ N/A | 例: SUPABASE_SERVICE_ROLE_KEY のみ要確認 |
| 2 | .env* git 履歴漏れ | ✅ / ❌ / ⚠️ / ➖ | |
| 3 | npm audit (Critical/High) | ✅ / ❌ / ⚠️ / ➖ | 例: 0 vulnerabilities |
| 4 | 本番 HTTPS / セキュリティヘッダー | ✅ / ❌ / ⚠️ / ➖ | 例: HSTS / X-Frame / nosniff / Referrer + CSP（クライアント案件は必須） |
| 5 | Supabase RLS 全テーブル ON | ✅ / ❌ / ⚠️ / ➖ | |
| 6 | service_role 利用箇所棚卸し | ✅ / ❌ / ⚠️ / ➖ | 例: signup / cron のみ |
| 7 | プライバシーポリシー/利用規約 URL | ✅ / ❌ / ⚠️ / ➖ | |
| 8 | 引き渡しパッケージ | ✅ / ❌ / ⚠️ / ➖ | |
| 9 | OAuth App 棚卸し | ✅ / ❌ / ⚠️ / ➖ | |
| 10 | Supabase 無料プラン pause 対策 | ✅ / ❌ / ⚠️ / ➖ | 例: Pro プラン契約済みなので N/A |

### 集計
- ✅ PASS: N/10
- ❌ FAIL: N/10
- ⚠️ 要確認: N/10
- ➖ N/A: N/10

### 判定
🟢 **納品 GO**: FAIL 0 件 / 要確認 0 件
🟡 **要修正後納品**: FAIL あり or 要確認あり → 下記対処後に再実行
🔴 **納品 NG**: FAIL が 3 件以上 → 全体の見直しを推奨

### 残作業（FAIL / 要確認 がある場合のみ）
- [ ] 項目 N: 対処内容（〆切日）
- [ ] 項目 N: 対処内容

### 並行確認したいもの
- [ ] `@agent-security-auditor` のレポート結果との突き合わせ
- [ ] `/school-starter:review` で 2 段階レビュー（Codex 独立レビュー）の済 / 未済

---
````

このレポートは**コピペで Notion / Google Docs / クライアント報告**にそのまま使えるように Markdown 表形式で出力する。

## 受講生への最終案内

レポート出力後、以下を必ず表示する:

```
✅ 納品前チェック完了（10 項目）

📋 次のステップ:
- 🟢 GO 判定 → 本番デプロイ → クライアント納品 (or 公開) へ
- 🟡 要修正 → 上記「残作業」を上から対処 → このスキルを再実行（「もう一度納品前チェック」）
- 🔴 NG → 一旦止まって `@agent-security-auditor` のフル監査も併せて実施

【関連スキル】
- コード自体のセキュリティ: `@agent-security-auditor`
- 2 段階レビュー（同一モデル盲点 + Codex 独立レビュー）: `/school-starter:review`
- 引き渡し書類作成: README.md / docs/handover.md を Claude に依頼

【記録のすすめ】
このチェックで発見した新しい落とし穴・対処パターンがあれば、
次回以降の自分のために `/learn` で `~/.claude/docs/best-practices.md` に保存しましょう
（自動発火する設計）。
```

## やりがちなミス（受講生がハマる落とし穴）

1. **項目 1 で `NEXT_PUBLIC_*` まで Sensitive 化してしまう** — `NEXT_PUBLIC_*` は**ブラウザに露出する前提**なのでそもそも Sensitive 化不要・してもブラウザコード内では値が見える。**シークレットを `NEXT_PUBLIC_*` に入れている**ことが本当の問題（その場合は変数名を変えて再設計）

2. **項目 2 で「`.gitignore` に入っているからセーフ」と判断する** — `.gitignore` は**今後の追加**を防ぐだけで、**過去にコミットしてしまった履歴**は別途確認が必要。`git log --all --diff-filter=A` で必ず過去の追加コミットを見る

3. **項目 4 のヘッダー確認で `curl` ではなくブラウザの DevTools で見て満足する** — ブラウザは**キャッシュやプロキシで誤った結果**を見せることがある。必ず `curl -I` で**素のレスポンス**を見る

4. **項目 5 で migration の `ENABLE ROW LEVEL SECURITY` が走ったから OK と判断する** — 手動で Table Editor から後付けで作ったテーブル / 一部 migration の失敗で適用漏れ等を**ダッシュボードの目視**で必ず最終確認

5. **項目 8 でログイン情報を README にベタ書きする** — README は **GitHub に push される前提**。ログイン情報・API キーは README に**絶対書かない**。パスワードマネージャ共有 or 別チャネル

## 関連スキル / サブエージェントとの連携

| 連携先 | 役割分担 |
|-------|---------|
| `@agent-security-auditor` | **コード本体の脆弱性**（OWASP / RLS ポリシー妥当性 / 認証 / 入力検証）。**先に走らせる**のが推奨 |
| `/school-starter:review` | **コードレビュー 2 段階**（feature-dev:code-reviewer + Codex 独立レビュー）。コード変更が大きい納品ではこのスキルの前に実行 |
| `/school-starter:learn` | このチェックで見つけた新しい落とし穴を `~/.claude/docs/best-practices.md` / `error-solutions.md` に自動還元（v1.13.0 重複検知強化済み） |
| `/school-starter:supabase-connection` | 項目 5 / 項目 6 の Supabase 操作で迷ったら参照（SQL Editor 第一推奨ルール） |

## 設計方針

- **重複回避の徹底**: コード脆弱性は `@agent-security-auditor` に完全に委ね、本スキルは「**設定・運用・引き渡し**」だけを見る
- **1 ステップずつ対話運用**: 10 項目を一気に投げず、各項目で受講生の結果を待ってから次へ
- **コピペ先を必ず最初に明示**: 「ブラウザで〜」「ターミナルで〜」「Supabase Dashboard で〜」を冒頭に書く
- **PASS / FAIL / 要確認 / N/A の 4 状態**: 「絶対 OK」「絶対 NG」だけだと現実に合わない（個人開発 / クライアント案件で N/A になる項目がある）
- **個人開発 / クライアント案件で分岐**: 項目 10（pause 対策）・項目 8（引き渡しパッケージ）・項目 4（CSP）の重みが変わる
- **Mac / Windows 両対応**: コマンドが違う箇所のみ併記。共通箇所は1度だけ書く
- **専門用語に必ず「一言で言うと」**: 受講生は非エンジニア前提

## 出典・根拠

- 項目 1: 2026 年 4 月 Vercel セキュリティインシデント教訓（`~/.claude/docs/vercel-security-checklist.md`）
- 項目 2: `~/.claude/rules/env-security.md` + `~/.claude/docs/security-guide.md`「インシデント対応」
- 項目 5・6: `~/.claude/skills/supabase/SKILL.md` + `~/.claude/rules/supabase-security.md`
- 項目 9: ちーけん グローバル CLAUDE.md「サードパーティ AI ツールへの Google OAuth 認可」
- 項目 10: `palpunte-school/CLAUDE.md`「Supabase 無料プラン 7 日 pause 対策」+ コミュニティ慣習（公式に決定的エンドポイントは無い）
- 全体構成: lesson-07-notes 2026-05-13 で明文化した 10 項目チェックリスト
