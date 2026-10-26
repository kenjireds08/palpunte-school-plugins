# 準備（道具・鍵・プラン・promo-video）

STEP 0 の正本。確認は `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/deps.mjs"`（`--dir <promo-video>` で npm install も見る）。

---

## 道具をそろえる

| 道具 | 何に使う | Mac | Windows |
|---|---|---|---|
| Node.js 22.18 以上 | 道具の実行（`.ts` をそのまま動かす） | `brew install node`、または nodejs.org の LTS 版（.pkg） | `winget install OpenJS.NodeJS.LTS`、または nodejs.org の LTS 版（.msi） |
| ffmpeg / ffprobe | 声・録画の変換、長さを測る | `brew install ffmpeg`（5〜10 分） | `winget install Gyan.FFmpeg` |
| Google Chrome | 録画・サムネイル・動画の書き出し | google.com/chrome から | google.com/chrome から |
| npm の部品（Playwright・GSAP・フォント）と録画用の ffmpeg（Playwright 専用・約 3MB） | 録画・動き・文字 | `promo-video` で `npm install`（ffmpeg は postinstall が自動で入れる） | 同じ |
| HyperFrames 0.8.77 | 動画の組み立てと書き出し | `npx --yes hyperframes@0.8.77 …` が初回に自動で取ってくる（入れる作業は無い） | 同じ |
| 書き出し用のブラウザ（chrome-headless-shell） | 書き出しと録画 | `npx --yes hyperframes@0.8.77 browser ensure`（約 200MB・1 回だけ） | 同じ |

- **入れたら Claude のアプリを完全に終了して開き直す**（開き直さないと新しいコマンドが見つからない）
- Homebrew が無い Mac は、ffmpeg を入れる前に Homebrew を入れる必要がある。受講生に「Homebrew を入れる手順を教えて」と頼んでもらう（パスワードを聞かれるのは受講生のターミナルの中だけ）
- サムネイルは**パソコンの Google Chrome**で撮る（Playwright のブラウザを別にダウンロードしない）。Chrome が無いと止まる
- 録画は、HyperFrames の書き出し用のブラウザがあればそれで（画面に何も出ない）、無ければ**パソコンの Chrome の窓を開いて**撮る。パソコンの Chrome を画面なしで使うと、録画の下に灰色の帯が出て画面が欠ける（Chrome 155 で確認）ため
- HyperFrames の初回は、部品のダウンロードに数分かかることがある。2 回目からは速い
- BGM・効果音・フォントはダウンロードしない（BGM と効果音は計算で作る・フォントは npm の @fontsource）

### Mac だけで確かめた所（Windows は未確認）

- 通しの動作（2026-10 に Mac で確認）。Windows では `deps.mjs`・鍵の保存・声・画像は同じコマンドで動く作りにしてあるが、通しでは試していない
- HyperFrames の書き出しが Windows で動くか
- `record.mjs` の録画（Windows の Chrome の場所は Playwright が探す）
- 困ったら、Windows では `deps.mjs` の結果を講師に見せる

---

## 鍵を保存する

キー（API キー）は**プロジェクトごとではなく、パソコンに 1 回だけ**保存する。どのアプリの動画でも同じキーを使う。

道具がキーを探す順番（見つかった最初の 1 つを使う）:

1. 環境変数（`ELEVENLABS_API_KEY` / `OPENAI_API_KEY`）
2. ホームの共通の置き場（`~/.config/school-starter/credentials.env`）
3. OpenAI だけ: 補講2 で作った `image-studio` のキー（補講2 を終えていれば、OpenAI のキーは保存し直さなくてよい）

### 保存のしかた（受講生が自分で行う。Claude は実行しない）

Claude は**保存用のコマンドを出すだけ**。受講生が **Claude のアプリの中のターミナル**に貼り、キーを貼り付けて Enter を押す。

- キーを**チャット欄に貼らない・`!` の後ろに書かない**（会話の記録に残る）
- 打ったキーは画面に 1 文字も出ない（それで正しい）
- Claude はこのコマンドを実行しない（実行してもキーを打つ画面が無いので止まる）・置き場のファイルを開かない

Claude が出すコマンド（`<スキルのフォルダ>` は、Claude がこのスキルの実際の場所に置き換えて出す。変数のままにしない）:

```
node "<スキルのフォルダ>/scripts/save-key.ts" elevenlabs
```

```
node "<スキルのフォルダ>/scripts/save-key.ts" openai
```

- `保存しました（〇〇 文字）` と出れば OK。受講生に「保存しました」とチャットで返してもらい、`deps.mjs` をもう一度実行する
- `キーの形が正しくありません` → コピーの範囲がずれている。キーの画面でコピーし直してもう一度
- 同じコマンドをもう一度実行すると、新しいキーに置き換わる（キーを作り直したとき）
- 置き場のファイルは本人だけが読める権限で作る（Mac）

### キーの取り方

- **ElevenLabs**: elevenlabs.io でアカウントを作る → 左下のメニュー → Developers → API Keys → Create。権限を絞るときは、読み上げ（Text to Speech）・声の読み取り（Voices）・アカウントの読み取り（User。残りの文字数を見るため）を許す（画面の名前は変わることがある）
- **OpenAI**: platform.openai.com → API keys → Create new secret key（`sk-` で始まる）。先に Billing でクレジットを入れておく（補講2 と同じ）

---

## プランと料金（2026-10 時点。**文字数・値段は変わるので、使う前に各社の料金ページで確かめる**）

### ElevenLabs（声）

- **1 字 = 1 クレジット**（空白・句読点も数える）。紹介動画 1 本のナレーションは**約 150〜600 字**（見本アプリは 6 場面で 153 字。作り直しを含めて多めに見る）。15 秒の動画は声を使わない
- 今月の残りは道具が ElevenLabs に聞いて確かめ、足りなければ 1 字も送らずに止まる（`eleven-tts.ts --dry-run` で残りが出る）

| プラン | 月額 | 文字数の目安 | 注意 |
|---|---|---|---|
| 無料 | 0 円 | 少ない（料金ページで確かめる） | **商用に使えない**（自分の仕事の宣伝・お客さんへの納品に使えない）。使うときは動画か説明文に「ElevenLabs」の表記が要る。**既定の声（Voice Library の声）を API から使えないことがある**（→ 下） |
| Starter | 6 ドル | 月 3〜4 万字ほど（2026-10 に確かめたアカウントは 40,000） | 商用に使える。Voice Library の声も使える |

- **どのプランにするかは受講生が決める**（Claude が「上げてください」と勧めない。止まった理由と選べることを伝える）
- 既定の声は **Yuma Uchida**（落ち着いた男性の声・Voice Library・`eleven_v4`）。無料プランで止まったら（`eleven-tts.ts` が終了コード 6）、`voices.ts` の一覧（公式の声・日本語で確かめ済み）から受講生に選んでもらう → `script-and-voice.md`「声を選び直す」
- ほかの声の仕組み（VOICEVOX・Gemini の無料枠など）を使いたい受講生は、このスキルを自分で改良すれば使える（このスキルの道具は ElevenLabs だけ）

### OpenAI（写真・書き起こし）

- 写真: 画像そのものは **1 枚 約 1.6 円**（medium・1536×1024 の出力 343 トークン）。人物・場面を細かく指示する文の入力分が足されて、実際は **1 枚 1.8〜1.9 円ほど**（見本の 8 枚で 14.6 円）。1 本 30 枚まで（約 57 円）。費用の上限は設定の `images.budgetYen`（既定 60 円・300 円まで）
- 書き起こし（whisper-1）: 1 分 約 1 円。ナレーションと書き出した動画の確認で 1 本 5 円もかからない

---

## promo-video を用意する

アプリのフォルダ（Code タブで開いているフォルダ）の中に `promo-video/` を作る。

1. `templates/package.json` → `promo-video/package.json`、`templates/showcase.config.example.json` → `promo-video/showcase.config.json` に写す
2. `promo-video` で `npm install`（1〜3 分）。**アプリ本体の package.json は変えない**（`promo-video` の中で実行する）
3. 設定の〔 〕を埋める: `project.name`（画面に出る正式な名前）・`project.kind`（`phone-pc` / `pc` / `phone`）・`brand` の 3 色（アプリの CSS から読む）・`capture.baseUrl`（`npm run dev` で出る URL）
   - `credit` は手で書かない（STEP 1 の `credit.ts save` が書く）
   - `tts` は既定の声のまま。選び直したときだけ書き換える
   - `stills.theme` はサムネイルの地の明るさ（`light` 既定。アプリが暗い配色なら `dark` にして `stills.brand` も暗い色に）
4. アプリの `.gitignore` に足す:
   ```
   promo-video/node_modules/
   promo-video/capture/credentials/
   promo-video/capture/takes/
   promo-video/**/.hyperframes/
   ```
   書き出した mp4 も大きい（10〜30MB）ので、Git に入れるかは受講生と決める
