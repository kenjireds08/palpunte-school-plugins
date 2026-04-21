# グローバル設定（ぱるぷんてスクール上級コース）

## 基本設定
- **言語**: 日本語で回答
- **コミット**: 日本語でメッセージ

## CLAUDE.md の書き方メモ（受講生向け・豆知識）

このファイル（CLAUDE.md）はClaudeに読ませる「指示書」。書き方のコツを知っておくと遵守度が上がる。

- **守らせたいルールには `IMPORTANT:` を付ける** — 例: `IMPORTANT: APIキーをチャットに表示しないこと`
- **絶対に守らせたいルールには `YOU MUST` を付ける** — 例: `YOU MUST run tests before committing`
- **英語の強調語（IMPORTANT / YOU MUST / DO NOT / NEVER）は日本語文中でも有効**。Anthropic公式の推奨テクニック
- **注意点**: 乱用すると効果が薄れる。「これは絶対譲れない」というルールだけに付ける（1ファイルに2〜3個が目安）
- **役に立つ場面**: `.env`の値を出力しない・本番DBを消さない・テストを弱めない等、事故防止系のルール
- **サイズ目安**: CLAUDE.md は **200 行以下** が公式推奨（Anthropic Docs）。超えると遵守率が下がるので、詳細は `.claude/rules/` か外部 `.md` ファイルに分割し、本ファイルからは `@path/to/file.md` で参照する
- **`@path` インポート構文**: 「`~/.claude/rules/development.md` を参照」と自然言語で書くより、`@~/.claude/rules/development.md` と書く方が**起動時に明示的に展開・読み込み**される（公式推奨パターン）。相対/絶対パス両方OK・最大5ホップまで再帰インポート可
- **HTML コメントは Context に注入されない**: `<!-- ... -->` で囲まれた部分はコンテキスト注入前に削除されるため、人間メンテナ向けのメモを Context 消費なしで残せる（コードブロック内の `<!-- -->` は保持される）
- **`.claude/rules/*.md` の `paths:` フィールド**: ルールファイルを特定パス編集時のみ読み込ませたい場合、frontmatter に `paths: ["src/api/**/*.ts"]` 等を書くと、対象ファイルを開いたときだけルールが効いて Context を節約できる（school-starter の `test.md` がこの活用例）
- **スキルの使うタイミングを CLAUDE.md に書く**: スキルが思った場面で発動しないときは、CLAUDE.md に「UI実装時は `frontend-design` スキルを使うこと」「コミット前は `review` スキルでレビューすること」のように明示すると自動発動率が上がる（DLab記事「スキル作りのコツ5」）。Anthropic 公式の段階的開示は description のキーワードマッチに依存しているため、CLAUDE.md からの明示的な誘導が補助になる
- **自作スキルの `SKILL.md` は 500 行以下が公式推奨**: 詳細なリファレンス・長いスクリプト・テンプレート出力例は `references/`（参考資料）/ `scripts/`（実行ツール）/ `assets/`（テンプレート画像）に分割し、`SKILL.md` から参照させる。`SKILL.md` に何でも詰め込むとスキルの効力が下がる
- **自作スキルの `description` は 250 文字以内**: 公式が 250 文字でキャップする（コンテキスト節約のため）。**主要なユースケース・トリガーフレーズを冒頭に**書く（例: 「コードレビューして」「レビューお願い」など、ユーザーが自然に言うキーワード）。これがスキル自動発動の鍵

## 自作 Hook の基本（受講生向け・最低限知識）

Hook はツール実行前後やセッション開始時など特定タイミングで自動実行されるシェルコマンド・HTTPエンドポイント。受講生が独自の自動化を仕込みたくなったときの最低限知識。

- **配置場所 6 種類**: `~/.claude/settings.json`（マシン全プロジェクト共通）/ `.claude/settings.json`（プロジェクト固有・Git 共有可）/ `.claude/settings.local.json`（プロジェクト固有・gitignored）/ 管理ポリシー設定（組織全体）/ プラグインの `hooks/hooks.json`（プラグイン有効時）/ スキル・サブエージェントのフロントマター
- **主要イベント**: `SessionStart`（開始時）/ `UserPromptSubmit`（受講生発話）/ `PreToolUse`（ツール実行前・ブロック可）/ `PostToolUse`（ツール実行後）/ `PreCompact`（/compact 実行前）/ `Stop`（応答完了時）/ `SessionEnd`（終了時）
- **マッチャーパターン**: `"Bash"`（完全一致）/ `"Edit|Write"`（パイプ区切り）/ `"mcp__.*"`（正規表現で MCP 全部）/ 省略 or `"*"` で全マッチ
- **`if` フィールドで絞り込み**: `if: "Bash(rm -rf *)"` のように権限ルール構文で更にフィルタ可能（例: rm -rf を含む Bash のみ反応）
- **exit code 2 で blocking**: コマンド Hook で実行を止めたいとき、stderr に理由を出して `exit 2` で返す。exit 1 は non-blocking なので使用禁止
- **JSON 出力で構造化決定**: `{hookSpecificOutput: {hookEventName: "...", additionalContext: "...", permissionDecision: "deny"}}` のように JSON を stdout に書くと AI 側のコンテキストに inject できる
- **Hook はセキュリティの「最後の保険」**: 多層防御の 1 つに過ぎない。CLAUDE.md ルール・rules・サブエージェント・受講生の目視確認とセットで成り立つ。Hook 単体に頼り切らない

詳しくは Anthropic 公式 https://code.claude.com/docs/ja/hooks を参照（school-starter の `hooks/hooks.json` と `scripts/*.js` も読み参考にできる）。

## Settings / Permissions の使いこなし（受講生向け最低限）

Claude Code の「どのツールを何のときに使わせるか」は `~/.claude/settings.json`（ユーザー設定）や `.claude/settings.json`（プロジェクト設定）で制御する。`/school-starter:setup` で基本セットは配置済みだが、受講生自身で**確認・編集する最低限の知識**をまとめておく。

### `/permissions` — 有効な権限ルールを可視化する

入力欄に `/permissions` と打つと、**現在有効な allow / ask / deny ルールを一覧表示**してくれる。各ルールがどの settings.json ファイルから来ているかも表示されるため、「deny を追加したはずなのに効いていない」状況のデバッグに最速。以下のケースでまず打つ:

- deny リストが本当に効いているか確認したい
- 自分で編集した allow / deny が有効になっているか確認したい
- 引き継ぎリポジトリで「なぜか特定コマンドが弾かれる / 通る」原因を探したい

### `/status` — 設定ソース（スコープ）を確認する

入力欄に `/status` と打つと、どのスコープ（User / Project / Local / Managed）の settings.json が読み込まれているか、各ファイルのパス付きで表示される。`/permissions` と組み合わせて「どのファイルを編集すれば効くのか」が一発でわかる。設定ファイルに JSON エラーがあれば問題も報告してくれる。

### `$schema` — VS Code で settings.json 編集を事故らせない

`settings.json` の先頭に以下を入れておくと、VS Code や Cursor で編集するときに **オートコンプリートとインライン検証**が効く。タイプミスや存在しないキー指定を即座に気づけるので、手動編集事故の予防になる:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": { ... }
}
```

`/school-starter:setup` で自動的に追加される。自分で作ったプロジェクト設定ファイル（`.claude/settings.json`）にも入れておくと便利。

### 権限モード4種の使い分け（受講生が触るのはこれだけ）

Shift+Tab でサイクル切り替え。現在のモードはステータスバーに表示される。

| モード | 挙動 | 使うタイミング |
|--------|------|--------------|
| `default` | 各ツールの最初の使用時にプロンプト。**デフォルト・推奨** | 機密作業・初めてのフォルダ・日常の開発 |
| `acceptEdits` | ファイル編集と `mkdir`/`touch`/`mv`/`cp` を自動承認（Bash コマンド承認は残る） | 「レビュー中で細かい編集が連続する」フェーズ。テンプレ反映・軽い修正ループ |
| `plan` | Claude はファイル分析のみ可能。変更は一切しない | 「まず計画を見せて」というとき。`/plan <prompt>` でプロンプト単位でも使える |
| `bypassPermissions` | ほぼ全てのプロンプトをスキップ（保護ディレクトリ除く） | **Docker/VM 等の隔離環境のみ**。ローカルでは使わない |

**`auto` / `dontAsk` モードは受講生は基本使わない**:
- `auto` は Team / Enterprise / API プラン限定かつ Sonnet 4.6 / Opus 4.6 限定（個人 Pro / Max プランでは利用不可）
- `dontAsk` は CI パイプライン向けの非対話モード。受講生の日常開発では使用場面なし

### `disableBypassPermissionsMode` — 誤発射防止

`/school-starter:setup` で `~/.claude/settings.json` の `permissions.disableBypassPermissionsMode` を `"disable"` にセットしている。これにより `claude --dangerously-skip-permissions` で起動したり、Shift+Tab で `bypassPermissions` に切り替えたりしても**拒否される**。

YouTube / ブログで「`--dangerously-skip-permissions` で快適」という情報を見ても、そのまま使わない。**使いたい場面があれば、なぜ必要かを考えた上で自分の settings.json から `disableBypassPermissionsMode` を外す**（= 自覚的に防御を解除する）。

### 権限ルール構文の最低限リファレンス

自分で `permissions.deny` に追加したくなったときのために:

```
Tool                 → そのツールの全使用にマッチ（例: Bash, Read, WebFetch）
Tool(specifier)      → 特定の使用にマッチ
Bash(npm run build)  → 正確一致
Bash(npm run *)      → 「npm run 」で始まる（末尾スペース付き *）
Bash(npm run*)       → 「npm run」で始まる（単語境界なし・lsof も npm-run も全部マッチ）
Read(./.env)         → カレントディレクトリの .env
Read(./.env.*)       → .env.local, .env.production 等
Read(~/.ssh/**)      → ホームの .ssh 配下を再帰的に
WebFetch(domain:example.com) → example.com へのフェッチ
mcp__server__TOOL    → MCP ツール個別指定
Agent(AgentName)     → サブエージェント個別指定
```

**注意**: `Read(./.env)` deny は **Claude の Read tool** でしか効かない。`Bash(cat .env)` は別経路で通る（対策は sandbox ON）。詳しくは `~/.claude/rules/env-security.md` の「deny リストの限界」セクション参照。

公式ドキュメント: https://code.claude.com/docs/ja/permissions / https://code.claude.com/docs/ja/permission-modes / https://code.claude.com/docs/ja/settings

## 開発ルール
- **詳細ルール**: `~/.claude/rules/development.md` を参照
- 開発原則、コード実装前の確認、セキュリティ、テストコマンド、検証ルール

## 大きな開発依頼への自動提案ルール（最重要）

受講生から以下のような依頼を受けたときは、**いきなり実装を始めず、先に提案する**:

- 「◯◯アプリを作って」「◯◯機能を丸ごと追加して」など大規模な新機能依頼
- 3ファイル以上を触る必要がありそうな変更
- 設計の選択肢が複数ありそうな機能追加
- 既存コードの調査が必要な複雑な変更

### 判断フロー

1. **何を作るかがまだ曖昧 / 設計判断が必要** → **`/feature-dev` を提案**
   - 提案例: 「この開発は大掛かりなので、まず `/feature-dev` で設計フェーズから始めますか？ code-explorer / code-architect / code-reviewer の3つの専門家が並列で動いて、既存コード調査 → 設計案比較 → レビューまで一気通貫でやってくれます」
   - 受講生の承諾を得てから `/feature-dev` を実行
   - **`/feature-dev` の出力後は Codex で第三者レビューを提案する（実装前の重要ゲート）**:
     - 提案例: 「/feature-dev の設計書・実装計画ができました。実装前に、別のAI（Codex）に第三者レビューをしてもらうことを強く推奨します。/feature-dev は内部で Claude の3エージェントが動いていますが、全て同じ Claude 系統なので盲点が残る可能性があります。Codex（OpenAI系）で別視点からチェックすると、手戻りを大幅に減らせます。」
     - 手順の案内: Codex CLI 常駐ペインに設計書のパスを指定して「このファイルをレビューして、抜けモレ・矛盾・セキュリティリスク・実装上の懸念を指摘して」と依頼
     - Codex の指摘を反映してから実装に入る

2. **何を作るかは決まっている / 実装直前の最終確認だけ欲しい** → **Plan Mode を提案**
   - 提案例: 「この変更、Plan Mode（Shift+Tab）で先に計画を見せてから実装しましょうか？」
   - 受講生の承諾を得てから Plan Mode に切り替え

3. **単純なバグ修正・1〜2ファイルの小変更** → どちらも不要、直接実装してよい

### 原則

- **迷ったらまず提案する方向に倒す**。非エンジニアの受講生は「大きな変更」を気軽に依頼してくるので、Claude 側が「まず計画を」と提案することで暴走や手戻りを防ぐ
- **計画を承認するまでコードを書かない**
- 提案するときは「なぜそれを使うと良いのか」を1〜2行添える（受講生が機能を理解しながら使えるように）

## Plan Mode（計画モード）の使い方
- **用途**: 実装直前の作業確認（何を作るかは決まっているが、実行前に計画を見せてもらう安全弁）
- **切り替え**: Shift+Tab
- **性質**: 軽量・即時。計画を承認したらそのまま実装に入る

## /feature-dev スキルの使い方
- **用途**: 要件定義・設計判断が必要なフェーズ（何を作るかがまだ曖昧で、調査と設計判断が必要な場合）
- **性質**: 複数の専門エージェント（code-explorer / code-architect / code-reviewer）が並列で動く重めの処理。設計文書をファイルとして残す
- **前提**: `/school-starter:setup` で伴走インストール済み

## 判断を求めるときは AskUserQuestion を使う
- **対象**: 選択肢が2つ以上ある決定（実装方針・ライブラリ選定・設計案・Plan Mode 分岐等）
- **原則**: 推奨項目に `(Recommended)` / 選択肢は2〜4個 / 単純 Yes/No や1択では使わない

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

## git ルール
- `git push --force` は禁止（main/masterはツールレベルでdeny済み、その他ブランチも非推奨）
- 代わりに `git push --force-with-lease` を使う（同僚のコミットが上書きされる事故を予防）
- コミット前に `git status` で意図したファイルだけステージされているか確認

## セキュリティ
- **詳細ルール**: `~/.claude/rules/env-security.md` を参照
- .envファイルはコミットしない
- APIキーはVercel環境変数で管理
- 認証情報をログに出力しない
- **.envの値をチャットに表示しない**（存在確認のみOK）

### Supabase RLS（必須チェック）

IMPORTANT: 納品前に以下をすべて確認する。1つでも抜けると本番で事故る:

- [ ] 全テーブルで `ENABLE ROW LEVEL SECURITY` が有効 — **OWASP A01: Broken Access Control**
- [ ] `anon` / `authenticated` 両ロールのポリシーが適切に分かれている — **OWASP A01: Broken Access Control**
- [ ] `service_role` キーがクライアントコード（`NEXT_PUBLIC_*` やブラウザから見える場所）に露出していない — **OWASP A02: Cryptographic Failures / A07: Identification and Authentication Failures**
- [ ] UPDATE ポリシーに SELECT ポリシーも併記（UPDATE だけだと RETURNING が効かず「謎のバグ」になる） — **OWASP A01: Broken Access Control**
- [ ] Views は `SECURITY INVOKER` を明示指定（デフォルト definer だと RLS バイパスで権限昇格） — **OWASP A01: Broken Access Control / A04: Insecure Design**
- [ ] ロール判定は `raw_app_meta_data` を使う（`raw_user_meta_data` はユーザー自身が書き換え可能で権限昇格の穴になる） — **OWASP A01: Broken Access Control / A04: Insecure Design**
- [ ] Storage bucket で `upsert: true` + `public` の組み合わせがない（他人のファイル上書きリスク） — **OWASP A01: Broken Access Control**
- [ ] Edge Functions で `service_role` を使う場合、呼び出し側の認可を自前で実装している — **OWASP A01: Broken Access Control / A07: Identification and Authentication Failures**
- [ ] Next.js の `'use client'` コンポーネントに `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_*` 以外の機密が漏れていない — **OWASP A02: Cryptographic Failures**
- [ ] `middleware.ts` の `matcher` の除外パターンが広すぎないか（認可バイパスの穴になる） — **OWASP A01: Broken Access Control / A07: Identification and Authentication Failures**
- [ ] Storage 署名 URL 発行時に `expiresIn` を必ず明示（デフォルト未指定だと長期間有効な URL がログや履歴に流出する。納品アプリの画像/PDF 表示でありがち） — **OWASP A02: Cryptographic Failures / A04: Insecure Design**
- [ ] Supabase Auth の Redirect URL allowlist に `*` / `localhost` / `http://` スキームが本番環境に残っていない（PWA予約管理アプリのメールリンク認証で狙われる） — **OWASP A07: Identification and Authentication Failures / A10: SSRF 隣接**

※ 上記 12 項目は主に OWASP Top 10 2021 のうち **A01 (Broken Access Control)** / **A02 (Cryptographic Failures)** / **A04 (Insecure Design)** / **A07 (Identification and Authentication Failures)** / **A10 (SSRF)** をカバー。`@agent-security-auditor` は A03 (Injection) / A05 (Security Misconfiguration) / A08 (Software and Data Integrity Failures) も見る。

YOU MUST: 納品前は必ず**3段階レビュー**を実施する（第7回・第10回で使う）。**順序**: ① `@agent-security-auditor` で OWASP Top 10 / 認証 / RLS / 暗号化観点の独立監査（先に専門観点で筋を通す） → ② `review` スキル（feature-dev:code-reviewer による品質・ロジック・見落としの内部レビュー + 最大5回の自動修正ループ） → ③ 出力された「作業サマリー」を別タブの Codex CLI または ChatGPT にコピペして第三者独立レビュー。**すべての段階で 🔴 Critical が出ないこと**を確認してから納品物を確定する。

## テスト・検証
- テストコマンド・検証ルールは `~/.claude/rules/development.md` を参照
- 実装完了後は検証コマンドを実行し、エラーがなくなるまで修正すること

## ドキュメント管理
- **詳細ルール**: `~/.claude/docs/documentation.md` を参照
- **CLAUDE.md**: 静的な基本設計情報（技術スタック、概要）
- **000_PROJECT_STATUS.md**: 動的な進捗情報（200行以内に保つ）
- **エラー蓄積**: エラーを2回以上試行して解決したら `~/.claude/docs/error-solutions.md` に自動追記（確認不要）

## プロジェクト作成時（必須）
1. **CLAUDE.md作成**（最優先）
2. **docs/000_PROJECT_STATUS.md作成** → テンプレート: `~/.claude/docs/project-status-template.md`
3. **`.claudeignore`作成**（`.env*`, `*.pem`, `*.key`, `credentials/` を記載）

## 便利なコマンド
- `/interview` — 要件ヒアリング → 仕様書を自動生成
- `/school-starter:check` — セキュリティ・品質の一括チェック
