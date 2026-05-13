---
description: スクール環境のグローバル設定セットアップ・更新（プロジェクト固有の初期化は /new-project に分離）
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Glob
---

スクール受講生の環境をセットアップする。初回でもアップデート後でも同じコマンドで対応する。

プラグイン内のテンプレートは `${CLAUDE_PLUGIN_ROOT}/references/` にある。

---

## 🔴 IMPORTANT: インストールから setup 完走までの保護状態（時系列・正確版）

受講生に正確に伝えること。プラグインの防御層は install と setup で**段階的に有効化される**:

| 防御層 | `/plugin install` 直後 | `/school-starter:setup` 完走後 |
|--------|----------------------|-------------------------------|
| Hook 4種（連結 / 危険パターン / 不可視Unicode / .md作成制御） | ✅ **即有効**（hooks.json は install 時点で読み込まれる） | ✅ 有効のまま |
| グローバル rules（~/.claude/rules/ 6種） | ❌ 未配布 | ✅ 配布完了 |
| settings.json deny リスト（~/.ssh/** / curl 等） | ❌ 未配布 | ✅ 配布完了 |
| security-auditor サブエージェント / interview スキル等 | ❌ 未配布 | ✅ 配布完了 |

つまり **install 直後は Hook による「危険コマンド即ブロック」「不可視 Unicode 検出」は効くが、機密ファイルの deny リスト（SSH キー・.env 等）と rules は未配布**。この中間状態で新規リポジトリの解析指示・外部プラグインのインストール・未知の CLAUDE.md 読み込み等を投げると、Hook では止めきれない経路（Read tool で秘密ファイルを読む等）が通る。

したがって、受講生への案内で以下を明示する:

1. `/plugin marketplace add kenjireds08/palpunte-school-plugins` を実行（マーケット追加）
2. 続けて `/plugin install school-starter@palpunte-school-plugins` を実行（プラグイン本体インストール）
3. **scope の選択を聞かれたら `user` を選ぶ**（全プロジェクトで使えるようにするため）
4. `/reload-plugins` を実行（"Installed school-starter. Run /reload-plugins to apply." と表示されるため必須）
5. **他の作業を挟まず即座に** `/school-starter:setup` を実行（install と setup の間に新規 Read/Write 指示を挟まない）
3. setup 完走メッセージを確認するまで別の Claude Code 操作をしない
4. setup 後に `/school-starter:check` を1回走らせて、deny リスト・Hook・rules が全部配置されたことを確認

**注意（多層防御の前提）**: このプラグインの防御機構は「Hook（3種）+ deny リスト + rules + sandbox + 受講生自身の判断」の**多層で構成**されている。どれか1つを完璧に頼るのではなく、**全層で拾う前提**:

- Hook は Bash tool / Edit 系 tool だけを対象にしており、**MCP 経由のコマンド実行はブロックできない**
- deny リストは shell alias 経由や、Edit/Write でスクリプトを書き出してから実行する経路には効かない
- rules は Claude の「自制」を促すもので、プロンプトインジェクションでは突破される
- 新規 MCP を追加するときは、その MCP 固有のツール名で個別 deny が必要

**Hook は「最後の保険」であって唯一の防御ではない**。最終的な防御線は**受講生自身の目視確認**（引き継ぎリポジトリの CLAUDE.md 冒頭チェック・プラグイン内部スクリプトの目視・意図不明なコマンドを実行する前の確認）である、と位置付けを明確に伝える。

**サプライチェーン注意**: `/plugin marketplace add kenjireds08/palpunte-school-plugins` + `/plugin install school-starter@palpunte-school-plugins` は現状 GitHub のデフォルトブランチ最新コミットを拾う仕様。将来 GitHub アカウントが乗っ取られた場合、受講生の次回 setup で悪性コードが配布されるリスクがある。以下で軽減する:

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

`~/.claude/rules/` ディレクトリを確認し、以下の6ファイルを配置:

| ファイル | テンプレート元 | 役割 |
|---------|-------------|------|
| `~/.claude/rules/env-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/env-security.md` | .env取り扱いルール |
| `~/.claude/rules/development.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/development.md` | 開発原則 |
| `~/.claude/rules/test.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/test.md` | テスト・lint改ざん防止 |
| `~/.claude/rules/web-content-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/web-content-security.md` | 外部コンテンツ安全性 |
| `~/.claude/rules/vercel-deployment.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/vercel-deployment.md` | Vercel CLI 方針（vercel.json/next.config編集時に paths で自動ロード） |
| `~/.claude/rules/supabase-security.md` | `${CLAUDE_PLUGIN_ROOT}/references/rules/supabase-security.md` | Supabase RLS チェック（migrations/, *.sql 編集時に paths で自動ロード） |

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
| `~/.claude/docs/best-practices.md` | `references/docs/best-practices-template.md` | ベストプラクティス集（信頼度スコア運用） | **初回のみ作成（追記型）** |
| `~/.claude/docs/weekly-checklist.md` | `references/docs/weekly-checklist.md` | 週次チェックリスト（5項目: 同じミス検知 / Skill吸収余地 / ctx使用率 / worktree本数 / 信頼度昇格チェック） | 毎回上書き |
| `~/.claude/docs/design-md-template.md` | `references/docs/design-md-template.md` | DESIGN.md カタログ + 軽量テンプレート（awesome-design-md-jp 24サービス + jp-ui-contracts 5プロファイル + 実運用Tips） | 毎回上書き |
| `~/.claude/docs/ui-prohibited-patterns.md` | `references/docs/ui-prohibited-patterns.md` | AIっぽさ排除のUI禁止パターンチェックリスト | 毎回上書き |
| `~/.claude/docs/onboarding.md` | `references/docs/onboarding.md` | Claude Code 中身の豆知識集（CLAUDE.md の書き方・Hook 基本・Settings/Permissions 使いこなし・権限ルール構文）。受講生が時間あるときに自分で開いて読むリファレンス。Claude のコンテキストには毎回入らない（CLAUDE.md からは末尾で参照のみ） | 毎回上書き |

error-solutions.md / skill-health.md / best-practices.md は追記型のため、既に存在する場合は上書きしない（ユーザーの記録を保護）。
weekly-checklist.md / design-md-template.md / ui-prohibited-patterns.md / onboarding.md はガイド資料のため毎回最新版で上書き。

**design-md-template.md / ui-prohibited-patterns.md の役割（v1.6.0で追加）**: 受講生がフロントエンドUI実装時に Claude Code が自動参照することで、AIっぽいUI（紫グラデ・カード上端カラーバー等）を避け、awesome-design-md-jp の24サービスから性格に合わせた参考DESIGN.mdを選んで品質の高いUIを生成できるようになる。第6回以降の管理画面実装〜第10回納品まで継続的に効く。

結果レポートのグローバル設定セクションに以下の行を追加:
```
- docs/documentation.md: 作成 / 更新 / 最新
- docs/project-status-template.md: 作成 / 更新 / 最新
- docs/task-backlog-template.md: 作成 / 更新 / 最新
- docs/error-solutions.md: 作成 / 既存（スキップ）
- docs/skill-health.md: 作成 / 既存（スキップ）
- docs/best-practices.md: 作成 / 既存（スキップ）
- docs/weekly-checklist.md: 作成 / 更新 / 最新
- docs/design-md-template.md: 作成 / 更新 / 最新
- docs/ui-prohibited-patterns.md: 作成 / 更新 / 最新
- docs/onboarding.md: 作成 / 更新 / 最新
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
      "Bash(vercel --prod*)",
      "Bash(vercel deploy --prod*)",
      "Bash(vercel env *)",
      "Bash(vercel rollback*)",
      "Bash(vercel rm*)",
      "Bash(vercel remove*)",
      "Bash(vercel project rm*)",
      "Bash(vercel project remove*)",
      "Bash(vercel alias rm*)",
      "Bash(vercel domains rm*)",
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
4. **破壊的操作のブロック**（`rm -rf`, `git push --force`, `vercel --prod` / `vercel env *` / `vercel rollback` / `vercel rm` 等） — AIがパスミスで全削除したり、force pushで同僚のコミットを消したり、Vercel の本番に誤発射したり、`vercel env pull` で `.env` をローカルに降ろしたりする事故を予防。Vercel CLI の**読み取り系**（`vercel logs` / `vercel inspect` / `vercel ls` / `vercel whoami`）は許可されているため、Claude に本番ログ調査を任せられる（第8回 Vercelデプロイ回で活用）

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

### 1-7. sandbox 有効化の案内（v1.8.5〜 settings.json 検査を諦め、一律で完走メッセージに案内する設計）

**このプラグインのレビュー運用はサンドボックス ON と両立するように設計されている。**
コードレビューは `review` スキル（`feature-dev:code-reviewer` サブエージェント + 最終サマリーを Codex別タブにコピペ）で行うため、Codex CLI/プラグインとネットワーク層で競合しない。

**なぜ deny リストだけでは不十分で sandbox が必要か**:

公式仕様として、`permissions.deny` の `Read(...)` / `Edit(...)` ルールは **Claude の組み込み Read / Edit tool にのみ適用**される。Bash サブプロセスには適用されないため、`Read(./.env)` deny を設定していても **`Bash(cat .env)` では秘密を読み取れてしまう**。サンドボックスは **OS レベルでプロセス単位のファイル・ネットワーク境界を強制**するため、Bash・Bash サブプロセス・MCP 経由の bash 実行ツールを含む全てのプロセスに対して一律のガードをかけられる。

**処理（v1.8.5〜 settings.json 検査廃止）**:

ノート PC 実機検証（2026-05-07）で判明した事実: **Claude Code は `/sandbox` 設定を `~/.claude/settings.json` には書き込まない**。sandbox 状態は Claude Code 内部で管理されており、ファイルベースで検出できない。`grep -i "sandbox" ~/.claude/settings.json` / `ls ~/.claude/ | grep -i sandbox` / `find ~/.claude -name "*sandbox*"` のいずれもヒットしない。

したがって setup スクリプトは **sandbox 状態を検出しようとせず、一律で完走メッセージに `/sandbox` 実行を案内する**。受講生が既に有効化済みでも `/sandbox` 再実行は冪等（再度 3 択 UI が出るだけで害なし）なので、検出して分岐する意味がない。

- 結果レポートには「sandbox: 完走後に `/sandbox` で有効化を案内（auto-allow 推奨）」と一律で記載する

**自分で確認したい受講生向けの案内**:
- `/sandbox` を再実行 → `(current)` がどこに付くかを目視確認
- または `/status` で現在の権限モード/sandbox 状態を表示

### 1-8. feature-dev / frontend-design プラグインの案内（自動インストールはしない）

**Anthropic 公式の設計支援プラグイン 2 種を案内する**。AskUserQuestion は出さず、コマンドを表示して受講生自身に打ってもらう。理由: `/plugin install` は Claude Code の入力欄でユーザー自身が実行するコマンドであり、Bash 経由の自動実行はできない。setup でエラーを出すと受講生が不安になるため、**最初から「自分でこのコマンドを打ってください」と案内するだけにする**。

**重要**: feature-dev と frontend-design は **両方とも `claude-plugins-official` マーケットに集約**されている（v1.8.4 で発覚・v1.6.1〜v1.8.3 では frontend-design を `claude-code-plugins` と誤記していた）。`claude-plugins-official` は Claude Code に**組み込みでプリ登録**されているため `/plugin marketplace add` 不要・`/plugin install` 一発で入る。

以下のパスで既にインストールされているかを確認:

**feature-dev**:
- `~/.claude/plugins/cache/claude-plugins-official/feature-dev`

**frontend-design**:
- `~/.claude/plugins/cache/claude-plugins-official/frontend-design`
- `~/.claude/skills/frontend-design/SKILL.md`

それぞれ既にあれば「feature-dev: 利用可能」「frontend-design: 利用可能」と報告。なければ完走メッセージで以下のコマンドを表示する:

```
📝 feature-dev / frontend-design プラグイン（要セルフインストール）

両方とも Anthropic 公式の claude-plugins-official マーケットに含まれており、
このマーケットは Claude Code に組み込みプリ登録されているため、
追加のマーケット add は不要です。Claude Code の入力欄に以下を順に打ってください:

  /plugin install feature-dev@claude-plugins-official
  /plugin install frontend-design@claude-plugins-official

→ scope を聞かれたら user を選択（全プロジェクトで使えるようにするため）

【それぞれの役割】
- feature-dev: 要件定義・設計判断（第3回以降で使う）
- frontend-design: UI 生成のフォールバック（第7回以降で使う）

【マーケット検証】
- claude-plugins-official: https://github.com/anthropics/claude-plugins-official
  Owner が anthropics になっていればOK（類似名は第三者の模倣の可能性あり）
```

`AskUserQuestion` は出さない（受講生が選択肢で迷わないように）。完走メッセージの「次にやること」セクションで該当コマンドを並べて表示する。

### 1-9. セキュリティ監査エージェント（security-auditor）の配置

`${CLAUDE_PLUGIN_ROOT}/references/agents/security-auditor.md` を `~/.claude/agents/security-auditor.md` に配置する。

このエージェントは OWASP Top 10 / 認証・認可 / JWT / CORS / CSP / 暗号化 / Supabase RLS ポリシー妥当性などを専門とするセキュリティ監査官。**第7回（認証・セキュリティ）と第10回（納品前レビュー）で明示的に呼び出して使う**。

- **初回**: 新規作成
- **更新時**: 最新版で上書き（ユーザーが手動で書き換えている場合も、プラグイン側の最新を優先。カスタマイズが必要なら別名で保存してもらう方針）

受講生は `~/.claude/agents/security-auditor.md` が配置されると、以下のような明示呼び出しで利用できる:

```
@agent-security-auditor このフォルダの認証周りをレビューして、OWASP Top 10 観点でリスクがあれば指摘して
```

または `Agent` ツールに `subagent_type: "security-auditor"` を指定することでも発動する。

### 1-10. Plan Mode 出力先の設定（plansDirectory）

`~/.claude/settings.json` の `plansDirectory` 設定を確認する。

この設定がないと、Plan Mode で作った計画書が `~/.claude/plans/` にグローバル保存されてしまい、リポジトリごとに混ざって見づらくなる。`./plans` に設定するとプロジェクトルート配下の `plans/` に出力されるため、リポジトリごとに計画書を管理できる。

- **`plansDirectory` がない** → 既存設定を保持したまま `"plansDirectory": "./plans"` を追記。「plansDirectory: 設定済み（./plans）」と報告
- **既に設定済み** → 値がユーザーのカスタム設定（例: `"./docs/plans"`）の場合はそのまま尊重。「plansDirectory: 既存設定を保持（<値>）」と報告
- **`"./plans"` で既設定** → 「plansDirectory: 最新」と報告

`~/.claude/settings.json` の他の既存設定（`permissions`, `hooks`, `enabledPlugins`, `language`, `sandbox` 等）は絶対に消さないこと。`plansDirectory` キーだけを追記する。

**起動位置の補足**: `"./plans"` はカレントディレクトリ相対だが、**VS Code のターミナルから起動すれば自動的にプロジェクトフォルダがカレントになる**ため、第1回でこの起動方法を案内できれば事故は起きない。完走メッセージでは長文警告を出さない（受講生が混乱するため）。

### 1-11. ステータスライン（コンテキスト・5h・7d 使用率の常時可視化）

Claude Code v2.1.80 で追加された `rate_limits` フィールドを使い、チャット欄下部にコンテキスト/5時間/7日間の使用率を常時表示する Python スクリプトを配置する。

**配置内容:**

1. プラグインの `scripts/statusline.py` を `~/.claude/scripts/statusline.py` にコピーする
   - `~/.claude/scripts/` ディレクトリがなければ作成
   - 既存の `statusline.py` がある場合は上書きしない（受講生が記事URL方式でカスタマイズ済みの可能性があるため）。「既に statusline.py が配置されています。記事URL方式でカスタマイズした場合は上書きを避けます」と報告
2. 実行権限を付与: `chmod +x ~/.claude/scripts/statusline.py`
3. `~/.claude/settings.json` の `statusLine` 項目を以下のように設定（既存設定がない場合のみ追加）:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "~/.claude/scripts/statusline.py",
       "padding": 1
     }
   }
   ```
   - 既存の `statusLine` 設定がある場合は上書きしない（受講生のカスタマイズを尊重）

**受講生への案内（完走メッセージで伝える）:**

```
📊 ステータスライン配置完了（Pattern 1: Minimal Dots フォールバック版）

Claude Code を再起動すると、チャット欄の下にこんな感じで表示されるよ:
  Claude  ·  ctx ● 23%  ·  5h ● 42%  ·  7d ● 67%

各数字の意味:
- ctx: 今のセッションのコンテキスト使用率（30〜40% で /clear-prep のサイン）
- 5h:  直近5時間の使用量（100% で5時間使えなくなる）
- 7d:  直近7日間の使用量（100% で1週間使えなくなる）

【他のデザイン（5パターン）に変えたい場合】
記事URLとPattern番号を Claude Code に貼るだけで自動で差し替えてくれます:
  https://nyosegawa.com/posts/claude-code-statusline-rate-limits/ これを入れたい. Pattern5

5パターンの紹介:
- Pattern 1: Minimal Dots（今配置済み）
- Pattern 2: Sparkline Gauge（縦ブロックゲージ）
- Pattern 3: Ring Meter（円グラフ風・最コンパクト）
- Pattern 4: Fine Bar + Gradient（細密プログレスバー・情報量最強）
- Pattern 5: Braille Dots（点字パターン・著者推奨・レトロかわいい）
```

**設計方針:**
- フォールバック用に Pattern 1（Minimal Dots）を同梱。もっとも軽量で初心者向け
- 受講生は第1回ハンズオンで「記事URLを Claude に渡して 5パターンから選ぶ」体験を推奨（Claude Code の本領発揮を体感する教材）
- 詰まったら配布済みの Pattern 1 がそのまま動くので安心

---

## 結果レポート

すべての確認結果を以下の形式でまとめて報告:

```
## セットアップ結果（v1.14.1）

### グローバル設定（全プロジェクト共通）
- rules/env-security.md: 作成 / 更新 / 最新
- rules/development.md: 作成 / 更新 / 最新
- rules/test.md: 作成 / 更新 / 最新
- rules/web-content-security.md: 作成 / 更新 / 最新
- rules/vercel-deployment.md: 作成 / 更新 / 最新（paths付き：vercel.json/next.config編集時のみ自動ロード）
- rules/supabase-security.md: 作成 / 更新 / 最新（paths付き：migrations/・*.sql編集時のみ自動ロード）
- docs/design-md-template.md: 作成 / 更新 / 最新（DESIGN.md カタログ + 軽量テンプレート、UI実装時に参照）
- docs/ui-prohibited-patterns.md: 作成 / 更新 / 最新（AIっぽさ排除チェックリスト、UI実装時に参照）
- docs/onboarding.md: 作成 / 更新 / 最新（Claude Code 中身の豆知識集、受講生が時間あるときに開く）
- skills/interview: 作成 / 更新 / 最新
- commands/clear-prep: 作成 / 更新 / 最新
- commands/new-project: 作成 / 更新 / 最新
- CLAUDE.md: 作成 / 既存（スキップ）
- settings.json $schema: 追加 / 設定済み
- denyリスト: 設定済み / N項目追加（Bash経路塞ぎ `cat/grep/head/tail/less/more *.env*` 含む）
- defaultMode / disableBypassPermissionsMode: 追加 / 設定済み / 既存設定を尊重
- sandbox: 完走後に `/sandbox` で有効化を案内（auto-allow 推奨・settings.json では状態検出不可のため一律案内）
- feature-dev プラグイン（内部レビュー用・必須・要セルフインストール）: 利用可能 / 要 `/plugin install`
- frontend-design プラグイン（UI生成フォールバック用・推奨・要セルフインストール）: 利用可能 / 要 `/plugin install`
- agents/security-auditor.md（セキュリティ監査用・第7回で使用）: 作成 / 更新 / 最新
- plansDirectory 設定: 設定済み（./plans）/ 既存設定を保持（<値>）/ 最新

✅ セットアップ完了！
グローバル設定は今後作成するすべてのプロジェクトに自動で適用されます。

📌 プロジェクト固有のセットアップ（.gitignore / .claudeignore / CLAUDE.md / 000_PROJECT_STATUS.md）は
   新規プロジェクトを作るときに `/new-project` で一括処理されます。
   `/school-starter:setup` はグローバル環境（`~/.claude/` 配下）の整備に専念する設計です。

📌 次にやること（この順序で進めてください）:

【重要】軽い作業（プラグインインストール = Claude Code 内で完結する数十秒）を
先に終えてから、重い作業（Codex CLI = OS レベルインストール）→ sandbox 有効化、
の順で進めます。sandbox は brew install / npm install -g 等を OS 層でブロックする
可能性があるため必ず最後にします。

1. feature-dev プラグインをインストール（要セルフ実行・約30秒）:
     /plugin install feature-dev@claude-plugins-official

   → scope を聞かれたら user を選択（全プロジェクトで使えるようにするため）

2. frontend-design プラグインをインストール（要セルフ実行・約30秒）:
     /plugin install frontend-design@claude-plugins-official

   → scope を聞かれたら user を選択

3. /reload-plugins （feature-dev / frontend-design を反映）

📋 受講生環境チェックリスト（M1 / Apple Silicon ユーザー向け・次の 4. に進む前に）

   M1 Mac 実機検証で「ここで詰まる」と判明した 3 つの罠を、Claude Code に
   質問して事前に潰してから Codex CLI のインストールに進んでください。

   a. 管理者権限の確認（標準ユーザーだと sudo / brew install が詰む）:
        Claude Code に↓を貼り付け:
        「私のユーザーは管理者ですか？
         dscl . -read /Groups/admin GroupMembership で確認して」

      → 出力に自分のユーザー名がなければ標準ユーザーです。
        その Mac のメイン管理者に頼んで管理者に昇格してから次へ進んでください。

   b. Homebrew インストール: 2 つの罠（パスワード入力 + Next steps 3 行）

      【罠 1: インストール途中で Password を聞かれる】
        Homebrew のインストール中に「Password:」と表示されます。これは
        Mac のログインパスワード（普段ログイン時に入力するもの）です。
        ★ 入力しても画面には何も表示されません（セキュリティのため・
           でもちゃんと入力されています）。落ち着いて打って Enter。
        → 「打てない・壊れた」と勘違いして詰むのが受講生 No.1 の罠。

      【罠 2: インストール後の Next steps 3 行】
        Claude Code に↓を貼り付け:
        「brew install 後に表示された ==> Next steps の PATH 設定 3 行
         （eval "$(/opt/homebrew/bin/brew shellenv)" を ~/.zprofile に
          追記する手順）を実行したか確認して」

      → これを飛ばすと brew コマンドが PATH に通らず、
        Codex CLI のインストールで「brew: command not found」が出ます。
        Homebrew は brew.sh のコピーアイコンから取得し、貼った直後に
        矢印キーで「最後の行が中途半端に切れていないか」を目視確認してください。

   c. コピペの罠（自分で気をつける運用ポイント）:
      - チャット欄からコマンドをコピペするとき、行末に余計な改行が
        混入することがあります。貼った直後に矢印キーで「最後の行が
        中途半端でないか」を目視確認してください。
      - ターミナルからコマンドをコピーするとき、% や $ より左
        （ユーザー名@ホスト名）まで一緒にコピーすると command not found
        になります。コマンド本体だけを選択する習慣をつけてください。

4. Codex CLI をインストール（受講生自身が Claude Code に聞いて自走）
   Claude Code の入力欄に以下のように打ってください:
     「Codex CLI を入れて。macOS なら brew、Windows なら winget で。
      私の OS を判定してインストール手順を案内して」
   → Claude が brew install --cask codex（macOS）/
     winget install OpenAI.Codex（Windows）等を案内してくれます
   → 認証は別ターミナルで `codex login`

   【フォールバック】CLI インストールが難しかった場合:
   - VS Code 拡張機能版の Codex を入れる
   - それも難しければ ChatGPT デスクトップアプリ / ブラウザ版で代替
   ※ 6 エリア構成（中央に Codex CLI 常駐）が最も推奨ですが、まず CLI を試して
     ダメなら拡張機能でという順序

5. sandbox を有効化（最後・必ずここまで完了してから）:
     /sandbox

   → 3 択 UI が出ます。矢印キーで以下を選んで Enter:
     1. Sandbox BashTool, with auto-allow      ← これを選ぶ（推奨）
     2. Sandbox BashTool, with regular permissions
     3. No Sandbox (current)                   ← デフォルト・選ばない

   → 「✓ Sandbox enabled with auto-allow for bash commands」と出れば成功

   【auto-allow の安全性について】
   auto-allow は「sandbox 内のコマンドだけ permission prompt をスキップする」モード。
   ask/deny ルールは常に尊重されるため、school-starter の deny リスト
   （Bash(curl *) / Bash(rm -rf .) / Read(~/.ssh/**) 等）はそのまま機能する。
   - 安全性は維持される（deny リストが効く + sandbox が OS 層で守る）
   - permission prompts が減る（受講生体験が良くなる）
   の二重メリット。「Hook + deny + rules + sandbox + 受講生判断」の多層防御と整合する。

   ※ ここで初めて OS 層の防御を ON にする。これ以降は brew/npm の
     全システム書き換えが制限される可能性があるが、Codex CLI と
     プラグインは既に入っているので影響なし。

6. Claude Code を再起動（クリーンな context で次のステップに進むため）
   ※ ステータスライン（ctx / 5h / 7d）は再起動しなくても /reload-plugins で既に反映されています。
     再起動の真の価値は「会話 context のクリーンスタート」です。

【授業で扱う内容】
- GitHub CLI: 第4回（Git/GitHub 回）で授業内で導入
- Codex CLI でつまずいた場合の Q&A: 第2回冒頭でフォローアップ

新しいアプリ開発を始めるときは、フォルダを作って **VS Code でそのフォルダを開き、
VS Code のターミナル（Ctrl+` または Cmd+J）から `claude` コマンドで Claude Code
を起動** → 最初に /new-project と入力してください。
（こうすればプロジェクトフォルダがカレントになり、./plans が正しく機能します）

🔍 設定を自分で確認したくなったら:
  - /permissions — 有効な allow / ask / deny ルールと設定ソースを一覧
  - /status — どのスコープの設定が効いているか確認

🆘 困ったとき・カスタマイズしたくなったら、Claude Code に質問:
  - 「CLAUDE.md ってどう書けばいい？」
  - 「Hook って何？」
  - 「Settings・Permissions の使いこなし方を教えて」
  - 「権限ルール（allow / ask / deny）の書き方を教えて」

  → Claude が ~/.claude/docs/onboarding.md（受講生向けリファレンス）を読んで答えてくれます。
    暗記不要・必要なときに「Claude に聞く」だけで OK。
```
