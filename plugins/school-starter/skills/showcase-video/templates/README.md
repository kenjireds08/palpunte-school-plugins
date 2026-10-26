# showcase-video のテンプレート

| ファイル | 写す先（アプリのフォルダの中） | 中身 |
|---|---|---|
| `package.json` | `promo-video/package.json` | 道具の依存（Playwright・GSAP・フォント）。`promo-video` で `npm install` を 1 回 |
| `showcase.config.example.json` | `promo-video/showcase.config.json` | 設定（アプリの名前・色・声・写真の費用の上限・録画の URL）。`credit` は `credit.ts save`、`tts` は `voice-choice.ts save` が書く |
| `narration.script.gemini.example.json` | `promo-video/intro/narration/narration.script.json` | ナレーションの台本・**Gemini の声**のとき（場面ごとの原稿。最後は `{{credit}}`） |
| `narration.script.example.json` | `promo-video/intro/narration/narration.script.json` | ナレーションの台本・**ElevenLabs の声**のとき（どちらか 1 つだけ写す） |
| `cm-15s/` | `promo-video/cm/` | 15 秒の動画（`index.html`・`package.json`・`hyperframes.json`） |
| `intro/` | `promo-video/intro/video/` | 紹介動画（同じ 3 ファイル） |
| `thumb/phone-pc.html`・`pc.html`・`phone.html` | `promo-video/stills/thumb.html`（1 つ選ぶ） | サムネイル（OGP 1200×630）の 3 つの型 |
| `thumb/thumb.css`・`thumb.js` | `promo-video/stills/` | サムネイルの見た目と配置の検査 |
| `thumb/tools/render.ts` | `promo-video/stills/tools/render.ts` | サムネイルの書き出し |
| `capture/record.mjs` | `promo-video/capture/record.mjs` | 録画の台本（設定と場面だけ書き換える） |

- 各 HTML の先頭のコメントに、差し替える所（`REPLACE`）と時刻の決め方がある
- 素材は同梱していない（アプリごとに作る）: 写真＝`gen-images.ts`／声＝`gemini-tts.ts` か `eleven-tts.ts`（`voice-choice.ts` で選んだ方）／効果音＝`gen-sfx.ts`／BGM＝`gen-bgm.ts`／フォント＝`gen-fonts.ts`（`@fontsource`）／GSAP＝`promo-video/node_modules/gsap/dist/gsap.min.js`／録画＝`record.mjs`
- HyperFrames は `npx --yes hyperframes@0.8.77`（各 `package.json` の `check` / `render` も同じ版）
- `thumb/examples/` は見本アプリ（架空の料理教室の予約アプリ）で書き出したサムネイル
