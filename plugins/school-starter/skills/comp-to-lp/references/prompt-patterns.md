# プロンプトの型（gpt-image-2.5・medium）

猫カフェ LP で 50 枚前後・失敗ほぼ 0 だった型。題材の言葉を差し替えて使う。**英語で書き、画像に入れる日本語だけ「」で囲んで、そのまま渡す**。

## 1. 写真: 共通の前置き（すべての写真の先頭に付ける）

サイト全体の雰囲気を 1 つの文にまとめ、全部の写真に同じ文を付ける（色味がそろう）。カンプの色から作る。

```
Photorealistic lifestyle photograph for a cozy Japanese cat cafe website. Consistent look across the whole set: warm beige and cream color palette, light natural oak wood furniture, soft bright natural window light, gentle warm film tone, shallow depth of field, clean and calm, high detail, anatomically correct cats (exactly four legs, two ears, natural eyes). No watermark, no logo, no border, no added text overlay.
```

前置きのあとに、その 1 枚の中身を書く:
- 主役の位置を画面の割合で書く（`On the RIGHT HALF: ...` / `Cat occupies the lower two thirds.`）
- 見出しを重ねる側は空けるよう書く（`The LEFT 40% of the frame is bright, airy, softly out of focus and low in detail ... suitable for overlaying headline text.`）
- カンプの細かい所（柄・小物・向き）を具体的に（`long-haired brown tabby with white chest and white paws`）

## 2. 写真をページの地の色に溶かす

```
The background around the subject must be a very soft, plain, warm cream color (hex #FAF5EE) wall and a light cream floor, blurred and almost empty, so the photo can fade seamlessly into a cream web page.
```

HTML 側は枠に `mask-image: linear-gradient(90deg, transparent 0, #000 18%, #000 82%, transparent 100%)` をかける（グラデーションなら、ファイルを直接開いても表示される）。

## 3. 横長の帯（CTA の背景など）

1536x1024 のまま、**大事なものを高さの % で帯の中に収める**。CSS で細長く切っても主役が残る。

```
Composition like a very wide web banner placed in the middle of a taller photo: everything important sits in a horizontal strip from 35% to 70% of the image height. Left side of the strip: ... Right side of the strip: ... Center of the strip: plain warm cream wall, empty. Top 35% and bottom 30% of the image: plain cream wall above, plain blurred wooden table surface below, nothing else.
```

CSS: `object-fit: cover; object-position: 50% 52%;` のように縦の位置を合わせる。

## 4. アイコン（白地に黒 → 透過）

```
Flat minimal vector icon in a clean modern UI icon style, pure black (#000000) uniform rounded strokes of medium thickness on a perfectly plain pure white (#FFFFFF) background. Single icon centered with generous empty margin (icon fills about 60% of the canvas). No text, no shadow, no gradient, no gray, no border, no frame, no background shape. <形の説明>
```

- 形は図形の言葉で書く: `A cat paw print silhouette, SOLID FILLED black: one large rounded pad at bottom and four oval toe pads above in an arc.`
- 塗りつぶしか線かを書く（`SOLID FILLED` / `outline only`）
- SNS のアイコンも**会社名ではなく形で**書く（Instagram → `a rounded square outline with a circle in the center and a small dot at the upper right`）。他社のロゴそのものは作らない
- サイズは 1024x1024。書き出しは jobs.json の `final` に色ごとに並べる（mask.mjs batch が透過して塗り直す）

## 5. 手書き文字（白地に黒 → 透過）

```
Japanese casual handwriting, written with a thin felt-tip pen, friendly and slightly playful but neat and legible, pure black (#000000) ink on a perfectly plain pure white (#FFFFFF) background. Nothing else in the image: no paper texture, no lines, no decorations, no shadow. Each character must be written exactly and correctly as given (correct stroke structure for every kanji). Line 1: 「のんびり」 Line 2 (indented right): 「まってるにゃ…」
```

- 行ごとに `Line 1:` `Line 2 (indented right):` と分け、カンプの改行・字下げをまねる
- 英字の筆記体は `English cursive handwriting in two lines: line 1 'Good cats', line 2 'Good time.'`
- 横長は 1536x1024。**検品で画数の多い漢字（癒・豊・質・答・渋・過・幸 など）を拡大して 1 画ずつ見る**

## 6. ロゴマーク

- 絵の部分だけを白地に黒で作って透過。**文字の部分は HTML/CSS**
- 既存のキャラクター・他社のロゴに似せる言葉（「〇〇風」）は書かない

## 7. 地図

```
Flat minimal vector city street map illustration seen from directly above: light gray (#E6E4E1) city blocks separated by white streets of varying widths, some streets diagonal, and a slightly thicker gray railway line crossing the upper-left area. Clean, muted, no shadows. Absolutely no text, no labels, no numbers, no pins, no icons, no compass, no legend.
```

駅名・店名・徒歩分数・ピンは HTML で重ねる。実在のお店なら、最後は Google マップの埋め込みなどに差し替える。

## 8. 画像の中に文字を入れてよいか

- よい: 写真の中の看板・黒板など「風景の一部」（それでも 1 文字ずつ検品する）
- いけない: 見出し・価格・営業時間・ボタンの文字・電話番号など、**サイトの情報そのもの**。必ず HTML テキストにする

## 9. quality

- medium 固定（道具が medium で送る）。high は約 4 倍の費用で、表示の大きさではほとんど差が見えない
- 構図の失敗は quality では直らない。プロンプトの位置の指定を直す
