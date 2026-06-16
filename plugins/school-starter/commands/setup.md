---
description: スクール環境のグローバル設定セットアップ・更新（プロジェクト固有の初期化は /new-project に分離）
allowed-tools: Bash, Read, Write, Edit, AskUserQuestion, Glob
---

スクール受講生の環境をセットアップする。初回でもアップデート後でも同じコマンドで対応する。

プラグイン内のテンプレートは `${CLAUDE_PLUGIN_ROOT}/references/` にある。

---

## 🔧 配置先ディレクトリの決定（最初に必ず実行・スキップ禁止）

このセットアップを始める前に、まず Bash で `echo "$CLAUDE_CONFIG_DIR"` を実行して配置先を確定する。

- **出力が空でない場合**（環境変数 `CLAUDE_CONFIG_DIR` が設定された隔離環境・講師の dry-run 等）:
  以降このドキュメント中の `~/.claude` という記述は、**すべて `$CLAUDE_CONFIG_DIR` の値**を指すものとして読み替えて配置する。
  **実 HOME の `~/.claude`（= `$HOME/.claude`）には絶対に書き込まない。**
- **出力が空の場合**（通常の受講生環境）:
  従来どおり `~/.claude`（= `$HOME/.claude`）に配置する。

⚠️ 重要な落とし穴: Claude Code 本体は `CLAUDE_CONFIG_DIR` を尊重するが、**シェルの `~`（チルダ）展開や `$HOME/.claude` は実 HOME のまま**である。そのため `cp ... ~/.claude/...` のようにリテラルに `~/.claude` を使うと、`CLAUDE_CONFIG_DIR` を設定していても実 HOME に書き込まれてしまう。**このステップで配置先を確定し、以降の全コピー・全書き込みでその確定済みディレクトリを使うこと。** 隔離環境では `CONFIG_DIR="$CLAUDE_CONFIG_DIR"`、通常環境では `CONFIG_DIR="$HOME/.claude"` を基準にすると安全（例: `cp ... "$CONFIG_DIR/rules/"`）。

以降の手順では便宜上 `~/.claude` と表記するが、これは上で確定した配置先ディレクトリを意味する。

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
6. setup 完走メッセージを確認するまで別の Claude Code 操作をしない

**注意（多層防御の前提）**: このプラグインの防御機構は「Hook（3種）+ deny リスト + rules + sandbox（有効化は任意・第1回では必須にしない）+ 受講生自身の判断」の**多層で構成**されている。どれか1つを完璧に頼るのではなく、**全層で拾う前提**（sandbox 未使用でも残りの層で守る）:

- Hook は Bash tool / Edit 系 tool だけを対象にしており、**MCP 経由のコマンド実行はブロックできない**
- deny リストは shell alias 経由や、Edit/Write でスクリプトを書き出してから実行する経路には効かない
- rules は Claude の「自制」を促すもので、プロンプトインジェクションでは突破される
- 新規 MCP を追加するときは、その MCP 固有のツール名で個別 deny が必要

**Hook は「最後の保険」であって唯一の防御ではない**。最終的な防御線は**受講生自身の目視確認**（引き継ぎリポジトリの CLAUDE.md 冒頭チェック・プラグイン内部スクリプトの目視・意図不明なコマンドを実行する前の確認）である、と位置付けを明確に伝える。

**サプライチェーン注意**: `/plugin marketplace add kenjireds08/palpunte-school-plugins` + `/plugin install school-starter@palpunte-school-plugins` は現状 GitHub のデフォルトブランチ最新コミットを拾う仕様。将来 GitHub アカウントが乗っ取られた場合、受講生の次回 setup で悪性コードが配布されるリスクがある。以下で軽減する:

- 受講生には **`/plugin update school-starter` → `/school-starter:setup` のタイミングで、更新時メッセージに自動表示される「今回の更新で変わったこと」（`${CLAUDE_PLUGIN_ROOT}/references/plugin-changelog.md` 由来）を読んでもらう**（想定外の変更がないか確認）
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

**⚠️ 上書き前に前回バージョンを控える**: `~/.claude/.school-starter-version` を**上書きする前に**、その時点の値を `PREV_VERSION` として記憶しておく（更新時メッセージで「どのバージョンから上がったか」の差分表示に使う）。ファイルが無ければ `PREV_VERSION = （なし）`。控えた後で、現在のバージョンを書き込む。

**🔑 セットアップモードの確定（結果レポートの出し分けに使う・必ず判定する）**: このバージョン確認の結果を、最後の「結果レポート」で出すメッセージの出し分けに使う。

- **`SETUP_MODE = 初回`** … `~/.claude/.school-starter-version` が**存在しなかった**場合（フレッシュ環境）
- **`SETUP_MODE = 更新`** … バージョンファイルが**存在した**場合（バージョンが違う＝更新、同じ＝再実行/最新 のどちらも `更新` 扱い）

結果レポートでは、`初回` ならフルの環境構築案内（Homebrew / Codex CLI / Node.js / 再起動 等）を、`更新` なら短縮サマリ＋`PREV_VERSION` 以降の変更点を出す。詳細は末尾「結果レポート」の出力厳守ルールに従う。

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
| `~/.claude/commands/interview-light.md` | `${CLAUDE_PLUGIN_ROOT}/references/commands/interview-light.md` | 受注前・モックアップ用の軽量ヒアリング（6問完結） |
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
- `Read(./.env)` / `Read(./.env.*)` は Read ツール経路を塞ぐ。`Bash(* .env*)`（`cat`/`grep` 等）と組み合わせて Read・Bash の両経路を二重に塞ぐ（Read deny だけだと `cat .env` で読めてしまう公式仕様の穴を埋める）。※ `.claudeignore` は公式機能でなく無効なので使わない
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

### 1-7. sandbox の案内（第1回では任意・参考紹介のみ / v1.18.0〜 必須ステップから除外）

**第1回開講方針（v1.18.0〜）**: sandbox は第1回では**必須ステップにしない**。完走メッセージの番号ステップ（1〜7）から外し、末尾の **💡【参考】ブロック**で「こういう機能がある」と紹介するだけにする。理由: Windows そのままの環境では sandbox に WSL2（Linux 環境）が必要で、有効化すると環境構築のやり直しが発生し、初回受講生の負担が大きい。第1回 HTML 教材（`palpunte-school-html` の `cheatsheet/lesson-01.html` / `lessons/01-mindset/06-school-starter.html`）も同じ「知っておこう枠」扱いで統一済み。

**このプラグインのレビュー運用はサンドボックス ON と両立するように設計されている**（将来有効化する受講生向けの担保）。コードレビューは `review` スキル（`feature-dev:code-reviewer` サブエージェント + 最終サマリーを Codex別タブにコピペ）で行うため、Codex CLI/プラグインとネットワーク層で競合しない。

**sandbox を使うとどう守れるか（参考ブロックの背景・必須ではない）**:

公式仕様として、`permissions.deny` の `Read(...)` / `Edit(...)` ルールは **Claude の組み込み Read / Edit tool にのみ適用**される。Bash サブプロセスには適用されないため、`Read(./.env)` deny を設定していても **`Bash(cat .env)` では秘密を読み取れてしまう**。サンドボックスは **OS レベルでプロセス単位のファイル・ネットワーク境界を強制**するため、Bash・Bash サブプロセス・MCP 経由の bash 実行ツールを含む全てのプロセスに対して一律のガードをかけられる。第1回では Hook + deny リスト + rules + 受講生判断の多層で守り、sandbox は余裕が出てきた受講生の追加の壁と位置づける。

**sandbox 状態の検出について（参考）**:

ノート PC 実機検証（2026-05-07）で判明した事実: **Claude Code は `/sandbox` 設定を `~/.claude/settings.json` には書き込まない**。sandbox 状態は Claude Code 内部で管理されており、ファイルベースで検出できない。したがって setup スクリプトは sandbox 状態を検出しようとせず、参考ブロックで紹介するだけにする。

- 結果レポートには「sandbox: 第1回では任意。完走メッセージ末尾の【参考】ブロックで紹介のみ」と記載する

**自分で確認したい受講生向けの案内**:
- `/sandbox` を再実行 → `(current)` がどこに付くかを目視確認
- または `/status` で現在の権限モード/sandbox 状態を表示

### 1-8. feature-dev / frontend-design プラグインの案内（自動インストールはしない）

**Anthropic 公式の設計支援プラグイン 2 種を案内する**。AskUserQuestion は出さず、コマンドを表示して受講生自身に打ってもらう。理由: `/plugin install` は Claude Code の入力欄でユーザー自身が実行するコマンドであり、Bash 経由の自動実行はできない。setup でエラーを出すと受講生が不安になるため、**最初から「自分でこのコマンドを打ってください」と案内するだけにする**。

**重要**: feature-dev と frontend-design は **両方とも `claude-plugins-official` マーケットに集約**されている（v1.8.4 で発覚・v1.6.1〜v1.8.3 では frontend-design を `claude-code-plugins` と誤記していた）。**`claude-plugins-official` はフレッシュな環境では未登録**のため、`/plugin install` の前に `/plugin marketplace add anthropics/claude-plugins-official` でマーケットを追加する必要がある（v1.17.2 まで「組み込みプリ登録済み・追加不要」と誤記していた・2026-05-17 テストランで判明）。

以下のパスで既にインストールされているかを確認:

**feature-dev**:
- `~/.claude/plugins/cache/claude-plugins-official/feature-dev`

**frontend-design**:
- `~/.claude/plugins/cache/claude-plugins-official/frontend-design`
- `~/.claude/skills/frontend-design/SKILL.md`

それぞれ既にあれば「feature-dev: 利用可能」「frontend-design: 利用可能」と報告。なければ完走メッセージで以下のコマンドを表示する:

```
📝 feature-dev / frontend-design プラグイン（要セルフインストール）

両方とも Anthropic 公式の claude-plugins-official マーケットに含まれます。
このマーケットはフレッシュな環境では未登録なので、まずマーケットを追加して
から、Claude Code の入力欄に以下を順に打ってください:

  /plugin marketplace add anthropics/claude-plugins-official
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

この設定がないと、Plan Mode で作った計画書が `~/.claude/plans/` にグローバル保存されてしまい、リポジトリごとに混ざって見づらくなる。`./docs/plans` に設定するとプロジェクトルート配下の `docs/plans/` に出力されるため、リポジトリごとに計画書を管理できる + 既存の `docs/` 配下に揃うのでドキュメント管理が綺麗に集約される（v1.15.0〜推奨値変更）。

- **`plansDirectory` がない** → 既存設定を保持したまま `"plansDirectory": "./docs/plans"` を追記。「plansDirectory: 設定済み（./docs/plans）」と報告
- **`"./plans"` で既設定（v1.14.x までの旧推奨）** → `"./docs/plans"` に更新。「plansDirectory: 更新（./plans → ./docs/plans）」と報告
- **`"./docs/plans"` で既設定** → 「plansDirectory: 最新」と報告
- **その他のカスタム値** → そのまま尊重。「plansDirectory: 既存設定を保持（<値>）」と報告

`~/.claude/settings.json` の他の既存設定（`permissions`, `hooks`, `enabledPlugins`, `language`, `sandbox` 等）は絶対に消さないこと。`plansDirectory` キーだけを追記・更新する。

**起動位置の補足**: `"./docs/plans"` はカレントディレクトリ相対だが、**VS Code のターミナルから起動すれば自動的にプロジェクトフォルダがカレントになる**ため、第1回でこの起動方法を案内できれば事故は起きない。完走メッセージでは長文警告を出さない（受講生が混乱するため）。

**v1.15.0 の変更理由**: v1.14.x までは `./plans` を推奨していたが、`check-md-creation.js` Hook の許可ディレクトリ（`docs/` 等）に `plans/` が含まれず、Plan Mode で `.md` を新規作成すると Hook にブロックされる自己矛盾があった。v1.15.0 で ① Hook に `plans/` を追加 + ② 推奨値を `./docs/plans` に変更（既存の docs/ に集約） の二重対策で解決。

### 1-11. ステータスライン（コンテキスト・5h・7d 使用率 + reset 時刻の常時可視化）

Claude Code v2.1.80 で追加された `rate_limits` フィールドを使い、チャット欄下部にコンテキスト/5時間/7日間の使用率 + reset 時刻 + ブランチ + 行差分を 2 行表示する **Node.js スクリプト**（Pattern 5 Fine Bar・v1.21.0〜 Node 製に移行）を配置する。

**配置内容（v1.17.1〜「プラグイン直参照」方式・v1.21.0〜 Node.js 製）:**

1. `~/.claude/settings.json` の `statusLine` 項目を以下のように設定（既存設定があれば**上書きする**・v1.17.1 で挙動変更）。**`<ホームの絶対パス>` は Claude が OS とホームディレクトリを判定して実際の絶対パスに展開して書く**（Mac は `/Users/ユーザー名`・Windows は `C:\\Users\\ユーザー名`）:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node \"<ホームの絶対パス>/.claude/plugins/marketplaces/palpunte-school-plugins/plugins/school-starter/scripts/statusline.js\"",
       "padding": 1
     }
   }
   ```
   - **🔴 重要（v1.21.0〜 Node 製の理由）**: 旧 `statusline.py` は Python 製で、**新品 Windows は本物の Python が未インストール**（Microsoft Store のダミー stub だけ）のため、受講生がステータスラインを表示できない問題が頻発した。Node.js は第1回で全受講生が必ず導入するので、Node 製にすれば**追加インストール不要**で全 OS で動く。あわせて reset 時刻フォーマットを OS 非依存化し、**Windows でも reset 時刻が表示される**ようにした
   - **`~` ではなく絶対パスで書く理由**: settings.json の `statusLine.command` は `~` が確実に展開されない（特に Windows）。Claude が OS 判定してホームを絶対パスに展開して書く。`node` 自体は PATH 解決なので、**Node のバージョンを上げてもパスが壊れない**（旧 Python 版で `python.exe` の絶対パスを直書きしてバージョン依存になっていた脆さを解消）
   - **プラグイン配下を直接参照**するため、`/plugin update school-starter` で構造的に最新化される（スクリプト本体 `scripts/statusline.js` が更新される）

**旧設計からの移行ポイント:**
- v1.10.0〜v1.17.0: `~/.claude/scripts/statusline.py` にコピーする方式 → setup 再実行しないと反映されない罠（v1.17.0 直後に学生環境で発覚）
- v1.17.1〜v1.20.x: プラグイン配下の `statusline.py` を直接参照 → `/plugin update` で同期。ただし Python 依存は残存（Windows で表示不可問題）
- v1.21.0〜: **Node.js 製 `statusline.js` を直接参照**。Python 依存を撤廃。旧 `scripts/statusline.py` は後方互換のためリポに残置（参照されなくなる無害な残骸）
- ⚠️ **既存設定の上書き判断**: 旧版で `statusline.py` を**自分でカスタマイズした受講生**は、本 setup 再実行で settings.json が `statusline.js` 直参照に切り替わると自分のカスタムが効かなくなる → 完走メッセージで「カスタマイズ版を使い続けたい場合は settings.json を手動で書き戻してください」と案内

**受講生への案内（完走メッセージで伝える）:**

```
📊 ステータスライン配置完了（Pattern 5 Fine Bar・v1.17.1〜プラグイン直参照方式）

Claude Code を再起動すると、チャット欄の下にこんな感じで 2 行表示されるよ:
  Line 1: Opus 4.7 | ctx ▍▍▎ 30% | +100/-20 | main
  Line 2: 5h ▌▌▌▌▌ 50% reset 6:20 | 7d ▎▎▎ 30% reset 5/19 6:06

各数字の意味:
- ctx: 今のセッションのコンテキスト使用率（30〜40% で /clear-prep のサイン）
- 5h:  直近5時間の使用量（100% で5時間使えなくなる）+ reset 時刻
- 7d:  直近7日間の使用量（100% で1週間使えなくなる）+ reset 時刻
- branch: 現在の Git ブランチ（main 直接編集事故予防に効く）
- +N/-N: 未コミット変更の行差分（溜まりすぎたら commit のサイン）

【改善ポイント】
・プラグイン更新（/plugin update school-starter）だけで自動的に最新版に追従する（v1.17.1〜）。
・Node.js 製になり（v1.21.0〜）、Python のインストールが不要に。Windows でも reset 時刻が表示されるようになった。

【他のデザイン（5パターン）に変えたい場合】
記事URLとPattern番号を Claude Code に貼るだけで自動で差し替えてくれます:
  https://nyosegawa.com/posts/claude-code-statusline-rate-limits/ これを入れたい. Pattern2

5パターンの紹介:
- Pattern 1: Minimal Dots（v1.16.x まで配布版・最軽量）
- Pattern 2: Sparkline Gauge（縦ブロックゲージ）
- Pattern 3: Ring Meter（円グラフ風・最コンパクト）
- Pattern 4: Braille Dots（点字パターン・レトロかわいい）
- Pattern 5: Fine Bar + reset 時刻表示（今配置済み・v1.17.0〜デフォルト）
```

**設計方針（v1.17.1〜）:**
- デフォルト: Pattern 5 Fine Bar + reset 時刻（情報量最強・受講生のリミット管理を支援）
- 受講生は第1回ハンズオンで「記事URLを Claude に渡して 5パターンから選ぶ」体験を推奨（Claude Code の本領発揮を体感する教材）
- 詰まったら配布済みの Pattern 5 がそのまま動くので安心
- プラグイン直参照 = `/plugin update` で勝手に最新化される運用罠ゼロ設計

---

## 結果レポート

すべての確認結果を以下の形式で報告する。確認結果サマリー（「グローバル設定」セクション）は両モード共通。その後ろに、`SETUP_MODE = 初回` なら「📌 次にやること（初回）」+【参考】sandbox を、`SETUP_MODE = 更新` なら「📌 更新サマリ（更新・再実行）」だけを続ける。`（v1.22.0）` の部分は 1-1 で取得した現在のプラグインバージョンに置き換えて出力する。

**【出力厳守ルール（SETUP_MODE で出し分ける）】**

1-1 で確定した `SETUP_MODE` によって、確認結果サマリー（「グローバル設定」セクション）の**後ろに続けるブロックを切り替える**。確認結果サマリー自体は両モード共通でそのまま出す。

- **`SETUP_MODE = 初回` のとき** → 下記テンプレートの **「📌 次にやること（初回）」セクション（手順 1〜7）+ 末尾の【参考】sandbox ブロック**を出力する。このとき**省略・要約・項目の統合・番号の変更・項目の追加を一切せず、7 項目すべてと【参考】ブロックをそのまま出力する**こと。とくに「5. Codex CLI をインストール」「6. Node.js をインストール」「7. Claude Code を再起動」は OS レベルの必須ステップであり、脱落すると受講生が第2回以降で詰む。sandbox は第1回では必須にしないため番号ステップから外し末尾の【参考】ブロックに置いている（省略しないこと）。テンプレートに無いステップ（`/school-starter:check` 等）を足さないこと。
- **`SETUP_MODE = 更新` のとき** → 下記テンプレートの **「📌 更新サマリ（更新・再実行）」ブロックだけ**を出力する。**初回専用の手順 1〜7（Homebrew / Codex CLI / Node.js / 再起動 等）と【参考】sandbox ブロックは出力しない**（環境構築は完了済みのため、毎回流すと冗長で受講生の混乱の元になる）。

「報告」は確認結果サマリー部分の話であり、`初回` の次にやることリストを短縮してよいという意味ではない。**初回のフル案内を更新時にも流す／更新時に初回案内を出す、の取り違えをしないこと。**

```
## セットアップ結果（v1.22.0）

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
- sandbox: 第1回では任意。完走メッセージ末尾の【参考】ブロックで紹介のみ（Mac は任意でおすすめ / Windows は WSL2 必要なため後日・必須ステップにはしない）
- feature-dev プラグイン（内部レビュー用・必須・要セルフインストール）: 利用可能 / 要 `/plugin install`
- frontend-design プラグイン（UI生成フォールバック用・推奨・要セルフインストール）: 利用可能 / 要 `/plugin install`
- agents/security-auditor.md（セキュリティ監査用・第7回で使用）: 作成 / 更新 / 最新
- plansDirectory 設定: 設定済み（./docs/plans）/ 更新（./plans → ./docs/plans）/ 既存設定を保持（<値>）/ 最新

✅ セットアップ完了！
グローバル設定は今後作成するすべてのプロジェクトに自動で適用されます。

📌 プロジェクト固有のセットアップ（.gitignore / CLAUDE.md / 000_PROJECT_STATUS.md）は
   新規プロジェクトを作るときに `/new-project` で一括処理されます。
   `/school-starter:setup` はグローバル環境（`~/.claude/` 配下）の整備に専念する設計です。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
↓↓↓ ここから先は SETUP_MODE = 初回 のときだけ出力 ↓↓↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 次にやること（初回・この順序で進めてください）:

【重要】軽い作業（プラグインインストール = Claude Code 内で完結する数十秒）を
先に終えてから、重い作業（Codex CLI・Node.js = OS レベルインストール）の
順で進めます。
（sandbox は第1回では必須にしません。最後の【参考】ブロックを参照）

1. 公式マーケットプレイスを追加（要セルフ実行）:
     /plugin marketplace add anthropics/claude-plugins-official

   → これを飛ばすと次の install が「Marketplace not found」になります。

2. feature-dev プラグインをインストール（要セルフ実行・約30秒）:
     /plugin install feature-dev@claude-plugins-official

   → scope を聞かれたら user を選択（全プロジェクトで使えるようにするため）

3. frontend-design プラグインをインストール（要セルフ実行・約30秒）:
     /plugin install frontend-design@claude-plugins-official

   → scope を聞かれたら user を選択

4. /reload-plugins （feature-dev / frontend-design を反映）

📋 受講生環境チェックリスト（M1 / Apple Silicon ユーザー向け・次の 5. に進む前に）

   M1 Mac 実機検証で「ここで詰まる」と判明した 3 つの罠を、Claude Code に
   質問して事前に潰してから Codex CLI のインストールに進んでください。

   a. 管理者権限の確認（標準ユーザーだと sudo / brew install が詰む）:
        Claude Code に↓を貼り付け:
        「私のユーザーは管理者ですか？
         dscl . -read /Groups/admin GroupMembership で確認して」

      → 出力に自分のユーザー名がなければ標準ユーザーです。
        その Mac のメイン管理者に頼んで管理者に昇格してから次へ進んでください。

   b. Homebrew インストール: 2 つの罠（パスワード入力 + Next steps）

      【罠 1: インストール途中で Password を聞かれる】
        Homebrew のインストール中に「Password:」と表示されます。これは
        Mac のログインパスワード（普段ログイン時に入力するもの）です。
        ★ 入力しても画面には何も表示されません（セキュリティのため・
           でもちゃんと入力されています）。落ち着いて打って Enter。
        → 「打てない・壊れた」と勘違いして詰むのが受講生 No.1 の罠。

      【罠 2: インストール後の Next steps】
        インストール後に「==> Next steps」が表示されます。そこに PATH 設定の
        コマンド（eval "$(/opt/homebrew/bin/brew shellenv)" 等）が含まれていたら
        実行してください。
        ※ 管理者ユーザー＋最近の Homebrew では /etc/paths.d/ に自動登録され、
          PATH 設定行が出ないこともあります（2026-05-17 テストランで確認）。
          その場合は新しいターミナルを開けば brew コマンドが使えます。

      → brew が使えない時は Claude Code に「brew: command not found に
        なる、PATH を通して」と聞けば解決します。

   c. コピペの罠（自分で気をつける運用ポイント）:
      - チャット欄に表示された長いコマンドは画面幅で 2 行に折り返されて
        見えることがあります。貼った直後に Enter を押す前に「1 行に
        なっているか・最後が切れていないか」を目視確認してください
        （2026-05-17 テストランで実際に発生）。
      - ターミナルからコマンドをコピーするとき、% や $ より左
        （ユーザー名@ホスト名）まで一緒にコピーすると command not found
        になります。コマンド本体だけを選択する習慣をつけてください。

5. Codex CLI をインストール（受講生自身が Claude Code に聞いて自走）
   Claude Code の入力欄に以下を貼り付けてください:
     「ターミナルでCodexを起動させたいからCodex CLIを導入して」
   → Claude が OS を判定し、brew install codex（macOS）/
     winget install OpenAI.Codex（Windows）等を案内してくれます
   → 認証は別ターミナルで `codex login`

   【フォールバック】CLI インストールが難しかった場合:
   - VS Code 拡張機能版の Codex を入れる
   - それも難しければ ChatGPT デスクトップアプリ / ブラウザ版で代替
   ※ 6 エリア構成（中央に Codex CLI 常駐）が最も推奨ですが、まず CLI を試して
     ダメなら拡張機能でという順序

6. Node.js をインストール（要セルフ実行）
   Codex CLI で Homebrew が入ったので、つづけて Node.js も入れます。
   Claude Code の入力欄に以下を貼り付けてください:
     「Node.js を導入して。Homebrew はもう入っています。」
   → Node.js は第2回からのアプリ開発で必須です。さらに school-starter の
     Hook（セキュリティ機能）は Node.js で動くため、ここで入れて初めて
     Hook が正しく働くようになります（Node 導入前は Hook が静かにスキップ
     される設計）。

7. Claude Code を再起動（クリーンな context で次のステップに進むため）
   ※ ステータスライン（ctx / 5h / 7d）は再起動しなくても /reload-plugins で既に反映されています。
     再起動の真の価値は「会話 context のクリーンスタート」です。

💡【参考】sandbox という追加の安全機能（第1回では必須ではありません）
   Claude Code には「sandbox」という、もう一段上の安全機能があります。
   Claude が実行するコマンドを「隔離された箱の中」だけで動かす OS 層の壁です。
   第1回では必須にしません——「こういう機能がある」と知っておけば十分です。

   ・Mac の方: 有効化は任意でおすすめ。やりたい場合は Codex CLI・Node.js を
     入れ終わってから（先に ON にすると brew / npm install が OS 層で
     ブロックされるため）/sandbox を実行し、3択UIで「auto-allow」を選ぶと、
     deny リストを尊重したまま permission prompt が減ります。
   ・Windows をそのまま使っている方: sandbox には WSL2（Windows 上の
     Linux 環境）が必要なので、今回はスキップで構いません。
   ・どちらの場合も、慣れてきたら Claude に「sandbox を入れたい」と
     相談しながら後日有効化できます。

   sandbox がなくても、school-starter の Hook + deny リスト + rules の
   防御は全員に効いているので、学習を進めるうえで支障はありません。

【授業で扱う内容】
- GitHub CLI: 第4回（Git/GitHub 回）で授業内で導入
- Codex CLI でつまずいた場合の Q&A: 第2回冒頭でフォローアップ

新しいアプリ開発を始めるときは、フォルダを作って **VS Code でそのフォルダを開き、
VS Code のターミナル（Ctrl+` または Cmd+J）から `claude` コマンドで Claude Code
を起動** → 最初に /new-project と入力してください。
（こうすればプロジェクトフォルダがカレントになり、./docs/plans が正しく機能します）

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
↑↑↑ ここまでが SETUP_MODE = 初回 のときだけ出力する範囲 ↑↑↑
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 更新・再実行時の出力（SETUP_MODE = 更新）

`SETUP_MODE = 更新` のときは、上の「グローバル設定」確認結果サマリーの後ろに、**初回ブロック（手順 1〜7・sandbox 参考）の代わりに以下の短縮サマリだけ**を出力する。`（v1.22.0）` は現在のバージョンに置き換える。

**「📋 今回の更新で変わったこと」の作り方（自動表示）**: ここはハードコードせず、以下の手順で changelog から動的に組み立てる。

1. `${CLAUDE_PLUGIN_ROOT}/references/plugin-changelog.md` を Read する。
2. 各バージョンの節（`## vX.Y.Z — 日付` 見出し）のうち、**1-1 で控えた `PREV_VERSION` より新しいバージョンの節をすべて**抜き出す（新しい順）。`PREV_VERSION` と現在バージョンが同じ（＝再実行/最新）の場合は、**現在バージョンの節だけ**を出す。
3. 抜き出した各節の箇条書きを、バージョン見出しごとに整形して「📋 今回の更新で変わったこと」に並べる。
4. changelog が読めない・現在バージョンの節が無い場合は、`（changelog 未整備のため変更点の詳細は git log / Notion 更新履歴を参照）` の1行に差し替える（エラーで止めない）。

```
✅ school-starter 更新完了！（v1.22.0）

🔧 今回 setup で揃えたグローバル設定（~/.claude/ 配下）:
   → 配置・更新したファイルは上の「グローバル設定」セクションのとおりです
     （作成 / 更新 / 最新 のラベルで反映済み）

📋 今回の更新で変わったこと（v<PREV_VERSION> → v<現在> の差分）:
   ＜ここに changelog から抜き出した該当バージョンの箇条書きを挿入＞
   例:
   【v1.24.7】
   - 更新時メッセージに「今回の更新で変わったこと」を自動表示する仕組みを追加
   【v1.24.6】
   - /school-starter:setup を初回／更新で出し分け（更新時は長文を出さない）

   （想定外の変更がないかの目視チェックも兼ねています）

これでグローバル環境は最新版に揃いました。
※ Homebrew / Codex CLI / Node.js / Claude Code 再起動 などの初回専用の
  環境構築手順は、すでに完了している前提のため表示していません。
  （フレッシュな環境で初めて setup する場合のみ、それらのフル案内が出ます）

🔍 設定を自分で確認したくなったら:
  - /permissions — 有効な allow / ask / deny ルールと設定ソースを一覧
  - /status — どのスコープの設定が効いているか確認

🆘 困ったとき・カスタマイズしたくなったら、Claude Code に質問:
  → Claude が ~/.claude/docs/onboarding.md を読んで答えてくれます。
```
