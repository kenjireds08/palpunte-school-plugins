# アプリの画面の録画（STEP 7）

録画は `templates/capture/record.mjs` を `promo-video/capture/record.mjs` に写し、上の「設定」と「場面」の所（`REPLACE`）だけを書き換えて使う。
ブラウザは自動で選ぶ: HyperFrames の書き出し用のブラウザ（STEP 0 の `browser ensure`）があればそれで画面を出さずに撮り、無ければ**パソコンの Google Chrome の窓を開いて**撮る（撮り終わるまで窓に触らない）。Playwright のブラウザは別にダウンロードしない。
パソコンの Chrome を画面なしで使うと録画の下に灰色の帯が出るので、record.mjs はその使い方をしない。

---

## 撮る前に（順番どおり）

1. **アプリを手元で動かす**: 受講生のアプリのフォルダで `npm run dev`（すでに動いていればそのまま）。設定の `capture.baseUrl` と `record.mjs` の `BASE` を、その URL（`http://localhost:3000` など）にする
   - **繋ぐのは自分のパソコンの中（localhost）だけ**。公開中のサイト（本番の URL）は撮らない（record.mjs が止める）
2. **画面に出る個人情報を書き出す**（事実確認表と同じ `docs/facts.md`）: 名前・電話番号・住所・メール・生年月日・お客さんの写真。開発中に**自分の実名で登録していた**例がある
3. **ダミーのデータにする**（下の「本物の情報を映さない」）
4. **アプリの中の写真を入れる**: 食事・商品などの写真が出る画面は、生成した写真（→ `images.md`）をダミーのデータに入れる
5. **画面に元からある文字と台本を比べる**: 画面の見出しや説明文に、台本と食い違う数字や言葉が無いか（画面に「自動で 5 か所」と出ていて、ナレーションの「2 つ」と食い違った例がある）。食い違ったら受講生に聞く

## 本物の情報を映さない

- **いちばん安全なのは、最初からダミーのデータで撮ること**。名前は「見本 花子」「サンプル 太郎」のように、ひと目でダミーと分かるもの。電話は `000-0000-0000`、メールは `sample@example.com`、住所は「〇〇市 見本町 1-1」
- 本物のデータが入った画面しか無いときは、`record.mjs` の `WORDS`（画面の文字の置き換え）に `[/本物の名前/g, "見本 花子"]` を書き、`FORBIDDEN` に置き換え前の語を全部書く。撮影中 0.2 秒ごとに探し、1 つでも出たらそのテイクを捨てる
  - **置き換え前の語（本物の名前など）をチャットに書き出さない**。`WORDS` と `FORBIDDEN` は受講生と相談しながら `record.mjs` に直接書き、撮り終えたら消す
  - 置き換えは画面の文字だけ（`<script>` の中は書き換えない＝アプリのデータが壊れるため）
- 書き出したあとにも確かめる（→ `compose.md`「書き出したあとの確認」）: コマを抜いて画面の文字を読む・動画を書き起こす

## 場面を書く（record.mjs の SCENES）

1 場面 = 1 本の録画。紹介動画のテンプレートでは、お客さんの画面（スマホ）を `user`、管理側（PC）を `admin` にする。

```js
const SCENES = {
  user: {
    device: "phone",          // スマホ 390x844（動画のスマホの枠と同じ）
    login: null,              // ログインが要るなら --login で保存した名前
    url: "/reserve",
    ready: async (page) => { await page.getByRole("heading", { name: "日付を選ぶ" }).waitFor(); },
    run: async (page, mark) => {
      await hold(page, 800);
      mark("日付");
      await moveAndClick(page, await one(page.getByRole("button", { name: "11月3日" }), "日付のボタン"));
      mark("コース");
      await moveAndClick(page, await one(page.getByRole("button", { name: "パン教室" }), "コース"));
      await typeSlow(page, page.getByLabel("お名前"), "見本 花子");
      mark("完了");
      await hold(page, 1500);
    },
  },
  admin: { device: "pc", login: "admin", url: "/admin", ready: …, run: … },  // PC 1280x800
};
```

- 部品: `moveAndClick`（丸いカーソルを動かしてから押す）・`typeSlow`（1 文字ずつ打つ。打つのはダミーの文字だけ）・`smoothScroll`・`one`（ちょうど 1 つに当たることを確かめる）・`hold`（待つ）・`dragSlow`（ドラッグ＆ドロップ。つかんだ物の写しと丸い印が付いて動く。画面なしの録画にはブラウザのドラッグ中の絵が映らず、カードが瞬間移動して見えるため）
- `mark("…")` で区切りの時刻を残す（`takes/<場面>.json`）。組み立てで録画を切り出す目印になる
- 押す所は `getByRole` / `getByLabel` で見つける。見た目の位置（座標）で押さない

## 撮る

```
node promo-video/capture/record.mjs              # 全部の場面
node promo-video/capture/record.mjs --only user  # 1 つだけ撮り直す
```

- 出力: `capture/takes/<場面>.mp4`（30fps）・`<場面>-first.png` / `-last.png`（最初と最後の画面・カーソル無し）・`<場面>.json`（区切りの時刻）
- 終了コード 3: どれかの場面が失敗した（理由が `✗` の行に出る）

## ログインが要る画面

- 最初に 1 回だけ: `node promo-video/capture/record.mjs --login admin` → Chrome の窓が開くので、**受講生が自分でログインする**（10 分まで待つ）。済むと `capture/credentials/admin.json` に保存して閉じる
- **パスワードを record.mjs・チャット・コマンドに書かない**。Claude はログインの代わりをしない
- `capture/credentials/` は開かない・表示しない・Git に入れない（ログインの状態そのもの）
- 「ログイン画面に戻されました」と出たら、ログインの期限切れ。`--login` をやり直す

## 書き込みが要る場面

record.mjs は**書き込みの通信（GET 以外）を全部止める**。止めた通信が 1 つでもあれば、そのテイクは捨てる（本物のデータを書き換えないため）。

- localStorage だけに保存するアプリ・画面を見せるだけの場面は、そのままでよい
- 「予約を確定する」など、押すとデータが 1 件増える所を撮りたいとき:
  1. 受講生に「撮影で、アプリのデータに 1 件増えます（通知のメールが飛ぶならそれも）。撮ったあと消します。よいですか」と聞く。**OK が出るまで足さない**
  2. `ALLOW_WRITES` にその通信だけを書く（例: `["POST", /^\/api\/reservations$/]`）
  3. 撮ったら、増えたデータを受講生と一緒に消す（record.mjs が通した書き込みの一覧を出す）
- 確定の手前（確認画面）で止めて、完了画面は撮らない、という撮り方でもよい

## うまく撮れないとき

| 症状 | 直し方 |
|---|---|
| 「Google Chrome を起動できません」 | Chrome を入れる（→ `setup.md`） |
| 録画の下や右に灰色の帯がある・画面が縮んでいる | 録画のブラウザの問題。`npx --yes hyperframes@0.8.77 browser ensure` を実行してから撮り直す |
| 「Playwright が見つかりません」 | `promo-video` で `npm install` |
| 「Video rendering requires ffmpeg binary」 | Playwright 専用の ffmpeg が無い。`promo-video` で `npm install` をやり直す（postinstall が入れる） |
| 「… が 0 個です」「2 個です」 | 押す所の名前が画面と違う。`ready` で待つ見出し・`getByRole` の名前を画面の文字に合わせる |
| 録画の最初が真っ白 | 撮り始めの白い幕（文字の置き換えが終わる前の画面を隠すもの）。`takes/<場面>.json` の「始まり」の秒から使う |
| 禁止語で止まる | 置き換え漏れ。`WORDS` を足す |
| 開発用の表示（Next.js の丸いボタンなど）が映る | `HIDE_CSS` に足す |
