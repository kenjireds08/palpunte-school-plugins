# palpunte-school-plugins

未来AI学院上級コース向け Claude Code プラグイン。

## プロジェクト概要

- **GitHub**: kenjireds08/palpunte-school-plugins
- **現在のバージョン**: v1.24.5
- **バージョン管理**: `plugins/school-starter/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` の両方をバンプ

## 機能追加の判断フロー（Anthropic公式「Seeing like an agent」より）

新機能を追加したくなったら、**いきなりツール/コマンド/フックを追加する前に**、以下の順で検討する：

1. **サブエージェントで対応できないか？**
   - 独立した context で処理して、結果だけ main agent に返す形
   - 例: Claude Code Guide agent（Anthropic公式事例）
   - 新しいツールを増やさずに機能を追加できる

2. **既存スキルの progressive disclosure で対応できないか？**
   - SKILL.md に references/ を置いて、必要なときだけ段階的に読み込む
   - 既存の supabase, supabase-postgres-best-practices など参照

3. **既存ツール/コマンドの拡張で対応できないか？**
   - 新しい要素を追加せずに、既存の組み合わせで実現

4. **それでも足りなければ、初めて新規ツール/コマンド/フックを追加**

**原則:** ツールが増えると Claude の判断肢が増え、主業務（コードを書く）の context が圧迫される。現在 Claude Code 公式でもツール数は約20個に絞られている。

## 定期的な棚卸し

**モデルが賢くなると、以前必要だったツールが制約になる**。半年に1回、以下を見直す：

- 各機能が Opus 最新版でも本当に必要か
- モデルが自律的に対応できるようになった機能はないか
- サブエージェントやスキルに置き換えられる機能はないか

### 次回棚卸し時の検証候補（要検証）

- **GlassWorm不可視文字検出Hook**（v1.2.0で追加）: Opus 4.6 が自律的に検出できる可能性あり
- **サブコマンド連結チェックHook**（v1.3.0で追加）: Opus 4.6 が自律的にガードできる可能性あり

これらは現在動作しているが、次回 Opus バージョンアップ後に「本当に必要か」実験ベースで検証する。

## 更新手順

1. ファイル修正（上記「判断フロー」に沿って）
2. plugin.json + marketplace.json + この CLAUDE.md「現在のバージョン」のバンプ
3. コミット & プッシュ
4. Notionガイドページの更新履歴に追記（下記構造を参照）

## Notionガイドページ構造

**ページ**: school-starter プラグイン ガイド
**ページID**: `339af2cc-b9b5-812a-aa63-e25efa68468c`
**URL**: https://www.notion.so/school-starter-339af2ccb9b5812aaa63e25efa68468c
**親ページ**: `31aaf2cc-b9b5-81ec-af75-e99eac61dd33`（上級コース カリキュラム設計）

### ⚠️ Notion 操作は Python（直 REST）で行う・Composio は使わない（2026-06-13 方針確定）

読み書きとも **`~/.claude/scripts/notion.py`（環境変数 `NOTION_API_KEY` を使う直 REST）** で行う。**Composio MCP は調子が悪いため使わない**。トークンの値は絶対に標準出力・チャット・ログに出さない。

- 書き込み: `notion.py raw --method PATCH --path <APIパス> --body-file <JSON>`（body は `json.dump` で生成し手書き構文エラーを避ける）
- 読み取り: notion.py に読み取りコマンドは無いので、`NOTION_API_KEY` を `os.environ` から読む使い捨て Python（`GET /v1/blocks/{id}/children`・ページネーション＋`has_children` 再帰でトグル内も辿る）で取得する

### 主要セクションのブロックID

| セクション | タイプ | ブロックID |
|-----------|--------|-----------|
| インストール方法 | heading_1 | `339af2cc-b9b5-813d-8adb-f6682daf3d92` |
| 含まれる機能 | heading_1 | `339af2cc-b9b5-8172-985c-f87559a3b2bd` |
| コマンド一覧 | heading_1 | `339af2cc-b9b5-81d4-9bcc-de3f26b630ca` |
| プラグインの更新方法 | heading_1 | `339af2cc-b9b5-81a2-9185-db598d05d8de` |
| おすすめ MCPサーバー | heading_1 | `33faf2cc-b9b5-813b-9ec9-f4f94291af72` |
| 更新履歴 | heading_1（トグル見出し） | `339af2cc-b9b5-81e2-b8ba-e9a8919e9e43` |
| 最新アップデート callout | callout | `374af2cc-b9b5-81a5-b99f-f28ef16033e9` |

### 更新履歴の追記パターン（Python・直 REST／2026-06-13 実態確認）

更新履歴は **heading_1「更新履歴」（`339af2cc-b9b5-81e2-b8ba-e9a8919e9e43`）がトグル見出し**で、その子に **各バージョンが toggle ブロック**で時系列（古い順）に並ぶ。各 toggle の中身は変更内容の `bulleted_list_item`。
※ かつての「paragraph 形式」の記述は誤り。実態は toggle 構造。

```
更新履歴 (heading_1・トグル見出し)
  toggle: 「v1.23.0」(bold) +「（2026-06-11）— 概要」(通常)
    bulleted_list_item: 変更内容
    ...
  toggle: 「v1.24.5」(bold) +「（日付）— 概要」   ← 最新
    bulleted_list_item: 変更内容
```

**追記手順（すべて notion.py 直 REST。Composio は使わない）:**
1. 使い捨て Python（`GET /v1/blocks/339af2cc-b9b5-81e2-b8ba-e9a8919e9e43/children`）で **最新バージョンの toggle ID** を特定（＝`after`）
2. `json.dump` で body を生成（`after` ＋ `children`=toggle 配列。各 toggle に `rich_text`＝バージョン番号 `bold:true`＋「（日付）— 概要」、`children`＝`bulleted_list_item`）
3. 追記: `python3 ~/.claude/scripts/notion.py raw --method PATCH --path /v1/blocks/339af2cc-b9b5-81e2-b8ba-e9a8919e9e43/children --body-file <body.json>`
4. **冒頭 callout（`374af2cc-b9b5-81a5-b99f-f28ef16033e9`）も「最新アップデート（最新版）」に更新**: `python3 ~/.claude/scripts/notion.py raw --method PATCH --path /v1/blocks/374af2cc-b9b5-81a5-b99f-f28ef16033e9 --body-file <callout.json>`
5. 再取得して反映を検証（最新版が末尾に並ぶ／callout が更新されている）

### 新セクション追加パターン

含まれる機能の下にセクション追加する場合:
- 該当の heading_1 の後にある最後の子ブロックを特定
- `after` にそのブロックIDを指定して heading_2 + 内容を追加
