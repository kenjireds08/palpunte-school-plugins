# palpunte-school-plugins

ぱるぷんてスクール上級コース向け Claude Code プラグイン。

## プロジェクト概要

- **GitHub**: kenjireds08/palpunte-school-plugins
- **現在のバージョン**: v1.5.0
- **バージョン管理**: `plugins/school-starter/.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` の両方をバンプ

## 更新手順

1. ファイル修正
2. plugin.json + marketplace.json のバージョンバンプ
3. コミット & プッシュ
4. Notionガイドページの更新履歴に追記（下記構造を参照）

## Notionガイドページ構造

**ページ**: school-starter プラグイン ガイド
**ページID**: `339af2cc-b9b5-812a-aa63-e25efa68468c`
**URL**: https://www.notion.so/school-starter-339af2ccb9b5812aaa63e25efa68468c
**親ページ**: `31aaf2cc-b9b5-81ec-af75-e99eac61dd33`（上級コース カリキュラム設計）

### 主要セクションのブロックID

| セクション | タイプ | ブロックID |
|-----------|--------|-----------|
| インストール方法 | heading_1 | `339af2cc-b9b5-813d-8adb-f6682daf3d92` |
| 含まれる機能 | heading_1 | `339af2cc-b9b5-8172-985c-f87559a3b2bd` |
| コマンド一覧 | heading_1 | `339af2cc-b9b5-81d4-9bcc-de3f26b630ca` |
| プラグインの更新方法 | heading_1 | `339af2cc-b9b5-81a2-9185-db598d05d8de` |
| おすすめ MCPサーバー | heading_1 | `33faf2cc-b9b5-813b-9ec9-f4f94291af72` |
| 更新履歴 | heading_1 | `339af2cc-b9b5-81e2-b8ba-e9a8919e9e43` |

### 更新履歴の追記パターン

更新履歴セクションは時系列順（古い順）。新バージョン追記時は最後の bulleted_list_item の `after` に追加する。

```
構造:
heading_1: 更新履歴
  paragraph: v1.0.0（日付）— 初回リリース
  paragraph: v1.1.0（日付）
  paragraph: v1.2.0（日付）
    bulleted_list_item: 変更内容
  paragraph: v1.3.0（日付）
    bulleted_list_item: 変更内容
    ...
  paragraph: v1.4.0（日付）
    bulleted_list_item: 変更内容
    ...
  paragraph: v1.5.0（日付）   ← 最新
    bulleted_list_item: 変更内容
    ...
```

**追記手順:**
1. `NOTION_FETCH_BLOCK_CONTENTS` でページの最後のブロックIDを取得
2. `NOTION_ADD_MULTIPLE_PAGE_CONTENT` で `parent_block_id=ページID`, `after=最後のブロックID` で追加
3. paragraphブロック（バージョン+日付、太字）→ bulleted_list_itemブロック（変更内容）の順

### 新セクション追加パターン

含まれる機能の下にセクション追加する場合:
- 該当の heading_1 の後にある最後の子ブロックを特定
- `after` にそのブロックIDを指定して heading_2 + 内容を追加
