---
name: quality-gate
description: "プロジェクトに『決定論的な品質ゲート』（AIのクセを止める lint ルール・GitHub Actions の自動チェック・秘密情報の見張り・部品の自動更新）を導入するスキル。発火タイミング: (1) project-flow の実装開始前（Phase B6 完了時）に『品質ゲート入りで始めますか』と必ず提案 (2) プロジェクトを初めて GitHub に push する・デプロイの話が出た時点で未導入なら提案 (3) 『セキュリティ大丈夫？』『品質チェックしたい』『CI 入れたい』『APIキー漏れが心配』等の発話 (4) warn-non-null-assertion Hook から『lint 未導入なら quality-gate を提案』と言われたとき。既存・新規どちらのプロジェクトにも後付けできる。Use proactively — 受講生が言い出すのを待たず、Claude 側から提案する。"
---

# quality-gate — 決定論的な品質ゲートの導入

## このスキルが何をするか（受講生に最初に説明すること）

AI にコードを書かせると、書く量が人の確認できる量を超える。そこで「人が気をつける」のではなく、**機械が毎回かならず止める**仕組みを最初に入れる。これを「決定論的（＝毎回必ず同じ結果になる）な品質ゲート」と呼ぶ。

導入するものは4つ。**受講生が新しいコマンドを覚える必要はない**。入れたあとは勝手に働く。

| # | 入れるもの | 何を守るか |
|---|-----------|-----------|
| 1 | ESLint ルール1行 | AI が多用する危険な書き方（`値!`）を書いた時点で止める |
| 2 | GitHub Actions の自動チェック（CI） | push するたびに 型→lint→テスト→ビルド→秘密情報スキャン を全部やり直す。**最終防衛ライン** |
| 3 | コミット前の秘密情報チェック | APIキー・パスワードを **GitHub に送る前に** 止める（送った後では取り消せないため、これだけは CI より手前に置く） |
| 4 | Dependabot（部品の見張り） | 使っているパッケージの弱点を教えてくれて、更新の PR を自動で作る |

**言い方の原則**: 「あとから入れると大変」ではなく「**最初から入れておけば0件**」。受講生はこれから作る側なので、予防の話として前向きに伝える。

## 2層構造（このプラグインの中での位置づけ）

- **Hook（warn-non-null-assertion）** = プラグイン更新だけで全プロジェクトに即日効く「網」。`値!` を書いた瞬間に問い返す
- **このスキルで入れる lint + CI** = 導入したプロジェクトでの決定論的ゲート。網をすり抜けても機械が必ず止める

Hook は補助、lint + CI が本体。両方あって初めて「人の注意力に依存しない」状態になる。

## 提案の仕方

ユーザーが何も言わなくても、発火タイミングが来たら AskUserQuestion で聞く:

> **品質ゲート（自動チェック）を入れてから進めますか？**
> - **入れる（推奨）** — 最初から入れておけば直すものは0件。これから書く全部のコードに効きます
> - **今回は入れない** — あとからでも入れられます（そのぶん直す箇所が溜まります）

「入れる」なら以下を順に実行。**すべて Claude が作業する**。受講生に GitHub CLI（gh）の認証や新しいツールの操作は求めない。push はいつもどおり VS Code のソース管理「↑」ボタンを案内する。

## STEP 1: 現状確認

1. `package.json` を読み、`typecheck` / `lint` / `test` / `build` スクリプトの有無を確認
   - `typecheck` が無ければ `"typecheck": "tsc --noEmit"` を追加（TypeScript プロジェクトの場合）
   - `test` が無ければ CI からテストのステップを外す（コメントで「テストを書いたらこの行を有効化」と残す）
2. `eslint.config.mjs`（または `.eslintrc*`）の有無と、`no-non-null-assertion` の設定状況を確認
3. `.github/` の有無を確認（既に CI がある場合は上書きせず差分提案にする）
4. **既存プロジェクトの場合**: まず `npx eslint` を試し、現在のエラー・警告件数を把握してから入れる（大量に出る場合は下の「既存プロジェクトへの後付け」へ）

## STEP 2: ESLint ルール（AI のクセ止め）

`eslint.config.mjs` に以下を追加する。**FlatCompat（@eslint/eslintrc）経由で eslint-config-next を読む書き方は使わない**（eslint-config-next 16 系で lint 自体が起動しなくなる既知の問題がある。直接 import する）:

```js
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // AI が多用しがちで、型チェック・ビルド・テストをすべてすり抜けて
      // 実行時エラーになる書き方。機械的に禁止する。
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
```

受講生への説明はこう言い換える: 「`値!` は『ここは絶対に値が入っているから心配しないで』という**宣言だけ**の書き方。本当かどうかを誰も確かめていない。型チェックもビルドもテストも通ってしまい、**実際に画面を触ったときに初めて落ちる**。だから機械で禁止する」

## STEP 3: GitHub Actions の自動チェック（CI・最終防衛ライン）

`.github/workflows/ci.yml` を作る。**gitleaks（秘密情報スキャン）は GitHub のサーバー上で動くので、受講生のパソコンに何かをインストールする必要はない**。

```yaml
name: CI

# 品質ゲート。人が手元でコマンドを打つのを忘れても、ここで必ず止まる。
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  check:
    name: 型・lint・テスト・ビルド
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '24' # プロジェクトの Node バージョンに合わせる
          cache: npm

      - name: 依存関係のインストール
        run: npm ci

      - name: 型チェック
        run: npm run typecheck

      - name: lint（警告も許さない）
        run: npx eslint --max-warnings=0

      # テストを書いたら有効化する
      # - name: テスト
      #   run: npm test

      # ビルドに必要な公開系の環境変数（NEXT_PUBLIC_*）はダミー値でよい。
      # 本物の値はデプロイ先（Vercel）が持っており、CI には置かない。
      - name: ビルド
        run: npm run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://dummy.supabase.co
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-anon-key-for-build

  secret-scan:
    name: 秘密情報スキャン（全履歴）
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0 # 過去の履歴もすべて調べる

      - name: gitleaks のインストール
        env:
          GITLEAKS_VERSION: 8.30.1
        run: |
          curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
            | tar -xz -C /usr/local/bin gitleaks
          gitleaks version

      - name: スキャン
        run: gitleaks git --no-banner --redact .
```

調整ポイント:
- `test` スクリプトが実在するならテストのステップを有効にする
- ビルドに他の `NEXT_PUBLIC_*` が必要ならダミー値を足す（**本物の値は絶対に書かない**）
- Supabase を使っていないプロジェクトなら env ごと外す

受講生への説明: 「これは GitHub 側に置く**最終防衛ライン**。あなたが手元でチェックを忘れても、push のたびに GitHub が全部やり直して、問題があれば ❌ を付けて止めてくれる」

## STEP 4: コミット前の秘密情報チェック（ローカル側）

APIキーは**一度 GitHub に push すると取り消しがほぼ不可能**（削除しても履歴に残り、拾われて課金される事故が実際にある）。だから CI（push 後）では間に合わず、**コミットの時点で止める**。ここだけが「原則は CI から」の例外。

受講生環境は Windows もいるため、追加インストール不要の **npm で入る secretlint** を使う（gitleaks の CLI は brew が必要なので CI 側だけで使う）:

```bash
npm install -D husky secretlint @secretlint/secretlint-rule-preset-recommend
npx husky init
```

`.husky/pre-commit` を以下に書き換える:

```bash
# コミット前の秘密情報チェック。
# push した後では取り消せないため、この確認だけは省略できない。
# lint や型チェックはここでは回さない（CI の担当。コミットを軽く保つ）。
files=$(git diff --cached --name-only --diff-filter=ACM)
[ -z "$files" ] && exit 0
if ! echo "$files" | xargs npx secretlint; then
  echo ""
  echo "❌ コミットしようとしている変更に、秘密情報の可能性がある文字列が含まれています。"
  echo "   本物なら: 値を .env.local へ移し、コードからは環境変数で読む"
  echo "   誤検知なら: 調査したうえで .secretlintrc.json に理由つきで除外設定を追記"
  exit 1
fi
```

`.secretlintrc.json`:

```json
{
  "rules": [{ "id": "@secretlint/secretlint-rule-preset-recommend" }]
}
```

`package.json` に `"prepare": "husky"` があることを確認（`husky init` が自動で入れる）。

⚠️ 検出が出たときの鉄則: **無視リストに入れる前に「その値がまだ生きているか」を確認する**。生きている秘密が出たら、無視ではなく**ローテーション（キーの作り直し）**が正解。

## STEP 5: Dependabot（部品の見張り）

アプリは他人が作った部品（パッケージ）を何十個も組み合わせて動いている。部品にあとから弱点が見つかることがあるので、見張りを置く。`.github/dependabot.yml`:

```yaml
version: 2

updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: Asia/Tokyo

    # 新しい版が出ても数日待ってから採用する。
    # パッケージ作者のアカウントが乗っ取られて悪意あるコードが混入した場合、
    # 多くは数日以内に発覚して回収されるため、公開直後に飛びつかなければ避けられる。
    cooldown:
      default-days: 3
      semver-patch-days: 3
      semver-minor-days: 5
      semver-major-days: 7

    # PR が大量に開くと確認が追いつかず放置される。まとめて1本にし、同時に開く数も絞る。
    groups:
      production:
        dependency-type: production
        update-types: [minor, patch]
      development:
        dependency-type: development
        update-types: [minor, patch]
    open-pull-requests-limit: 5

    commit-message:
      prefix: "chore(deps)"
      prefix-development: "chore(deps-dev)"

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
      time: "09:00"
      timezone: Asia/Tokyo
    cooldown:
      default-days: 3
    groups:
      actions:
        patterns: ["*"]
    open-pull-requests-limit: 3
    commit-message:
      prefix: "ci(deps)"
```

あわせて GitHub の画面での設定を1つ案内する（Claude からは操作できないため受講生の1回だけの手作業）:

> GitHub のリポジトリページ → Settings → Advanced Security → 「Dependabot alerts」を **Enable** にしてください。使っている部品に弱点が見つかったときに教えてくれるようになります。

※ Secret scanning（GitHub 純正の秘密情報スキャン）はプライベートリポジトリでは有料プランが必要。**無効にできなくて詰まる必要はない**。その役割は STEP 3 の gitleaks と STEP 4 の secretlint が担っている。

## STEP 6: わざと壊して、ちゃんと止まることを確認する（省略禁止）

入れただけでは「本当に効いているか」が分からない。**必ず3つとも確認する**:

1. **lint が止めるか**: 適当な .tsx に `user!.name` のような `値!` をわざと書く → `npx eslint` が error を出すことを確認 → 元に戻す
2. **秘密情報チェックが止めるか**: 適当なファイルにダミーの秘密をわざと書く → `git add` して `git commit` → pre-commit が ❌ で止めることを確認 → 変更を取り消す（**このコミットは絶対に完了させない**）
   ⚠️ このテストで **AWS 公式ドキュメントの例のキー（`AKIAIOSFODNN7EXAMPLE` 等）を使わない**こと。secretlint は「公式の例」と分かる値を意図的に無視するため、素通りして「効いていない」と誤解する（実測済み）。ランダムに見えるでたらめな文字列（例: `ghp_` + でたらめ36文字の GitHub トークン風）を使う
3. **CI が動くか**: 正常な状態で push（VS Code の「↑」ボタン）→ GitHub の Actions タブに ✅ が付くことを確認

3つとも確認できたら受講生に伝える: 「**今日入れたものは、これから書く全部のコードに効きます**」

## Dependabot の PR が来たらどうするか（受講生向けの運用）

導入すると毎週月曜に「部品を更新しませんか」という PR が届くことがある。慌てなくてよい:

1. **CI が ✅ か見る** — ❌ なら、その更新は今のコードと相性が悪い。マージせず Claude に「この PR で CI が落ちた理由を調べて」と頼む
2. **✅ でも、何が変わるかを Claude に確認させてからマージする** — 「この PR の更新内容と影響を確認して、判断の根拠もコメントで残して」と頼む。**AI に作業させるときは、なぜそう判断したかを残させる**のがコツ（「やりました」だけだと後から検証できない）
3. 特に **0.x 系（バージョンが 1.0 未満）の部品**は小さな更新でも壊れることがあるので、必ず 2. を通す

## 既存プロジェクトへの後付け

既に書いたコードがあるプロジェクトに lint ルールを入れると、既存の違反が検出されることがある。その場合:

1. まず件数を把握（`npx eslint` を実行）
2. **危険な層（画面・API に近いコード）から順に是正**する。運用スクリプトは後回しでよい
3. 全件是正して エラー0・警告0 になってから CI を有効化する（汚れたまま CI を入れると「常に赤い CI」になり、誰も見なくなる）

件数が多くても「これから書く分は最初から0件」なので、直すのは一度だけ。

## このスキルがやらないこと

- コードの中身の脆弱性診断 → `@agent-security-auditor` の担当
- 納品直前の環境・運用チェック（Vercel 設定・RLS 目視等） → `pre-delivery-check` スキルの担当
- Vercel CLI の操作（受講生環境では使わない方針）
- `gh` コマンドによるリポジトリ作成・操作（push は VS Code のボタンで行う）
