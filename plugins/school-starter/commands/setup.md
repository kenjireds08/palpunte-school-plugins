---
description: スクール環境の初期セットアップ・更新（グローバル設定 + プロジェクト設定）
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Glob
---

スクール受講生の環境をセットアップする。初回でもアップデート後でも同じコマンドで対応する。

プラグイン内のテンプレートは `${CLAUDE_PLUGIN_ROOT}/references/` にある。

---

## 🔴 IMPORTANT: インストールから setup 完走までの保護状態（時系列・正確版）

受講生に正確に伝えること。プラグインの防御層は install と setup で**段階的に有効化される**:

| 防御層 | `/plugin install` 直後 | `/school-starter:setup` 完走後 |
|--------|----------------------|-------------------------------|
| Hook 3種（連結/危険パターン/不可視Unicode） | ✅ **即有効**（hooks.json は install 時点で読み込まれる） | ✅ 有効のまま |
| グローバル rules（~/.claude/rules/ 4種） | ❌ 未配布 | ✅ 配布完了 |
| settings.json deny リスト（~/.ssh/** / curl 等） | ❌ 未配布 | ✅ 配布完了 |
| security-auditor サブエージェント / interview スキル等 | ❌ 未配布 | ✅ 配布完了 |

つまり **install 直後は Hook による「危険コマンド即ブロック」「不可視 Unicode 検出」は効くが、機密ファイルの deny リスト（SSH キー・.env 等）と rules は未配布**。この中間状態で新規リポジトリの解析指示・外部プラグインのインストール・未知の CLAUDE.md 読み込み等を投げると、Hook では止めきれない経路（Read tool で秘密ファイルを読む等）が通る。

したがって、受講生への案内で以下を明示する:

1. `/plugin install school-starter@kenjireds08/palpunte-school-plugins` を実行
2. **他の作業を挟まず即座に** `/school-starter:setup` を実行（install と setup の間に新規 Read/Write 指示を挟まない）
3. setup 完走メッセージを確認するまで別の Claude Code 操作をしない
4. setup 後に `/school-starter:check` を1回走らせて、deny リスト・Hook・rules が全部配置されたことを確認

**注意（多層防御の前提）**: このプラグインの防御機構は「Hook（3種）+ deny リスト + rules + sandbox + 受講生自身の判断」の**多層で構成**されている。どれか1つを完璧に頼るのではなく、**全層で拾う前提**:

- Hook は Bash tool / Edit 系 tool だけを対象にしており、**MCP 経由のコマンド実行はブロックできない**
- deny リストは shell alias 経由や、Edit/Write でスクリプトを書き出してから実行する経路には効かない
- rules は Claude の「自制」を促すもので、プロンプトインジェクションでは突破される
- 新規 MCP を追加するときは、その MCP 固有のツール名で個別 deny が必要

**Hook は「最後の保険」であって唯一の防御ではない**。最終的な防御線は**受講生自身の目視確認**（引き継ぎリポジトリの CLAUDE.md 冒頭チェック・プラグイン内部スクリプトの目視・意図不明なコマンドを実行する前の確認）である、と位置付けを明確に伝える。

**サプライチェーン注意**: `/plugin install school-starter@kenjireds08/palpunte-school-plugins` は現状 GitHub のデフォルトブランチ最新コミットを拾う仕様。将来 GitHub アカウントが乗っ取られた場合、受講生の次回 setup で悪性コードが配布されるリスクがある。以下で軽減する:

- 受講生には **`/plugin update school-starter` を実行するタイミングで `docs/plugin-changelog.md` を読んでもらう**（想定外の変更がないか確認）
- 更新時に `/school-starter:setup` で置き換わるファイル一覧（rules/・commands/・agents/）は配置後に目視確認
- 将来的にタグ固定運用（`@v1.15.0` 形式）が Claude Code の `/plugin install` で公式対応したら移行予定

---

## Part 1: グローバル設定

### 1-1. バージョン確認

`~/.claude/.school-starter-version` を確認し、プラグインの現在のバージョンと比較する。
プラグインの現在バージョンは `${CLAUDE_PLUGIN_ROOT}/../.claude-plugin/plugin.json` の `version` フィールドから取得する。

- **ファイルが存在しない（初回）**: 全ファイルを新規配置
- **バージョンが同じ**: 「最新です」と報告し、Part 1のファイル配置をスキップ（Part 2は実行）
- **バージョンが異なる（更新あり）**: 更新されたテンプレートで上書き配置

配置完了後、`~/.claude/.school-starter-version` に現在のバージョンを書き込む。

### 1-2. グローバルルール（~/.claude/rules/）

`~/.claude/rules/` ディレクトリを確認し、以下の4ファイルを配置:

| ファイル | テンプレート元 | 役割 |
|---------|-------------|------|
| `~/.claude/rules/env-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/env-security.md` | .env取り扱いルール |
| `~/.claude/rules/development.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/development.md` | 開発原則 |
| `~/.claude/rules/test.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/test.md` | テスト・lint改ざん防止 |
| `~/.claude/rules/web-content-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/web-content-security.md` | 外部コンテンツ安全性 |

初回: テンプレートを読み込んで作成
更新時: テンプレートの最新版で上書き

### 1-3. interviewスキル（~/.claude/skills/interview/）

`${CLAUDE_PLUGIN_ROOT}/references/skills/interview/SKILL.md` を読み込んで `~/.claude/skills/interview/SKILL.md` に配置。

初回: 新規作成
更新時: 最新版で上書き

### 1-4. clear-prepコマンド（~/.claude/commands/clear-prep.md）

`${CLAUDE_PLUGIN_ROOT}/references/commands/clear-prep.md` を読み込んで `~/.claude/commands/clear-prep.md` に配置。

初回: 新規作成
更新時: 最新版で上書き

### 1-4a. new-projectコマンド（~/.claude/commands/new-project.md）

`${CLAUDE_PLUGIN_ROOT}/references/commands/new-project.md` を読み込んで `~/.claude/commands/new-project.md` に配置。

これにより、スクール生は新しいプロジェクトフォルダで `/new-project` だけで初期セットアップが走る。
配置後は project-flow スキル（プラグイン内）が自動発動してフェーズ進行をガイドする。

初回: 新規作成
更新時: 最新版で上書き

### 1-4c. interview-light / interview-full コマンド（~/.claude/commands/）

以下の2ファイルを `~/.claude/commands/` に配置（`/interview` を打ったときにサジェスト候補として2つの選択肢が表示されるようにする）:

| ファイル | テンプレート元 | 役割 |
|---------|-------------|------|
| `~/.claude/commands/interview-light.md` | `${CLAUDE_PLUGIN_ROOT}/references/commands/interview-light.md` | 受注前・モックアップ用の軽量ヒアリング（5問完結） |
| `~/.claude/commands/interview-full.md` | `${CLAUDE_PLUGIN_ROOT}/references/commands/interview-full.md` | 受注後・本実装用の詳細ヒアリング（9観点） |

これらのコマンドは内部で `~/.claude/skills/interview/` のスキルを呼び出すラッパー。
スキル本体は `1-3` で配置済み。

初回: 新規作成
更新時: 最新版で上書き

### 1-4b. ドキュメント管理ガイド（~/.claude/docs/）

`${CLAUDE_PLUGIN_ROOT}/references/docs/` 配下の以下のファイルを `~/.claude/docs/` に配置:

| ファイル | テンプレート元 | 役割 | 上書きルール |
|---------|-------------|------|------------|
| `~/.claude/docs/documentation.md` | `references/docs/documentation.md` | ドキュメント管理ルール | 毎回上書き |
| `~/.claude/docs/project-status-template.md` | `references/docs/project-status-template.md` | STATUS雛形 | 毎回上書き |
| `~/.claude/docs/task-backlog-template.md` | `references/docs/task-backlog-template.md` | バックログ雛形 | 毎回上書き |
| `~/.claude/docs/error-solutions.md` | `references/docs/error-solutions-template.md` | エラー蓄積ログ | **初回のみ作成（追記型）** |
| `~/.claude/docs/skill-health.md` | `references/docs/skill-health-template.md` | スキル健全性ログ | **初回のみ作成（追記型）** |

error-solutions.md と skill-health.md は追記型のため、既に存在する場合は上書きしない（ユーザーの記録を保護）。

結果レポートのグローバル設定セクションに以下の行を追加:
```
- docs/documentation.md: 作成 / 更新 / 最新
- docs/project-status-template.md: 作成 / 更新 / 最新
- docs/task-backlog-template.md: 作成 / 更新 / 最新
- docs/error-solutions.md: 作成 / 既存（スキップ）
- docs/skill-health.md: 作成 / 既存（スキップ）
```

### 1-5. グローバルCLAUDE.md（~/.claude/CLAUDE.md）

`~/.claude/CLAUDE.md` が存在するか確認。

- **存在しない（初回）** → `${CLAUDE_PLUGIN_ROOT}/references/claude-md-template.md` を読み込んで作成
- **存在する** → 上書きしない。「既存のためスキップ（ユーザーがカスタマイズしている可能性があるため）」と報告

※ CLAUDE.mdだけは上書きしない。ユーザーが自分で育てていくファイルのため。

### 1-6. セキュリティ設定の強化（settings.json deny リスト）

`~/.claude/settings.json` を読み、`permissions.deny` の内容を確認する。

以下のdenyリストと `$schema` 指定が設定されているか確認し、不足があれば**既存設定を保持したまま**不足分を追加する:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": [
      "Read(~/.ssh/**)",
      "Read(~/.gnupg/**)",
      "Read(~/.aws/**)",
      "Read(~/.azure/**)",
      "Read(~/.npmrc)",
      "Read(~/.git-credentials)",
      "Read(~/.config/gh/**)",
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(nc *)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./config/credentials.json)",
      "Read(**/password)",
      "Read(**/secret)",
      "Bash(cat *.env*)",
      "Bash(cat */.env*)",
      "Bash(cat .env*)",
      "Bash(grep * *.env*)",
      "Bash(grep * .env*)",
      "Bash(head *.env*)",
      "Bash(tail *.env*)",
      "Bash(less *.env*)",
      "Bash(more *.env*)",
      "Bash(rm -rf /*)",
      "Bash(rm -rf .)",
      "Bash(rm -rf ~)",
      "Bash(rm -rf ~/*)",
      "Bash(rm -rf .*)",
      "Bash(git push --force *main*)",
      "Bash(git push -f *main*)",
      "Bash(git push --force *master*)",
      "Bash(git push -f *master*)",
      "Bash(ncat *)",
      "Bash(socat *)",
      "Bash(openssl s_client *)",
      "Bash(ssh *)",
      "Bash(scp *)",
      "Bash(rsync *)",
      "Bash(security *)",
      "Read(~/.config/gcloud/**)",
      "Read(~/.docker/**)",
      "Read(~/.kube/**)",
      "Read(~/.azure/**)",
      "Read(~/.pgpass)",
      "Read(~/.my.cnf)",
      "Read(~/.zsh_history)",
      "Read(~/.bash_history)",
      "Read(~/.python_history)",
      "Read(~/.node_repl_history)",
      "Read(~/.supabase/access-token)",
      "Read(~/Library/Keychains/**)",
      "Read(~/Library/Cookies/**)",
      "Read(~/Library/Application Support/Google/Chrome/**)",
      "Read(~/Library/Application Support/Firefox/**)",
      "Read(**/id_rsa)",
      "Read(**/id_ed25519)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/*.p12)",
      "Read(**/*.pfx)",
      "Read(**/service-account*.json)",
      "Read(**/serviceAccountKey*.json)",
      "Read(**/firebase-adminsdk*.json)",
      "Read(**/supabase/.temp/**)",
      "Read(**/credentials/**)",
      "Read(**/credentials.*)",
      "Read(**/.aws/credentials)",
      "Read(~/Library/Application Support/Claude/**)",
      "Read(~/Library/Application Support/ClaudeDesktop/**)",
      "Read(~/.config/Claude/**)",
      "Read(~/AppData/Roaming/Claude/**)"
    ],
    "ask": [
      "Bash(rm -rf *)",
      "Bash(rm -rf */*)"
    ]
  }
}
```

**📌 受講生への伝え方（暗記不要・概念だけ）**: deny リストの個別パス（50項目以上）は**暗記する必要はない**。以下の 4 カテゴリが何を守っているかだけ理解すれば OK。「`/school-starter:setup` が良しなに配置してくれる」「自分で何を追加したくなったら `/permissions` と `~/.claude/rules/env-security.md` を参照」という心構えで十分。

denyリストは大きく4カテゴリ:

1. **ホーム系認証情報のブロック**（`~/.ssh/**` 等） — サプライチェーン攻撃を受けても認証情報を抜かれない
2. **外部通信コマンドのブロック**（`Bash(curl *)`, `Bash(wget *)`, `Bash(nc *)`） — プロンプトインジェクションでAIが騙されても、情報を外部に送る手段を持たない
3. **プロジェクト内の機密ファイルのブロック**（`./.env` 等 + `Bash(cat *.env*)` 等） — プロジェクト内のAPIキー・認証情報を Read tool でも Bash 経路でも読めないように二重で塞ぐ。Read(./.env) deny だけだと `Bash(cat .env)` で読まれてしまう公式仕様の穴を、Bash 側 deny で併せて塞ぐ
4. **破壊的操作のブロック**（`rm -rf`, `git push --force`） — AIがパスミスで全削除したり、force pushで同僚のコミットを消したりする事故を予防

処理:
- 既に全項目あり → 「denyリスト: 設定済み」と報告
- 不足あり → 不足分を追加し「denyリスト: N項目追加」と報告
- `$schema` が無ければ追加（VS Code 等で settings.json 編集時にオートコンプリート＋インライン検証が効くようになる・手動編集事故の予防）
- `permissions.allow` や他の設定がある場合は絶対に消さない（マージする）
- `permissions.ask` がない場合は新規追加、ある場合はマージ

**補足:**
- rules/のルールファイルはClaudeが「やるべきでない」と理解して自制する仕組み。denyリストはツールレベルでブロックするため、プロンプトインジェクションでも突破できない。両方あることで防御が二重化される
- `Bash(curl *)` 等は**Claude Code が自動で使うときに限ってブロック**する。受講生が別ターミナルで手動実行する分には影響しない。**ただし、受講生が Claude Code のチャットに「curl で API 叩いて」と頼んでも Claude が実行するときにブロックされる**（AI 経由での外部送信を一律で止める設計のため）。Webhook テスト・API 動作確認は**ターミナル側で直接実行**してもらう運用
- `Read(./.env)` / `Read(./.env.*)` は `.claudeignore` と役割が重なるが、denyはツールレベルで強制力が強い。二重に設定することで防御を厚くする
- `rm -rf ~*` / `rm -rf .*` は即時deny（ホームディレクトリや隠しファイル全削除の事故防止）
- `rm -rf *` は `ask`（確認プロンプト）。`build/`掃除などの正規用途は残しつつ、パスミスをユーザーが気づける
- `git push --force` のdenyは main / master 限定。個人のトピックブランチへのforce pushは通常通り可能
- **shell alias の穴**: deny リストは Claude Code が `Bash` tool を呼ぶ時の**コマンド文字列**で判定する。受講生が `~/.zshrc` 等で `alias c=curl` のように別名定義している場合、Claude が `c http://...` と書くと deny をすり抜けて実行される可能性がある。**プラグイン配布環境では外部通信系コマンドに alias を張らない**運用で回避する
- **MCP 経由の穴**: deny は Claude Code の `Bash` tool 呼び出しにしか効かない。Composio 等の MCP サーバーが提供する `REMOTE_BASH_TOOL` や自作 MCP の bash 実行ツールは**別 tool 名なので deny が効かない**。新規 MCP を入れる時はその MCP 固有のツール名で個別 deny が必要

**スキーマ検証のフォールバック手順**:
- `~/.claude/settings.json` が **JSON パースに失敗**した場合（過去の手動編集ミス等）は、既存ファイルを `~/.claude/settings.json.broken-<timestamp>` にリネームして退避した上で、**受講生に「既存の settings.json が壊れているため退避しました。手動で確認して直すか、`/school-starter:setup` を再実行してください」と報告**する。自動で JSON を復旧しようとしないこと（ユーザーの意図した設定を破壊する恐れがあるため）
- 退避後、`{}` の空オブジェクトから deny リスト等の設定を再構築して続行する

### 1-6b. 権限モードの明示と誤発射防止（defaultMode / disableBypassPermissionsMode）

`~/.claude/settings.json` の `permissions` セクションに以下の2キーが設定されているか確認し、無ければ**既存設定を保持したまま**追加する:

```json
{
  "permissions": {
    "defaultMode": "default",
    "disableBypassPermissionsMode": "disable"
  }
}
```

**意図**:

- **`defaultMode: "default"`**: 権限モードの起動時デフォルトを明示する。未設定でも暗黙デフォルトは `default`（各ツール最初の使用時にプロンプト）だが、何かのタイミングで `acceptEdits` や `bypassPermissions` に書き換わっていた場合に起動時点で気づける。受講生が Shift+Tab でモードをサイクル中にうっかりセッションを閉じても、次回起動で安全なモードに戻る
- **`disableBypassPermissionsMode: "disable"`**: `bypassPermissions` モードの有効化を禁止する設定。`--dangerously-skip-permissions` フラグ・`--permission-mode bypassPermissions`・Shift+Tab からの切替がすべて拒否されるようになる。受講生が YouTube 動画等で「`claude --dangerously-skip-permissions` で作業すると捗る」という記事を見て誤発射する事故を防止（bypass モードは `.git`/`.vscode` 以外の保護を全部外すため、プロンプトインジェクションに対してほぼ無防備になる）。どうしても必要な場面では受講生が自覚的にこの設定を外す必要がある

処理:
- 両方セット済み → 「defaultMode / disableBypassPermissionsMode: 設定済み」と報告
- 片方 or 両方なし → 不足分を追加し「defaultMode / disableBypassPermissionsMode: 追加」と報告
- 既存値が異なる（例: 受講生が意図的に `acceptEdits` を設定している場合）→ **上書きしない**。「defaultMode: 既存設定を尊重（<値>）」と報告
- `disableBypassPermissionsMode` が既に `"disable"` 以外（歴史的にこのキー自体の値は `"disable"` か未設定の2択）の場合は上書きしない

**受講生への案内**:
- `bypassPermissions` が必要になるのは基本的に「隔離された VM・Docker コンテナ・devcontainer」で使うとき。普段のローカル開発では使わない
- もし使いたくなったら `~/.claude/settings.json` の `disableBypassPermissionsMode` を `"disable"` から外す（削除または値変更）

### 1-7. sandbox有効化の確認

`~/.claude/settings.json` を読み、`sandbox.enabled` が `true` かを確認する。

**このプラグインのレビュー運用はサンドボックス ON と両立するように設計されている。**
コードレビューは `review` スキル（`feature-dev:code-reviewer` サブエージェント + 最終サマリーを Codex別タブにコピペ）で行うため、Codex CLI/プラグインとネットワーク層で競合しない。

**なぜ deny リストだけでは不十分で sandbox が必要か**:

公式仕様として、`permissions.deny` の `Read(...)` / `Edit(...)` ルールは **Claude の組み込み Read / Edit tool にのみ適用**される（権限ドキュメント「Read と Edit」セクション明記）。Bash サブプロセスには適用されないため、`Read(./.env)` deny を設定していても **`Bash(cat .env)` では秘密を読み取れてしまう**。

`Bash(cat *)` 自体を deny すれば防げるが、`cat` の完全 deny は受講生の日常操作を大幅に阻害する（`cat package.json` 等も読めなくなる）。

サンドボックスは **OS レベルでプロセス単位のファイル・ネットワーク境界を強制**するため、Bash・Bash サブプロセス・MCP 経由の bash 実行ツールを含む**全てのプロセスに対して一律のガード**をかけられる。deny リストが「ツール層」、サンドボックスが「OS 層」で多層防御する位置付け。

- **sandbox有効** → 「sandbox: 有効」と報告。問題なし（推奨状態）
- **sandbox無効** → 以下を表示し、`AskUserQuestion` で**明示的に意思決定を求める**（黙って素通しせず、初回セットアップで必ず一度は受講生に選ばせる）:

```
⚠ sandbox が無効です（OS 層の防御が未発動）

deny リスト（ツール層）と rules（AI の自制）は設定されていますが、
OS プロセス単位でファイル・ネットワーク境界を強制する sandbox が OFF です。
公式仕様として deny の Read/Edit ルールは Bash サブプロセスに効かないため、
Bash(cat .env) / 環境ランナー（devbox run / docker exec）経由の読み取りは
sandbox でしか完全に塞げません。

「disableBypassPermissionsMode で bypass を封じたのに sandbox が off」は、
車のブレーキを封印したのにシートベルトを締めていない状態です。
このプラグインのレビュー運用（feature-dev:code-reviewer + Codex別タブコピペ）は
sandbox ON と完全に両立するよう設計されています。
```

`AskUserQuestion` で確認:
```
question: sandbox を有効化しますか？
options:
  - label: "今すぐ有効化する（強く推奨）"
    description: /sandbox コマンドを案内する。このセットアップ完了後に必ず有効化する前提
  - label: "理由があって無効のままにする"
    description: ちーけんさん等の開発者が自覚的に OFF にしている場合。後で /sandbox で切り替え可能
```

「今すぐ有効化」を選んだ場合:
- セットアップ完了後に受講生が `/sandbox` を打つよう完走メッセージ内で案内
- 結果レポートに「sandbox: 無効 → 有効化を案内（要 `/sandbox` 実行）」と記録

「無効のまま」を選んだ場合:
- 結果レポートに「sandbox: 無効（自覚的に選択）」と記録
- `~/.claude/.school-starter-version` と同じディレクトリの `~/.claude/.school-starter-sandbox-opt-out` に日付を書き込み、次回セットアップ時には再度 AskUserQuestion しない（毎回聞くと受講生体験が悪化するため）

### 1-8. Codex CLI のセットアップ伴走（必須）

**Codex CLI はスタンドアロン版**（Claude Code 内プラグインではなくOpenAIの独立CLI）。
このプラグインのレビュー運用では、`review` スキルが出力する「作業サマリー」を **Codex CLI または ChatGPT 別タブにコピペ**して独立レビューを受ける用途で使う。sandbox とも干渉しない。

`which codex` で確認:

- **インストール済み** → 「Codex CLI: 利用可能」と報告
- **未インストール** → 以下のフローで伴走:

```
🔍 Codex CLI のセットアップ

Codex CLI は以下の2用途で使います:
  ① 要件定義・DB設計・実装計画の md ファイルを D&D で第三者レビュー
  ② `review` スキルの「作業サマリー」をコピペして実装コードを独立レビュー

どちらも別ターミナルで Codex CLI を起動して実行します（sandbox と干渉しない運用）。

【インストール手順】
0. ⚠️ タイポスクワッティング対策: https://www.npmjs.com/package/@openai/codex を開き、
   - Publisher: `openai`（OpenAI 社の公式アカウント）
   - Maintainer: @openai.com ドメインのメール
   - Weekly Downloads が数万以上
   の3点を確認してからインストールすること。`@open-ai` `@openai-codex` `openai-cli` 等の類似名は偽物の可能性あり。
1. 公式: https://www.npmjs.com/package/@openai/codex
2. 以下のコマンドでインストール:
     npm install -g @openai/codex
   または
     brew install --cask codex
   ※ Node.js が必要です（npmの場合）
3. 認証:
     codex login
   → ブラウザが開くので OpenAI アカウントでログイン
4. 動作確認:
     codex --version

【無料プランで試せる範囲】
- 期間限定プロモーション中は無料アカウントでも利用可能
- 安定利用には OpenAI Plus ($20/月) 推奨
- 無くても /new-project の流れは動きますが、第三者レビューがスキップされます
```

ユーザーに `AskUserQuestion` で確認:
```
question: Codex CLI のセットアップ方法
options:
  - label: "今すぐインストールする（推奨）"
    description: 上記のコマンドを実行してインストール・認証まで完了させる
  - label: "後で自分でやる"
    description: 必要になったら後で /school-starter:setup を再実行する
  - label: "今回はスキップ"
    description: Codex レビューは使わない（project-flowスキルでは案内のみ表示）
```

「今すぐインストール」を選んだ場合、`Bash` で `npm install -g @openai/codex` を実行し、その後 `codex login` の手順をユーザーに案内する。

### 1-9. feature-dev プラグインのセットアップ伴走（必須）

**Anthropic 公式の設計支援プラグイン**。要件定義・設計判断・複雑な機能追加の場面で、code-explorer / code-architect / code-reviewer の3つの専門エージェントが並列で動き、調査→設計案比較→レビューまで一気通貫で行う。

このプラグインの `review` スキルは内部で **`feature-dev:code-reviewer` サブエージェント**を呼び出すため、**feature-dev プラグインのインストールは必須**。

スクール生は第3回（要件定義）以降でも使うため、**setup の段階で入れておく**。

以下のパスで既にインストールされているかを確認:
- `~/.claude/plugins/cache/claude-plugins-official/feature-dev`
- `~/.claude/plugins/cache/claude-code-plugins/feature-dev`

どちらかが存在すれば「feature-dev: 利用可能」と報告。

**未インストール** → 以下のフローで伴走:

```
📝 feature-dev プラグインのセットアップ

feature-dev は要件定義・設計判断の場面で使う Anthropic 公式プラグインです。
コードベース調査・設計案比較・レビューを並列エージェントで一気通貫で行います。

第3回（要件定義）以降で使うので、ここで入れておきましょう。

【インストール手順】
⚠️ マーケット検証: `claude-plugins-official` マーケットは Anthropic 公式の anthropics 組織配下にあることを確認してからインストール。
確認URL: https://github.com/anthropics/claude-plugins-official （Owner が anthropics になっていればOK）。
`claude-plugin-official`（単数形）等の類似マーケット名は第三者の模倣の可能性あり。

Claude Code で以下のコマンドを実行してください:

  /plugin install feature-dev@claude-plugins-official

インストール後、自動で有効化されます（再起動不要）。

【使い方のイメージ】
- 「予約管理アプリの全体設計を考えたい」→ /feature-dev
- 「認証機能の実装方針を比較したい」→ /feature-dev
- 単純な変更は /feature-dev 不要（Plan Mode だけで十分）
```

ユーザーに `AskUserQuestion` で確認:
```
question: feature-dev プラグインのセットアップ方法
options:
  - label: "今すぐインストールする（推奨）"
    description: /plugin install feature-dev@claude-plugins-official を実行
  - label: "後で自分でやる"
    description: 第3回までに /school-starter:setup を再実行するか、手動インストール
  - label: "今回はスキップ"
    description: feature-dev は使わない方針（Plan Mode のみで進める）
```

「今すぐインストール」を選んだ場合、ユーザーに Claude Code の入力欄に以下のコマンドを貼り付けて実行するよう案内する:
```
/plugin install feature-dev@claude-plugins-official
```

インストール完了後は再度 `/school-starter:setup` を実行してもらい、このセクションで「feature-dev: 利用可能」と確認できる状態にする。

**補足**: `claude-plugins-official` と `claude-code-plugins` の2つのマーケットに同名プラグインがあるが、**`claude-plugins-official` 版を推奨**（Anthropic 公式マーケット）。

### 1-9-a. セキュリティ監査エージェント（security-auditor）の配置

`${CLAUDE_PLUGIN_ROOT}/references/agents/security-auditor.md` を `~/.claude/agents/security-auditor.md` に配置する。

このエージェントは OWASP Top 10 / 認証・認可 / JWT / CORS / CSP / 暗号化 / Supabase RLS ポリシー妥当性などを専門とするセキュリティ監査官。**第7回（認証・セキュリティ）と第10回（納品前レビュー）で明示的に呼び出して使う**。

- **初回**: 新規作成
- **更新時**: 最新版で上書き（ユーザーが手動で書き換えている場合も、プラグイン側の最新を優先。カスタマイズが必要なら別名で保存してもらう方針）

受講生は `~/.claude/agents/security-auditor.md` が配置されると、以下のような明示呼び出しで利用できる:

```
@agent-security-auditor このフォルダの認証周りをレビューして、OWASP Top 10 観点でリスクがあれば指摘して
```

または `Agent` ツールに `subagent_type: "security-auditor"` を指定することでも発動する。

### 1-10-a. Plan Mode 出力先の設定（plansDirectory）

`~/.claude/settings.json` の `plansDirectory` 設定を確認する。

この設定がないと、Plan Mode で作った計画書が `~/.claude/plans/` にグローバル保存されてしまい、リポジトリごとに混ざって見づらくなる。`./plans` に設定するとプロジェクトルート配下の `plans/` に出力されるため、リポジトリごとに計画書を管理できる。

- **`plansDirectory` がない** → 既存設定を保持したまま `"plansDirectory": "./plans"` を追記。「plansDirectory: 設定済み（./plans）」と報告
- **既に設定済み** → 値がユーザーのカスタム設定（例: `"./docs/plans"`）の場合はそのまま尊重。「plansDirectory: 既存設定を保持（<値>）」と報告
- **`"./plans"` で既設定** → 「plansDirectory: 最新」と報告

`~/.claude/settings.json` の他の既存設定（`permissions`, `hooks`, `enabledPlugins`, `language`, `sandbox` 等）は絶対に消さないこと。`plansDirectory` キーだけを追記する。

**⚠️ 受講生への案内必須**: `"./plans"` は**カレントディレクトリ相対**のため、Claude Code をホームディレクトリから起動すると `~/plans/` に書き込まれ、プロジェクトごとに計画書が散らかる事故になる。以下を必ず伝える:

- Claude Code は**必ずプロジェクトフォルダに `cd` してから起動**する
- VS Code 内のターミナルで開く場合は自動的にプロジェクトフォルダがカレントになるので問題ない
- ターミナル直接起動（`claude` コマンド）の場合は起動前に `cd ~/claude-code-projects/<プロジェクト名>` を必ず実行
- 計画書が見当たらない時は「今 Claude をどこから起動したか」を確認（`pwd` で確認可能）

### 1-10. Google Docs マークダウン設定の案内

GWS CLI を使わなくても、見積もり書（mdファイル）を Google Docs にきれいに貼り付けられる。
スクール生に以下を案内する:

```
📝 Google Docs のマークダウン設定（1回だけやればOK）

スクール生の見積もり書は docs/006_estimate.md にmdで作成し、
Google Docs に貼り付けて納品します。
そのために、Google Docs 側で1回だけ設定が必要です:

1. https://docs.google.com/ で新規ドキュメントを開く
2. ツール → 設定
3. 「全般」タブの「マークダウンを有効にする」にチェック
4. OK

これで以降、右クリック → 「マークダウンから貼り付け」が使えます。
（普通の Cmd+V だとマークダウン記法のままになるので注意）

詳しい使い方は /new-project の流れで Claude Code が案内します。
```

この設定はユーザー側のGoogleアカウント設定なので、Claude Code側では何も配置しない。
案内のみを表示する。

---

## Part 2: プロジェクト設定（毎回）

### 2-1. .claudeignore の確認

プロジェクトルートに `.claudeignore` があるか確認。なければ以下を作成:
```
.env*
*.pem
*.key
credentials/
```

### 2-2. .gitignore の確認

`.gitignore` に `.env*` が含まれているか確認。なければ追加を提案。

---

## 結果レポート

すべての確認結果を以下の形式でまとめて報告:

```
## セットアップ結果（v1.0.0）

### グローバル設定（全プロジェクト共通）
- rules/env-security.md: 作成 / 更新 / 最新
- rules/development.md: 作成 / 更新 / 最新
- rules/test.md: 作成 / 更新 / 最新
- rules/web-content-security.md: 作成 / 更新 / 最新
- skills/interview: 作成 / 更新 / 最新
- commands/clear-prep: 作成 / 更新 / 最新
- commands/new-project: 作成 / 更新 / 最新
- CLAUDE.md: 作成 / 既存（スキップ）
- settings.json $schema: 追加 / 設定済み
- denyリスト: 設定済み / N項目追加（Bash経路塞ぎ `cat/grep/head/tail/less/more *.env*` 含む）
- defaultMode / disableBypassPermissionsMode: 追加 / 設定済み / 既存設定を尊重
- sandbox: 有効（推奨）/ 無効 → 有効化を案内（要 `/sandbox` 実行）/ 無効（自覚的に選択）
- Codex CLI（独立レビュー用）: 利用可能 / インストール済み / スキップ
- feature-dev プラグイン（内部レビュー用・必須）: 利用可能 / インストール済み / スキップ
- agents/security-auditor.md（セキュリティ監査用・第7回/第10回で使用）: 作成 / 更新 / 最新
- plansDirectory 設定: 設定済み（./plans）/ 既存設定を保持（<値>）/ 最新
- Google Docs マークダウン設定: 案内表示済み

### プロジェクト設定
- .claudeignore: 作成済み / 既存
- .gitignore: .env*あり / 追加済み

✅ セットアップ完了！
グローバル設定は今後作成するすべてのプロジェクトに自動で適用されます。

📌 次にやること:
新しいアプリ開発を始めるときは、フォルダを作って Claude Code を起動したら
最初に /new-project と入力してください。
あとは Claude Code が対話形式でフェーズを進めてくれます。

🔍 設定を自分で確認したくなったら（覚えておくと便利）:
  - /permissions — 有効な allow / ask / deny ルールと設定ソースファイルを一覧表示（deny が効いているか確認する最速手段）
  - /status — どのスコープ（User / Project / Local / Managed）の設定が効いているか確認。「設定したはずの項目が効かない」ときの第一の確認コマンド
  - どちらも Claude Code の入力欄で打つだけ

💡 プラグインの更新があった場合（必ず差分を読んでから）:
  1. /plugin update school-starter  （または新規 MCP 等のインストール）
  2. ⚠ 直後に /plugin disable school-starter で一旦止める（SessionStart/UserPromptSubmit Hook 発火を止める）
  3. docs/plugin-changelog.md の差分を目視確認（想定外の変更がないか）
  4. ~/.claude/plugins/cache/<source>/<plugin>/ の hooks/scripts/agents を目視
  5. 問題なければ /plugin enable school-starter
  6. /school-starter:setup（このコマンドを再実行）

  ※ この「install/update 直後 → disable → 目視 → enable」手順は school-starter 以外のプラグイン・MCP を入れる時も同じ。詳細は ~/.claude/rules/env-security.md 参照
```
