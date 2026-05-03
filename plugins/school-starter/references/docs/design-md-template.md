# DESIGN.md テンプレート（スクール版）

> フロントエンドUI実装開始時に **このテンプレートをコピーしてプロジェクトルートに `DESIGN.md`** として配置する。
> 各セクションの `[TODO]` をプロジェクトに合わせて埋める。
> Claude Code が UI 実装時に自動で参照し、AIっぽさを排除した品質の高いUIを生成できるようになる。

## 使い方

1. **awesome-design-md-jp カタログから参考サービスを2-3個選ぶ**（後述）
2. このテンプレートをプロジェクトルートに `DESIGN.md` としてコピー
3. クライアントの要望と参考サービスのDESIGN.mdを元に各 [TODO] を埋める
4. Claude Code がフロントエンド実装時に自動で参照する
5. UI実装時は **`docs/ui-prohibited-patterns.md` も併せて確認**

## 出典
- Google Stitch DESIGN.md 仕様
- awesome-design-md-jp（日本語タイポグラフィ拡張、kzhrknt 氏）
- jp-ui-contracts（hirokaji 氏 note記事 2026-04-11）
- フクダカヨコ氏 note記事「DESIGN.mdの作り方」（2026-04-30、5フェーズ20-30時間の実運用記録）
- ui-prohibited-patterns.md（AIっぽさ排除ルール）

---

## awesome-design-md-jp カタログ（24サービス）

> 日本のサービスのDESIGN.md実例集。**プロジェクトに置くだけでUI品質が上がる**。
> リポジトリ: https://github.com/kzhrknt/awesome-design-md-jp
> ギャラリー: https://kzhrknt.github.io/awesome-design-md-jp/gallery.html

### Claudeから提案するワークフロー

**フロントエンドUI実装開始時、必ず以下を実施する:**

1. プロジェクトの性格（業務系SaaS / EC / メディア / ホームページ / 管理画面 等）を把握
2. **`AskUserQuestion` で以下を提示**（チャットの平文質問ではなく選択肢ボタンで聞く）:
   - 「awesome-design-md-jpのカタログから候補を3つ提案します。気に入ったものがあれば選んでください。なければ frontend-design スキルでゼロから作成します」
   - 候補は性格に近いサービスを下表から3つピックして提示（推奨は1つに `(Recommended)` を付ける）
   - 4つ目の選択肢として「気に入ったものがない → frontend-design でゼロから作成」を必ず入れる
3. 受講生が awesome-design-md-jp から選んだ場合 → そのサービスのDESIGN.mdをWebFetch/gh CLI で取得
4. 取得したDESIGN.mdを参考にプロジェクト固有のDESIGN.mdを作成
5. 「気に入ったものがない」を選んだ場合 → **`frontend-design` スキル（Anthropic 公式プラグイン）を呼び出してゼロから生成**
   - frontend-design が未インストールの場合は `/plugin install frontend-design@claude-code-plugins` を案内
   - `/school-starter:setup` の 1-9-b で伴走インストール済みなら即発動可能

### 性格別おすすめ

| プロジェクト性格 | おすすめサービス |
|---------------|---------------|
| **業務系SaaS** | SmartHR、freee、MoneyForward、Cybozu、Sansan |
| **管理画面・データが多い** | MoneyForward、freee、SmartHR |
| **教育・学習** | Notion、freee、Cybozu（業務感+柔らかさ） |
| **EC・マーケットプレイス** | Mercari、Rakuten、Tabelog、Cookpad |
| **メディア・ブログ** | note、Zenn、Qiita、WIRED |
| **クリエイター・コミュニティ** | pixiv、connpass、note |
| **コーポレート・大手** | Apple Japan、Toyota、MUJI、Rakuten |
| **モダン・洗練** | STUDIO、Notion、Apple Japan |
| **メッセージング** | LINE、Notion |
| **動画・エンタメ** | ABEMA |

### 全24サービスのDESIGN.md取得URL

`https://github.com/kzhrknt/awesome-design-md-jp/blob/main/design-md/{サービス名}/DESIGN.md`

利用可能サービス（小文字で）: `apple` / `smarthr` / `freee` / `note` / `novasell` / `muji` / `mercari` / `studio` / `toyota` / `line` / `cookpad` / `moneyforward` / `cybozu` / `qiita` / `rakuten` / `tabelog` / `pixiv` / `zenn` / `connpass` / `sansan` / `notion` / `abema` / `droga5` / `wired`

### 海外ブランド版: getdesign.md

海外サービスのDESIGN.md。**「Apple風で」「Tesla風で」と言われた時に1コマンドで取れる**:

```bash
npx getdesign@latest add notion
# → DESIGN.md がプロジェクトルートに自動生成
```

利用可能ブランド: Apple / BMW / Tesla / Notion / Airtable など。
**注意**: 海外発DESIGN.mdは日本語にすると微妙になりがち（Notionは例外）。

### システム系での注意

awesome-design-md-jp はホームページ系・コーポレート系が多いため、**管理画面・業務システムにそのまま適用するのは難しい**。以下の要素だけを参考にする：

| 要素 | システム系で使える部分 |
|------|---------------------|
| Typography（フォント・行間・字間） | そのまま使える |
| Color Palette | そのまま使える |
| Layout Principles | グリッド・余白の考え方は共通 |
| Component Stylings | ボタン・カードの基本パターンは流用可 |

---

## jp-ui-contracts プロファイル（用途別5種）

日本語UIは一枚岩ではない。**プロジェクト性格に応じて初期方針を分ける**。

| プロファイル | 想定 | 行間 | 本文サイズ | 余白 | 密度 | 例 |
|-------------|-----|------|-----------|------|------|---|
| **base** | 出発点 | 1.7 | 16px | 中 | 中 | — |
| **media** | メディア・ブログ・記事 | 1.8〜2.0 | 16〜18px | 広 | 低 | note、Zenn |
| **saas** | 業務UI・管理画面 | 1.6〜1.7 | 14〜16px | 中 | 中〜高 | SmartHR、freee |
| **docs** | 技術文書・ヘルプ | 1.7〜1.8 | 16px | 広 | 中 | Notion docs |
| **dashboard** | 分析画面・KPI | 1.4〜1.6 | 13〜14px | 狭 | 高 | MoneyForward |

### プロファイル選択の判断基準

1. **「ユーザーは何分この画面にいるか？」**
   - 数秒〜1分 → dashboard / 1〜5分 → saas / docs / 5分以上 → media
2. **「1画面の情報量は？」**
   - 少（5要素以下）→ media / 中（10〜20要素）→ saas / docs / 多（30以上）→ dashboard
3. **「テキスト量と操作量のバランスは？」**
   - テキスト9割 → media / 操作9割 → saas / dashboard / 半々 → docs

**実装ルール**: UI実装開始時、awesome-design-md-jp から参考サービスを選ぶのと**同時に**、上記5プロファイルのどれかを宣言する。

### 日本語UIで壊れやすい場所

- [ ] 本文の `line-height` は **1.7〜2.0** にする（欧文の1.4〜1.5とは違う）
- [ ] `letter-spacing: 0.04〜0.1em` で可読性向上
- [ ] 本文と見出しは別の `line-height` / `letter-spacing` にする（本文は1.7-2.0、見出しは1.4-1.5）
- [ ] `word-break: break-all` を body 全体に適用しない（日本語が崩れる）。URL対策は専用クラスで `overflow-wrap: anywhere`
- [ ] 表とフォームは本文ルールを引きずらない（役割ごとに契約を分離）

---

## 実運用Tips（フクダカヨコ氏 note記事より）

### drift対処 -- 発見した瞬間に正本を決める
DESIGN.md整備中に Figma vs JSON vs 実装の値の食い違いは必ず見つかる。
- [ ] drift発見 → **正本を即決**（推奨: Figmaを正本にする）
- [ ] DESIGN.mdに「JSONは古い、実装はFigmaの値を使う」と明記
- [ ] JSON更新は **別タスクとして切り出す**（後回しでOK）

### 仮称運用 -- 🆕マーク → 一括置換
- [ ] 仮称は **🆕マーク** で明示（後で一括置換しやすくする）
- [ ] パターンが揃ったら、まとめてFigma確認 → 一括で正式名に置換

### placeholder運用 -- 完成を待たない
- [ ] 📋 デザイン共有後に追記 のような placeholder を **意図的に残す**
- [ ] placeholderがあること自体が「ここはまだ未定義」という重要な情報

### 完成ファイル行数の目安
| ファイル | 行数 |
|---------|------|
| DESIGN.md（入口） | 200-250 |
| foundations.md（トークン） | 600-700 |
| component-mapping.md | 700-800 |
| **patterns.md（画面パターン）** | **1500-1700** |
| operation.md | 250-300 |

### AIとのチャット運用
- [ ] フェーズごとにチャットを分ける（context圧迫回避）
- [ ] 既存ドキュメントは **添付ではなく必要部分を引用** で渡す
- [ ] 重要な決定事項は AI に **要約させて次のチャットに引き継ぐ**

---

## DESIGN.md 本体テンプレート（コピーして使う）

### 1. Visual Theme & Atmosphere
- **デザイン方針**: [TODO: クリーン / モダン / 温かみ / プロフェッショナル 等]
- **密度**: [TODO: 情報密度高い業務UI / ゆったりメディア型 / バランス型]
- **キーワード**: [TODO: 3〜5つの形容詞]
- **参考サービス**: [TODO: awesome-design-md-jp から選んだもの]
- **プロファイル**: [TODO: base / media / saas / docs / dashboard から1つ]

### 2. Color Palette
**Primary**:
- Primary: [TODO: `#______`] -- CTAボタン、リンク
- Primary Dark: [TODO: `#______`] -- ホバー・アクティブ

**Semantic**:
- Danger: `#EF4444` / Warning: `#F59E0B` / Success: `#10B981`

**Neutral**:
- Text Primary: [TODO]（例: `#1E293B` = slate-800）
- Text Secondary: [TODO]（例: `#64748B` = slate-500）
- Border: [TODO]（例: `#E2E8F0` = slate-200）
- Background: [TODO]（例: `#F8FAFC` = slate-50）
- Surface: [TODO]（例: `#FFFFFF`）

**ダークモード**: [TODO: 対応する / しない]

### 3. Typography（日本語タイポグラフィ -- 最重要）

```css
/* 本文 */
font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
line-height: 1.8;        /* Tailwind: leading-relaxed〜leading-loose */
letter-spacing: 0.05em;  /* Tailwind: tracking-wide */

/* 見出し */
line-height: 1.4;
letter-spacing: 0.02em;
font-feature-settings: "palt" 1, "kern" 1;  /* 見出しのみ */

/* グローバル必須 */
body {
  overflow-wrap: anywhere;
  line-break: strict;
}
```

| Role | Tailwind | Size | Weight |
|------|---------|------|--------|
| Display | text-4xl/5xl | 36-48px | bold (700) |
| H1 | text-3xl | 30px | bold (700) |
| H2 | text-2xl | 24px | semibold (600) |
| H3 | text-xl | 20px | semibold (600) |
| Body | text-base | 16px | normal (400) |
| Small | text-sm | 14px | normal (400) |

**チェック**:
- [ ] 日本語本文の `line-height` は **1.7〜2.0**（必須）
- [ ] `word-break: break-all` を body 全体に適用しない
- [ ] `font-feature-settings: "palt"` は **見出しのみ**（本文に適用すると可読性が下がる）

### 4. Component Stylings（shadcn/ui 準拠）

**Buttons**: 角丸 [TODO: rounded-md / rounded-lg]、shadcn/uiの default / sm / lg を基本に
**Cards**: 角丸 [TODO: rounded-lg / rounded-xl]、影 [TODO: shadow-sm / shadow-md / なし]、パディング p-4〜p-6
**Forms**: 入力欄高さ [TODO: h-10 / h-12]、ラベル位置 上、バリデーションは入力欄直下に赤文字
**Tables**（業務UIの場合）: ヘッダー bg-muted、行ホバー hover:bg-muted/50

### 5. Layout
- **最大幅**: [TODO: max-w-5xl / max-w-6xl / max-w-7xl]
- **セクション間余白**: [TODO: py-12 / py-16 / py-20]
- **コンテンツ間余白**: [TODO: gap-4 / gap-6 / gap-8]
- **コンテナパディング**: px-4 sm:px-6 lg:px-8

### 6. Do's and Don'ts

**Do**:
- [ ] 日本語本文の行間は 1.7 以上を確保
- [ ] ボタンテキストは簡潔に（4文字以内が目安）
- [ ] カラーはこのファイルのパレットから選ぶ（ハードコード禁止）
- [ ] 見出しに `font-feature-settings: "palt"` を適用

**Don't（AIっぽいデザイン排除）**:
- [ ] グラデーション背景を多用しない
- [ ] ネオンカラー・紫グラデーションを使わない
- [ ] カード角丸を過度に丸くしない（rounded-3xl以上は禁止）
- [ ] 影を重ねがけしない（shadow-lg以上は原則禁止）
- [ ] カード上部/左端のカラーバーを使わない
- [ ] `text-black` を使わない（`text-slate-900` 等を使う）
- [ ] サイドバーに暗い背景を使わない（`bg-white` + ボーダー）

**詳細は `docs/ui-prohibited-patterns.md` も参照（必読）**

### 7. Responsive
- **ブレークポイント**: Tailwind標準 (sm:640 / md:768 / lg:1024 / xl:1280)
- **モバイルファースト**: [TODO: はい / いいえ]
- **ナビゲーション**: [TODO: ハンバーガー / ボトムナビ / サイドバー]

---

## Agent Prompt Guide

このDESIGN.mdを参照する際の注意:

1. **Section 3（Typography）は最優先で遵守する** -- 日本語UI品質に直結
2. **Section 6 の Do's and Don'ts は厳守** -- 特にDon'tsの「AIっぽいデザイン」パターンは絶対に避ける
3. **色は必ずこのファイルのカラーパレットから選ぶ** -- ハードコード禁止
4. **迷ったら shadcn/ui のデフォルトスタイルに寄せる**
5. **`docs/ui-prohibited-patterns.md` も併せて確認する**（必読）
