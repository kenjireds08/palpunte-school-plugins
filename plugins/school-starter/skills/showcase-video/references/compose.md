# 組み立て・書き出し・サムネイル（STEP 8〜9）

動画は HyperFrames（HTML ＋ GSAP の動きを mp4 に書き出す道具）で作る。コマンドは `npx --yes hyperframes@0.8.77 …`（版を固定する）。
テンプレートの使い方は各 `index.html` の先頭のコメントにもある（「REPLACE」で検索）。

---

## 共通の決まり

- **1920×1080・30fps**。15 秒と紹介動画は**同じ見た目**（色・フォント・角の飾り・ワイプ）にそろえ、紹介動画はテンポだけ落とす
- 色はアプリの色（設定の `brand`）。テンプレートの `:root` の `--bg` `--accent` `--ink` を同じ値にする
- **文言はコードで確かめた機能だけ**（事実確認表）。済んだ `REPLACE` は `DONE` に書き換える（残っていると `showcase-check.ts template` が止める）
- **間延びさせない**: 声の無い間が長く続く場面を作らない（書き出したあとコマで確かめる → 下）
- 素材の準備（どちらの動画も同じ）:
  ```
  # 動きの部品（GSAP）
  mkdir -p promo-video/cm/assets/vendor promo-video/intro/video/assets/vendor
  cp promo-video/node_modules/gsap/dist/gsap.min.js promo-video/cm/assets/vendor/
  cp promo-video/node_modules/gsap/dist/gsap.min.js promo-video/intro/video/assets/vendor/
  # 効果音（計算で作る。著作権の心配なし）
  node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-sfx.ts" --out promo-video/cm/assets/audio
  node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-sfx.ts" --out promo-video/intro/video/assets/audio
  ```
  Windows の PowerShell では `mkdir` と `cp` の代わりに、Claude のファイル操作で写してよい

## 15 秒の動画（`templates/cm-15s` → `promo-video/cm/`）

1. `templates/cm-15s` の 3 ファイル（`index.html`・`package.json`・`hyperframes.json`）を `promo-video/cm/` に写す
2. 場面の区切りは固定（S1 0–2.5 / S2 2.5–5.5 / S3 5.5–10 / S4 10–12.5 / S5 12.5–15）。中身だけ差し替える
   - S2 の写真: `assets/img/hero.png`（生成した生活の場面）。数字 2 つは事実確認表にあるものだけ
   - S3 の録画: `capture/takes/user.mp4` → `assets/video/user.mp4`。`data-media-start` は録画の中で使い始める秒（`takes/user.json` の区切りの時刻を見る）。**PC だけのアプリ**はスマホの枠を PC の枠に替える（`REPLACE` のコメント）
   - S5: アプリの名前・タグライン・行動の呼びかけ。**15 秒には制作の名前を入れない**
3. BGM: `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-bgm.ts" --style cm --duration 15 --logo-at 12.5 --out promo-video/cm/assets/audio/bgm.wav`
4. `#glyph-warm` に画面の文字を全部入れてから、フォント: `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-fonts.ts" --html promo-video/cm/index.html`
5. 確かめて書き出す（→「書き出し」）

## 紹介動画（`templates/intro` → `promo-video/intro/video/`）

**音が先・映像が後。** 声（wav）ができて長さが分かるまで、映像の時刻を決めない。

1. `templates/intro` の 3 ファイルを `promo-video/intro/video/` に写す。骨格が B（PC だけ）・C（立場が複数）なら、先頭のコメントのとおり場面を消す・写す
2. 声を写す: `intro/narration/s1-hook.wav` … `s6-name.wav` → `intro/video/assets/audio/`
3. 時刻を決める（`index.html` の `const T = { … }` と各 `data-start`）:
   - 場面の長さ = 声の `effectiveSeconds`（`<id>.json`）＋ 前後の間 0.3〜0.6 秒
   - `<audio id="vo-sN">` の `data-start` = 場面の開始 + 0.3、`data-duration` = `effectiveSeconds`（小数 2 桁）
   - 手順の光る時刻・寄りの時刻は、書き起こしの語の時刻（`<id>.words.json` の `tokens[].at`＋場面の開始）に合わせる
   - 場面を足したら**後ろの時刻を全部ずらす**（JS の `T` と、`<video>` `<img>` `<audio>` の `data-start`、`#root` の `data-duration`）
4. 写真: `s1-a/b/c.png`（困りごと）・`s5-bg.png`（使ったあとの場面）→ `assets/img/`。録画: `takes/user.mp4`・`admin.mp4` → `assets/video/`、前後の静止画 `takes/user-first.png`・`user-last.png`・`admin-first.png` → `assets/img/`
5. 制作の名前を入れる（手で書かない）:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/credit.ts" apply --config promo-video/showcase.config.json --html promo-video/intro/video/index.html
   ```
   `CREDIT_AT`（名前が出る時刻）は「せいさく」の語の時刻に合わせる。名前は 2 秒以上画面に出す
6. BGM: `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-bgm.ts" --style narrated --duration <合計秒> --logo-at <S6 の開始秒> --groove-from <S1 の終わり> --out promo-video/intro/video/assets/audio/bgm.wav`
   - 声より BGM が大きく聞こえたら、`index.html` の BGM の `data-volume` を下げる（既定 0.22）
7. `#glyph-warm` に画面の文字を全部入れ（制作の名前は `credit.ts apply` が入れる）、フォント: `gen-fonts.ts --html promo-video/intro/video/index.html`（`credit.ts apply` の後）
8. 確かめる: `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/showcase-check.ts" timing --config promo-video/showcase.config.json`（HTML の時刻と声の長さの突き合わせ。NG 0 まで）

## 書き出し

アプリのフォルダで（動画のフォルダを引数で渡す。`cd` しない）:

```
npx --yes hyperframes@0.8.77 check promo-video/cm             # 書き方・実行・配置・コントラストの検査。エラー 0 まで直す
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/showcase-check.ts" template --config promo-video/showcase.config.json
npx --yes hyperframes@0.8.77 render promo-video/cm --output promo-video/final/15秒.mp4
npx --yes hyperframes@0.8.77 check promo-video/intro/video
npx --yes hyperframes@0.8.77 render promo-video/intro/video --output promo-video/final/紹介動画.mp4
```

- 受講生が途中で見たいときは `npx --yes hyperframes@0.8.77 preview promo-video/intro/video`（ブラウザで開く。終わったら止める）
- 書き出し用のブラウザ（約 200MB）が無ければ、初めての書き出しのときに自動でダウンロードする（数分。STEP 0 で入れていれば不要）。会社のネットワークなどでダウンロードできないときは、パソコンの Chrome を使う（遅くなるが書き出せる）:
  - Mac: `HYPERFRAMES_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx --yes hyperframes@0.8.77 render promo-video/cm --output promo-video/final/15秒.mp4`
  - Windows（PowerShell）: `$env:HYPERFRAMES_BROWSER_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"; npx --yes hyperframes@0.8.77 render promo-video/cm --output promo-video/final/15秒.mp4`
- 書き出したら長さを確かめる: `showcase-check.ts timing --config promo-video/showcase.config.json --mp4 promo-video/final/紹介動画.mp4`
- 20MB を超えたら、共有用に軽くした版も作る（大きい mp4 はアプリのプレビューで再生できないことがある）:
  ```
  ffmpeg -v error -y -i promo-video/final/紹介動画.mp4 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart promo-video/final/紹介動画_軽量.mp4
  ```

## サムネイル（OGP 1200×630・`templates/thumb` → `promo-video/stills/`）

型はアプリの形で選ぶ: **スマホ＋PC**（`phone-pc.html`・お客さんのスマホ画面があるときの既定）／**PC だけ**（`pc.html`）／**スマホだけ**（`phone.html`）。

スマホ＋PC 型の形（変えない）: スマホを PC の左手前に重ね、2 台とも上下の真ん中あたり（PC 690,170・倍率 0.44／スマホ 524,262・倍率 0.4）。上に余白を取らない。角の飾り（カギ括弧）は左上と右下。

1. 選んだ型を `promo-video/stills/thumb.html` に写し、`thumb.css`・`thumb.js` も `stills/` に、`tools/render.ts` を `stills/tools/render.ts` に写す
2. 素材: スマホの見せ場の画面 → `stills/assets/img/phone-hold.png`（390×844）、管理画面 → `stills/assets/img/admin-hold.png`（1280×800）。`capture/takes/<場面>-last.png` など、カーソルの無い静止画を使う
3. 左の文字（英字の小見出し・アプリの種類・キャッチ 2 行・機能 3 つ）を埋める。事実確認表にあることだけ。色は設定の `stills.theme` と `stills.brand`
4. フォント: `gen-fonts.ts --html promo-video/stills/thumb.html`
5. 書き出す: `node promo-video/stills/tools/render.ts` → `promo-video/stills/final/thumb-ogp.png`。画像の欠け・フォント落ち・**端末が枠からはみ出す／文字と端末が重なる／画面の大事な所が隠れる**と、書き出さずに止まる（文字を短くする）
6. 確かめる: `showcase-check.ts thumb --config promo-video/showcase.config.json`（1200×630・配置の検査に合格・書き出しの後に直していない）

## 書き出したあとの確認（STEP 9・本物の情報が残っていないか）

1. **コマを抜いて、画面の文字を読む**: `ffmpeg -v error -i promo-video/final/紹介動画.mp4 -vf fps=0.5,scale=960:-1 <作業用のフォルダ>/f%03d.png` → 全部 Read で開いて、本物の名前・電話番号・住所・メール・エラーの表示が無いかを見る（15 秒も同じ）
2. **書き起こす**: `transcribe.ts --media promo-video/final/紹介動画.mp4` → 本物の名前などを読み上げていないか・最後の名前の読みが合っているか
3. **止まって見える所**: 1 で抜いたコマを順に見て、同じ画面が 2 枚（4 秒）以上続く場面が無いか（あれば、その場面に動きを足すか短くする）。テンプレートは画面全体に細かい粒（grain）を重ねているので、コマの差を数字で測る方法では止まっている所を見つけられない
4. サムネイルも Read で開いて見る
5. 1 つでも見つかったら直して書き出し直す。作業用のフォルダのコマ画像は確認が済んだら消す
