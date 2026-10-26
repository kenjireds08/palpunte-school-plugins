# 写真の生成（STEP 3・6）

生成した写真を入れた紹介動画は、文字と画面だけの版より**格段に見やすい**ことが分かっている。積極的に使う。
1 本の動画で **20〜30 枚まで**（道具が 30 枚を超えると止める）。画像そのものは **1 枚 約 1.6 円**（medium・1536×1024 の出力 343 トークン）。人物・場面を細かく指示する文の入力分が足されて、実際は **1 枚 1.8〜1.9 円ほど**（見本の 8 枚で 14.6 円）。30 枚で約 57 円。

---

## どこに使うか

| 使いどころ | 何の写真 | 置き場所（テンプレート） |
|---|---|---|
| 冒頭の困りごと | 利用者が困っている生活の場面を 3 枚ほど（電話をかけ直している・メモを探している・待たされている） | 紹介動画 S1 の `s1-a/b/c.png` |
| アプリの中の写真 | 食事・商品・料理・部屋など、アプリが写真を表示する所に入れる本物らしい写真。**手描きの絵や SVG にしない**。架空のデータに入れてから録画する | アプリのダミーデータ（→ `capture.md`） |
| 単調な場面のあいだ | 人物・生活の場面（アプリを使ったあとの、ほっとした場面など） | 紹介動画 S5 の `s5-bg.png`・15 秒の S2 の `hero.png` |

- 冒頭の困りごとを**紙片やメモが散らばる絵にしない**（毎回同じ形になる）
- 締めを**汎用のアイコン（四角いアプリのアイコンなど）で終わらせない**。アプリの名前の文字で締める（テンプレートどおり）

## 守ること

- **画面に文字・ロゴ・看板の文字を入れない**（文字は HTML で載せる）。プロンプトに「no text, no logos, no signage」を入れる
- **実在の人物・店・建物・場所に似せない**。有名人の名前・実在の店名・地名をプロンプトに書かない
- **スマホや PC を見ている人物は、画面が本人の方を向いていて、こちらからは背面か横しか見えない**こと（画面がカメラ側を向いた写真が出たことがある）
- **1 本の中で人物の国・地域をそろえる。既定は日本人**（日本向けのアプリなら、人物が写る全部のプロンプトの「誰が」に `Japanese` を入れる。手だけの写真も同じ）。冒頭は日本人・途中の 1 枚だけ海外の人物、のように混ざると目立つ（見本アプリで、国を書かなかった 3 人の場面だけ西洋風の人物で出た）。日本向けでないアプリは設定の `images.peopleRegion` を変える。`gen-images.ts` は、人物が写るプロンプトにこの語が無いと 1 枚も作らずに止まる
- **人物の性別・年代を勝手に変えない**。台本で決めた人物像（例: 40 代の女性の店主）をそのまま書く。決まっていなければ受講生に聞く
- 写真に写る画面の中身は作らせない（読める文字が出る）。アプリの画面は録画を使う

## プロンプトの型

`promo-video/docs/images.jobs.json`（comp-to-lp と同じ形）:

```json
[
  {
    "name": "s1-a",
    "kind": "photo",
    "size": "1536x1024",
    "prompt": "Photorealistic lifestyle photo. A Japanese woman in her 40s at a small kitchen table, holding a phone to her ear and writing on a paper notebook, looking slightly tired. Soft daylight from a window, warm natural colors, shallow depth of field. The phone screen faces her, we only see the back of the phone. No text, no logos, no signage, no readable writing. Not resembling any real person or real place.",
    "out": "assets/raw/s1-a.png"
  }
]
```

- 書く順: 写真であること → 誰が（性別・年代・**国・地域＝既定 Japanese**）→ どこで → 何をしている → 光と色 → 画面の向き → 文字なし・実在に似せない
- 大きさ: 場面の写真は `1536x1024`（横長）、アプリの中の写真は `1024x1024`
- 送ったプロンプトは `docs/prompts/` に残る（道具が書く）

## 作る

```
# 見積もり（費用ゼロ・キーを読まない）。承認のとき受講生に見せる
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-images.ts" --jobs promo-video/docs/images.jobs.json --config promo-video/showcase.config.json --dry-run
# 作る（承認の後）。途中で止まったら同じコマンドで再開する
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-images.ts" --jobs promo-video/docs/images.jobs.json --config promo-video/showcase.config.json
```

- 費用の上限は設定の `images.budgetYen`（既定 60 円・300 円まで）。超える見積もりは 1 枚も作らずに止まる（終了コード 2）
- 台帳は `promo-video/docs/image-ledger.tsv`（道具が書く。手で書き換えない）。「状態不明」と出たら同じコマンドで再開する（二重に払わない作り）
- 1 枚だけ作り直す: `--only s1-a --suffix -v2`（元を残して別名で作る）
- キーは環境変数 → 共通の置き場 → 補講2 の image-studio の順に探す（→ `setup.md`「鍵を保存する」）

## 検品（全枚を開いて見る・STEP 6）

作った写真は**全部 Read で開いて**、次を 1 枚ずつ確かめる。1 つでも外れたら作り直す（プロンプトに外れた点を書き足す）。

- [ ] 読める文字・ロゴ・看板が無い（ぼやけた文字のようなものも不可）
- [ ] 画面（スマホ・PC）が人物の方を向いていて、こちらに画面が見えない
- [ ] 人物の性別・年代が台本どおり
- [ ] **全部の写真の人物の国・地域がそろっている**（既定は日本人。1 枚でも違えば、その 1 枚を作り直す）
- [ ] 実在の人・店・建物に見えない
- [ ] 手・指・顔が崩れていない
- [ ] 動画の色（設定の `brand`）と大きく外れていない

合格した写真を、使う場所の `assets/img/` に写す（15 秒は `cm/assets/img/`、紹介動画は `intro/video/assets/img/`）。
