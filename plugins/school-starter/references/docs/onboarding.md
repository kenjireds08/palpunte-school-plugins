# Claude Code オンボーディングガイド（受講生向け参考資料）

このファイルは、Claude Code を使い始めた受講生が「中身がわかると便利な豆知識」をまとめたものです。**暗記不要・必要なときに開けば OK**。VS Code で `~/.claude/docs/onboarding.md` を開くか、ターミナルで `cat ~/.claude/docs/onboarding.md` で読めます。

このファイルは Claude のコンテキストには毎回入りません（CLAUDE.md からは末尾で参照のみ）。困ったときに自分で開いて読む構造です。

---

## 1. CLAUDE.md の書き方メモ

CLAUDE.md は Claude に読ませる「指示書」。書き方のコツを知っておくと、Claude の遵守度が上がります。

- **守らせたいルールには `IMPORTANT:` を付ける** — 例: `IMPORTANT: APIキーをチャットに表示しないこと`
- **絶対に守らせたいルールには `YOU MUST` を付ける** — 例: `YOU MUST run tests before committing`
- **英語の強調語（IMPORTANT / YOU MUST / DO NOT / NEVER）は日本語文中でも有効**。Anthropic 公式の推奨テクニック
- **乱用すると効果が薄れる**。「これは絶対譲れない」というルールだけに付ける（1 ファイルに 2〜3 個が目安）
- **役に立つ場面**: `.env` の値を出力しない・本番 DB を消さない・テストを弱めない等、事故防止系のルール
- **サイズ目安**: CLAUDE.md は **200 行以下**が公式推奨。超えると遵守率が下がるので、詳細は `.claude/rules/` か外部 `.md` ファイルに分割し、本ファイルからは `@path/to/file.md` で参照する
- **`@path` インポート構文**: 「`~/.claude/rules/development.md` を参照」と自然言語で書くより、`@~/.claude/rules/development.md` と書く方が**起動時に明示的に展開・読み込み**される（公式推奨パターン）。相対 / 絶対パス両方 OK・最大 5 ホップまで再帰インポート可。**ただし @ で参照したファイルは毎回コンテキストに展開されるため、参照しすぎると重くなる**
- **HTML コメントは Context に注入されない**: `<!-- ... -->` で囲まれた部分はコンテキスト注入前に削除されるため、人間メンテナ向けのメモを Context 消費なしで残せる（コードブロック内の `<!-- -->` は保持される）
- **`.claude/rules/*.md` の `paths:` フィールド**: ルールファイルを特定パス編集時のみ読み込ませたい場合、frontmatter に `paths: ["src/api/**/*.ts"]` 等を書くと、対象ファイルを開いたときだけルールが効いて Context を節約できる（school-starter の `test.md` がこの活用例）
- **スキルの使うタイミングを CLAUDE.md に書く**: スキルが思った場面で発動しないときは、CLAUDE.md に「UI 実装時は `frontend-design` スキルを使うこと」「コミット前は `review` スキルでレビューすること」のように明示すると自動発動率が上がる
- **自作スキルの `SKILL.md` は 500 行以下が公式推奨**: 詳細なリファレンス・長いスクリプト・テンプレート出力例は `references/`（参考資料）/ `scripts/`（実行ツール）/ `assets/`（テンプレート画像）に分割し、`SKILL.md` から参照させる
- **自作スキルの `description` は 250 文字以内**: 公式が 250 文字でキャップする（コンテキスト節約のため）。**主要なユースケース・トリガーフレーズを冒頭に**書く（例: 「コードレビューして」「レビューお願い」など、ユーザーが自然に言うキーワード）。これがスキル自動発動の鍵

## 2. 自作 Hook の基本

Hook はツール実行前後やセッション開始時など特定タイミングで自動実行されるシェルコマンド・HTTP エンドポイント。受講生が独自の自動化を仕込みたくなったときの最低限知識。

- **配置場所 6 種類**: `~/.claude/settings.json`（マシン全プロジェクト共通）/ `.claude/settings.json`（プロジェクト固有・Git 共有可）/ `.claude/settings.local.json`（プロジェクト固有・gitignored）/ 管理ポリシー設定（組織全体）/ プラグインの `hooks/hooks.json`（プラグイン有効時）/ スキル・サブエージェントのフロントマター
- **主要イベント**: `SessionStart`（開始時）/ `UserPromptSubmit`（受講生発話）/ `PreToolUse`（ツール実行前・ブロック可）/ `PostToolUse`（ツール実行後）/ `PreCompact`（/compact 実行前）/ `Stop`（応答完了時）/ `SessionEnd`（終了時）
- **マッチャーパターン**: `"Bash"`（完全一致）/ `"Edit|Write"`（パイプ区切り）/ `"mcp__.*"`（正規表現で MCP 全部）/ 省略 or `"*"` で全マッチ
- **`if` フィールドで絞り込み**: `if: "Bash(rm -rf *)"` のように権限ルール構文で更にフィルタ可能（例: rm -rf を含む Bash のみ反応）
- **exit code 2 で blocking**: コマンド Hook で実行を止めたいとき、stderr に理由を出して `exit 2` で返す。exit 1 は non-blocking なので使用禁止
- **JSON 出力で構造化決定**: `{hookSpecificOutput: {hookEventName: "...", additionalContext: "...", permissionDecision: "deny"}}` のように JSON を stdout に書くと AI 側のコンテキストに inject できる
- **Hook はセキュリティの「最後の保険」**: 多層防御の 1 つに過ぎない。CLAUDE.md ルール・rules・サブエージェント・受講生の目視確認とセットで成り立つ。Hook 単体に頼り切らない

詳しくは Anthropic 公式 https://code.claude.com/docs/ja/hooks を参照。school-starter の `hooks/hooks.json` と `scripts/*.js` も読み参考にできます。

## 3. Settings / Permissions の使いこなし

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

### 権限モード 4 種の使い分け

Shift+Tab でサイクル切り替え。現在のモードはステータスバーに表示される。

| モード | 挙動 | 使うタイミング |
|--------|------|--------------|
| `default` | 各ツールの最初の使用時にプロンプト。**デフォルト・推奨** | 機密作業・初めてのフォルダ・日常の開発 |
| `acceptEdits` | ファイル編集と `mkdir`/`touch`/`mv`/`cp` を自動承認（Bash コマンド承認は残る） | 「レビュー中で細かい編集が連続する」フェーズ。テンプレ反映・軽い修正ループ |
| `plan` | Claude はファイル分析のみ可能。変更は一切しない | 「まず計画を見せて」というとき。`/plan <prompt>` でプロンプト単位でも使える |
| `bypassPermissions` | ほぼ全てのプロンプトをスキップ（保護ディレクトリ除く） | **Docker/VM 等の隔離環境のみ**。ローカルでは使わない |

`auto` / `dontAsk` モードは Team / Enterprise / API プラン限定（または CI 向け非対話モード）のため受講生は使わない。

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

**注意**: `Read(./.env)` deny は **Claude の Read tool** でしか効かない。`Bash(cat .env)` は別経路で通るため、school-starter は `Bash(cat *.env*)` 等の Bash 経路 deny も併せて配置している。詳しくは `~/.claude/rules/env-security.md` の「deny リストの限界」セクション参照。

公式ドキュメント: https://code.claude.com/docs/ja/permissions / https://code.claude.com/docs/ja/permission-modes / https://code.claude.com/docs/ja/settings

---

## 関連リソース

- `~/.claude/CLAUDE.md` — Claude への動作指示書（このファイルの「使い方」を決める設定）
- `~/.claude/rules/env-security.md` — `.env` / シークレット情報の取り扱いルール
- `~/.claude/rules/supabase-security.md` — Supabase RLS チェックリスト（migrations/ や *.sql 編集時に自動ロード）
- `~/.claude/rules/development.md` — 開発原則・テストコマンド・検証ルール
- school-starter プラグイン Notion ガイド: https://www.notion.so/school-starter-339af2ccb9b5812aaa63e25efa68468c

もっと詳しく知りたい場合は Anthropic 公式ドキュメント https://code.claude.com/docs/ja/ を参照してください。
