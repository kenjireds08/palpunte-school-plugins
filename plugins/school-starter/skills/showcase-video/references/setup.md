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

- **ffmpeg を入れたら、アプリを開き直さずに、同じ会話のまま「入れました」と送ってもらう**。アプリは古い PATH のままだが、道具（`deps.mjs` と `.ts`）は ffmpeg の置き場（Windows: `%LOCALAPPDATA%\Microsoft\WinGet\Links` と `…\WinGet\Packages\Gyan.FFmpeg*\ffmpeg-*\bin`・Mac: `/opt/homebrew/bin`・`/usr/local/bin`）を自分で探す。`deps.mjs` をもう一度実行し、`[OK] ffmpeg: あり（<置き場>）` になれば先へ進む
  - そのとき `deps.mjs` が `[注意]` で「コマンドの頭に付ける 1 行」を出す。Claude の Bash で `ffmpeg`・`ffprobe`・`npx hyperframes` を直接動かすときは、毎回その 1 行を頭に付ける（Bash は 1 回ごとに設定が消える）
- **Node.js を新しく入れた・入れ直したときだけ**は、アプリを完全に終了してから開く（道具そのものを Node で動かすため、開き直さないと古い Node のまま）。Mac は Command＋Q、Windows はタスクバー右下の「^」→ Claude を右クリック→終了。開いたら**新しい会話ではなく、左の一覧から前の会話を開いて**「showcase-video の続きから」と送ってもらう
- Homebrew が無い Mac は、ffmpeg を入れる前に Homebrew を入れる必要がある。受講生に「Homebrew を入れる手順を教えて」と頼んでもらう（パスワードを聞かれるのは受講生のターミナルの中だけ）
- サムネイルは**パソコンの Google Chrome**で撮る（Playwright のブラウザを別にダウンロードしない）。Chrome が無いと止まる
- 録画は、HyperFrames の書き出し用のブラウザがあればそれで（画面に何も出ない）、無ければ**パソコンの Chrome の窓を開いて**撮る。パソコンの Chrome を画面なしで使うと、録画の下に灰色の帯が出て画面が欠ける（Chrome 155 で確認）ため
- HyperFrames の初回は、部品のダウンロードに数分かかることがある。2 回目からは速い
- BGM・効果音・フォントはダウンロードしない（BGM と効果音は計算で作る・フォントは npm の @fontsource）

### Mac だけで確かめた所（Windows は未確認）

- 通しの動作（2026-10 に Mac で確認）。Windows では `deps.mjs`・鍵の保存・声・画像は同じコマンドで動く作りにしてあるが、通しでは試していない
- HyperFrames の書き出しが Windows で動くか
- Gemini の声（`gemini-tts.ts`）は、にせの API での通しと、呼び出しの形（講師の環境で 2026-09-26 に確認）だけ。無料枠のキー（支払い設定なし）での生成は 2026-10-26 に Mac で確認（2 本・すぐ通った）。Windows は未確認
- `record.mjs` の録画（Windows の Chrome の場所は Playwright が探す）
- 困ったら、Windows では `deps.mjs` の結果を講師に見せる

---

## 鍵を保存する

キー（API キー）は**プロジェクトごとではなく、パソコンに 1 回だけ**保存する。どのアプリの動画でも同じキーを使う。

道具がキーを探す順番（見つかった最初の 1 つを使う）:

1. 環境変数（`GEMINI_API_KEY` / `ELEVENLABS_API_KEY` / `OPENAI_API_KEY`）
2. ホームの共通の置き場（`~/.config/school-starter/credentials.env`）
3. OpenAI だけ: 補講2 で作った `image-studio` のキー（補講2 を終えていれば、OpenAI のキーは保存し直さなくてよい）

### 保存のしかた（受講生が自分で行う。Claude は実行しない）

Claude は**保存用のコマンドを出すだけ**。受講生が **Claude のアプリの中のターミナル**に貼り、キーを貼り付けて Enter を押す。

- キーを**チャット欄に貼らない・`!` の後ろに書かない**（会話の記録に残る）
- 打ったキーは画面に 1 文字も出ない（それで正しい）
- Claude はこのコマンドを実行しない（実行してもキーを打つ画面が無いので止まる）・置き場のファイルを開かない

Claude が出すコマンド（`<スキルのフォルダ>` は、Claude がこのスキルの実際の場所に置き換えて出す。変数のままにしない）。声のキーは、STEP 1 で選んだ声の種類の方だけを出す:

```
node "<スキルのフォルダ>/scripts/save-key.ts" gemini
```

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

- **Gemini**（声を Gemini にしたときだけ）: Google AI Studio（aistudio.google.com）に Google アカウントでログイン → 左の「Get API key」→「Create API key」。支払いの設定をしなければ無料枠で使う（無料枠の扱いは下の「声の 2 択」）。画面の名前は変わることがある
- **ElevenLabs**（声を ElevenLabs にしたときだけ）: elevenlabs.io でアカウントを作る → 左下のメニュー → Developers → API Keys → Create。権限を絞るときは、「キーを制限」をオンのまま、「テキスト読み上げ」＝アクセス、「ボイス」＝既読、「ユーザー」（「管理」の中。残りの文字数を見るため）＝アクセスにし、ほかは「アクセスなし」にする。「スピーチtoテキスト」は使わない（書き起こしは OpenAI で行う）。画面の名前は変わることがある
- **OpenAI**: platform.openai.com → API keys → Create new secret key（`sk-` で始まる）。先に Billing でクレジットを入れておく（補講2 と同じ）

---

## プランと料金（2026-10 時点。**文字数・値段は変わるので、使う前に各社の料金ページで確かめる**）

### 声の 2 択（STEP 1 で受講生が選ぶ）

| | Gemini（既定） | ElevenLabs |
|---|---|---|
| 声 | `ja-jp-advisor-3`（標準語・男性・落ち着いてはっきり） | **Yuma Uchida**（見本の動画の声） |
| 料金 | 無料枠あり（支払いの設定をしなければ無料枠） | **Starter（月 6 ドル）以上が要る**。無料プランでは Yuma Uchida を API から使えない |
| 回数・文字数 | 1 日の呼び出し回数に上限（1 場面 = 1 回） | 月の文字数（Starter は月 3〜4 万字ほど） |
| 気をつけること | 無料枠では、送った原稿が Google の品質改善に使われる。**お客様の実名や秘密は台本に入れない** | 無料プランの公式の声は英語なまりで、日本語の紹介動画には使えない |
| 商用（自分の仕事の宣伝・納品） | 公式の利用規約で確かめる（下の「確かめた所」） | Starter 以上で使える |

- **見本の動画の声（Yuma Uchida）は、ElevenLabs の有料プラン（Starter 以上）でないと使えない**
- どちらにするかは受講生が決める（Claude が「上げてください」と勧めない）。選んだら `voice-choice.ts save` が設定の `tts` と控えに書き、次の動画からは聞かない
- 1 本の動画の中で声を混ぜない（途中で変えたら全場面を作り直す）

### Gemini（声）

- 道具は `gemini-tts.ts`。1 場面 = 1 回の呼び出し（紹介動画 1 本で 6 回前後＋作り直し）。呼び出しのあいだを 6.5 秒あける
- **1 日の上限に当たったら、待たずに止まる**（終了コード 5）。受講生に 2 択を伝える: ① 明日もう一度同じコマンドを実行する（作り終えた場面は作り直さない） ② ElevenLabs の Starter に切り替える。上限は太平洋時間の 0 時（日本時間の夕方 16〜17 時）に戻る
- 「上限が 0 回」と出たら、無料枠でこのモデルを使えない状態。AI Studio の Rate limit の画面（https://aistudio.google.com/rate-limit）でこのモデルの回数を確かめる
- `--dry-run` で呼び出しの回数・文字数・見込みの長さを出す（キーも読まない・呼ばない）

#### 確かめた所（料金・無料枠・商用の条件は変わるので、配る前と使う前に公式ページで確かめ直す）

| 項目 | 内容 | 出どころ | 状態 |
|---|---|---|---|
| 無料枠では送った内容が Google の品質改善に使われる | 料金ページに明記 | https://ai.google.dev/gemini-api/docs/pricing | 2026-09-26 に確認（今回の更新では開き直していない） |
| 有料枠（Tier 1）での上限 | このモデルは 1 分 10 回・1 日 100 回 | https://aistudio.google.com/rate-limit | 2026-09-27 に確認（有料のキー） |
| 読み上げのモデルに無料枠があるか・無料枠の 1 日の回数 | gemini-3.8-flash-tts は無料枠あり（入力・出力とも Free of charge。無料枠では送った内容が品質改善に使われる）。1 日の回数は公式ページに数字がなく「AI Studio で見る」とだけある | https://ai.google.dev/gemini-api/docs/pricing ・ https://ai.google.dev/gemini-api/docs/rate-limits | 2026-10-26 確認（回数は AI Studio の Rate limit 画面で見る） |
| 無料枠・有料枠それぞれで商用に使えるか | 規約は「仕事・事業のための利用」が前提で、作ったものの所有権を Google は主張しない。無料枠では送った内容と結果が品質改善に使われ、人が読むことがある＝個人情報・秘密は送らない。18 歳以上。EEA・スイス・英国の利用者向けは有料枠のみ | https://ai.google.dev/gemini-api/terms | 2026-10-26 確認 |
| 呼び出しの形（Interactions API・WAV 24kHz モノラル） | 公式の説明と実際の呼び出しで確認 | https://ai.google.dev/gemini-api/docs/speech-generation | 2026-09-26 に確認 |

### ElevenLabs（声）

- **1 字 = 1 クレジット**（空白・句読点も数える）。紹介動画 1 本のナレーションは**約 150〜600 字**（見本アプリは 6 場面で 153 字。作り直しを含めて多めに見る）。15 秒の動画は声を使わない
- 今月の残りは道具が ElevenLabs に聞いて確かめ、足りなければ 1 字も送らずに止まる（`eleven-tts.ts --dry-run` で残りが出る）

| プラン | 月額 | 文字数の目安 | 注意 |
|---|---|---|---|
| 無料 | 0 円 | 少ない（料金ページで確かめる） | **商用に使えない**（自分の仕事の宣伝・お客さんへの納品に使えない）。**Yuma Uchida（Voice Library の声）を API から使えない**。公式の声は英語なまりなので、このスキルでは使わない |
| Starter | 6 ドル | 月 3〜4 万字ほど（2026-10 に確かめたアカウントは 40,000） | 商用に使える。Voice Library の声も使える |

- **どのプランにするかは受講生が決める**（Claude が「上げてください」と勧めない。止まった理由と選べることを伝える）
- ElevenLabs の声は **Yuma Uchida**（落ち着いた男性の声・Voice Library・`eleven_v4`）。無料プランのまま作ろうとして止まったら（`eleven-tts.ts` が終了コード 6）、「Starter にする／Gemini に切り替える」の 2 択を伝える → `script-and-voice.md`「ElevenLabs の無料プランで止まったとき」

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
   - `tts` は手で書かない（STEP 1 の `voice-choice.ts save` が、選んだ声の種類の値を書く。ひな形の既定は Gemini）
   - `stills.theme` はサムネイルの地の明るさ（`light` 既定。アプリが暗い配色なら `dark` にして `stills.brand` も暗い色に）
4. アプリの `.gitignore` に足す:
   ```
   promo-video/node_modules/
   promo-video/capture/credentials/
   promo-video/capture/takes/
   promo-video/**/.hyperframes/
   ```
   書き出した mp4 も大きい（10〜30MB）ので、Git に入れるかは受講生と決める
