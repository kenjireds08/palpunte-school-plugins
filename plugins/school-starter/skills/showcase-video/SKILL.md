---
name: showcase-video
description: "自分で作ったアプリの紹介動画セットを、1 回の依頼で 3 点作る。①15 秒の短い動画（ナレーションなし・音を消しても伝わる）②ナレーション付きの紹介動画（アプリの画面の録画＋ElevenLabs の声＋生成した写真）③サムネイル（横長 1200×630 の OGP 画像）。声は ElevenLabs、写真は OpenAI の画像 API（1 本 30 枚まで）、組み立てと書き出しは HyperFrames。「このアプリの紹介動画を作って」「アプリの紹介動画」「紹介動画とサムネイルを作って」「PR 動画を作りたい」「ナレーション付きの動画で紹介したい」で発動。「showcase-video で」「紹介動画スキルで」と名指しされたときもこれ。途中で止めた動画の続き（「showcase-video の続きから」「promo-video の続きから」）にも使う。書き分け: 宣伝・紹介用の動画（アプリの良さを伝える PR 動画）はこのスキル。操作説明・取扱説明書・動作確認ガイドの動画は torisetsu。使わない場面: 操作マニュアル用のスクショ、アプリが無いまま動画だけ作る、他社の実在サービスの紹介動画。"
---

# showcase-video（自分のアプリの紹介動画セット）

自分で作ったアプリを「引きつける → 分かる → 覚えてもらう」の 3 点で見せる素材を作る。
ここは**流れと決まりの索引**。手順・数値・理由は references にあり、各行の「→」の先が正本。

| できるもの | 役割 | 形 |
|---|---|---|
| ① 15 秒の短い動画 | 引きつける。SNS・サイトで音なしでも流れる | 1920×1080・15 秒・ナレーションなし・BGM と効果音（→ `references/compose.md`「15 秒の動画」） |
| ② 紹介動画 | アプリで何ができるかが分かる | 1920×1080・アプリの録画＋声＋生成した写真。長さは見せる機能の数で決まる（→ `references/script-and-voice.md`「長さの決め方」） |
| ③ サムネイル | 共有したときに出る 1 枚 | 1200×630 の PNG（OGP）。スマホと PC を重ねて真ん中に置く型（→ `references/compose.md`「サムネイル」） |

## 最初に宣言すること（このスキルの間はこれを優先する）

0. **このスキルが動いているときは、torisetsu（操作説明・取扱説明書のスキル）を使わない。** 「誰に見せるか」「どの環境で撮るか」などを独自に聞かず、このスキルの手順で進める
1. **止まって受講生に聞くのは 3 回だけ**: ① 初めての動画のときの「最後に出す名前（制作：〇〇）」 ② 台本・画像の一覧・費用の承認 ③ 声ができたあとの「名前の読みを聞いて確かめる」（ほかに、データが増える操作を撮るときだけ、撮る前にもう 1 回聞く → `references/capture.md`「書き込みが要る場面」）。それ以外は 1 つ終えるたびに止まらず次へ進む（ハンズオン 4 ルールの「1 メッセージ = 1 ステップ」は、この 3 か所だけで使う）。道具が NG を出して進めないときは止まって知らせる
2. **feature-dev・Plan Mode・実装計画のファイル作成を提案しない。** 下の STEP がそのまま計画になっている
3. **アプリ本体のコードは書き換えない。** 作るものはすべてアプリのフォルダの中の `promo-video/` に置く
4. **DESIGN.md・UI 禁止パターン集で動画の見た目を決め直さない。** 色はアプリの色に合わせ、形はテンプレートどおりにする

## 守ること（破りそうになったら止める）

- **API キーを読まない・表示しない・保存のコマンドを Claude が実行しない。** キーは道具がプロセスの中で読む。保存は受講生がアプリの中のターミナルで行う（→ `references/setup.md`「鍵を保存する」）。キーの置き場のファイルを Read・cat・grep で開かない
- **環境変数を表示するコマンドを使わない**: `env`・`printenv`・`echo $…KEY`・`set`、プロセスの一覧の `pgrep -fl`・`ps e`・`ps eww`（キーが表示される。実際に会話の記録に出てしまった例がある）。プロセスを確かめるのは `pgrep -f <名前>` だけ。`.env` の中身も表示しない
- **承認より前に、有料の生成を 1 つもしない**（画像も声も、試しの 1 回も有料）
- **本物のお客さんの名前・電話番号・住所・メールを映さない・読ませない。** ダミーに置き換えてから録画し、書き出したあと文字の読み取りと書き起こしで確かめる（→ `references/capture.md`「本物の情報を映さない」）
- **台本と画面の文字に入れてよいのは、アプリのコードで確かめた機能だけ**（→ `references/script-and-voice.md`「事実確認表」）
- **画像に文字を入れない。** 見出し・名前・数字は HTML の文字で載せる。実在の人物・店・建物に似せない（→ `references/images.md`）
- **写真の人物の国・地域は 1 本の中でそろえる。既定は日本人**（人物が写る全部のプロンプトに `Japanese`。検品で全枚の人物を見る）
- **道具のスクリプトを書き直さない・同じことをする別のスクリプトを作らない。** テンプレートの `REPLACE` の所と、`capture/record.mjs` の設定の所だけを書き換える

## 道具（このスキルのフォルダの scripts/）

道具は**このとおりの形（二重引用符つき）**で呼ぶ。作業はアプリのフォルダの `promo-video/` で行う。

| 道具 | 役割 |
|---|---|
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/deps.mjs"` | 道具がそろっているかの確認（Node・ffmpeg・Chrome・npm install・キーがあるか）。足りない物の入れ方を出す |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/save-key.ts"` | キーの保存（**受講生がターミナルで実行する。Claude は実行しない**） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/credit.ts"` | 最後に出す名前「制作：〇〇」と読みを、設定と HTML に入れる |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/eleven-tts.ts"` | ナレーションの声（ElevenLabs）。場面ごとの wav と長さの記録。残りの文字数を確かめてから作る |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voices.ts"` | 声を選び直すときの一覧（課金なし・日本語で確かめ済みの公式の声だけ） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/transcribe.ts"` | 書き起こしと語の時刻（読み間違いの確認・動きを声に合わせる・書き出した動画の確認） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-images.ts"` | 写真の生成（見積もり・費用の上限・台帳つき。1 本 30 枚まで） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-sfx.ts"` / `gen-bgm.ts` | 効果音と BGM を計算で作る（著作権の心配なし） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gen-fonts.ts"` | 動画で使う文字だけのフォントを埋め込む |
| `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/showcase-check.ts"` | 検査（`tts`・`template`・`timing`・`thumb`）。NG 0 になるまで直す |

ひな形: `"${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/templates/"`（中身は `templates/README.md`）。
どれも `--help` で使い方が出る。知らないオプションは受け付けず終了コード 1。

作るものの置き場所（すべて `<アプリのフォルダ>/promo-video/` の下）:

```
promo-video/
  package.json  showcase.config.json     道具の依存（npm install 1 回）と設定
  docs/facts.md  docs/script.md          事実確認表・台本（受講生が読む）
  docs/images.jobs.json  docs/prompts/   作る写真の一覧と送ったプロンプト
  docs/image-ledger.tsv                  画像の台帳（道具が書く。手で書き換えない）
  assets/raw/                            生成した写真
  capture/record.mjs  capture/takes/     録画の台本と録画
  capture/credentials/                   ログインの状態（開かない・Git に入れない）
  intro/narration/                       ナレーションの台本 JSON・wav・記録
  cm/  intro/video/  stills/             ①②③ の組み立て
  final/15秒.mp4  final/紹介動画.mp4      できあがりの動画
  stills/final/thumb-ogp.png             できあがりのサムネイル
```

### Bash で ffmpeg を直接打つとき

道具（`deps.mjs` と `.ts`・`record.mjs`）は、ffmpeg が PATH に無くても置き場を自分で探す。Claude の Bash で `ffmpeg`・`ffprobe`・`npx hyperframes` を直接動かすときは、`deps.mjs` が `[注意]` で出した 1 行（`export PATH="…:$PATH";`。PowerShell なら `$env:Path = "…;" + $env:Path;`）を**毎回コマンドの頭に付ける**（Bash は 1 回ごとに設定が消える）。`[注意]` が出ていなければ付けなくてよい。

## 途中から再開するとき（「showcase-video の続きから」「promo-video の続きから」）

1. アプリのフォルダに `promo-video/` が**あれば**、`promo-video/docs/`・`intro/narration/`・`final/` などのできている物を見て、まだの STEP から続ける（まず `deps.mjs --dir <promo-video のフォルダ>` で道具を確かめ直す）
2. `promo-video/` が**無ければ**（道具の確認の途中で止まった場合も）、STEP 0 の初めからやり直す。前の会話の内容を探しに、ほかのフォルダの進捗メモや関係のないファイルを読みに行かない

## STEP 0 準備（道具とキー）

▶ 受講生には「準備を確かめます。許可を求められたら許可してください」とだけ伝え、◀ Claude が次を行う。

1. `node --version` が 22.18 より古い、または `node` が無い → 止めて `references/setup.md`「道具をそろえる」の Node の入れ方を案内する（Node だけは入れたらアプリを完全に終了して開き、左の一覧から前の会話を開いて「showcase-video の続きから」と送ってもらう）
2. `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/deps.mjs"` を実行し、`[NG]` の行の「次にやること」を 1 つずつ案内する（ffmpeg・Chrome は受講生が入れる。ffmpeg は入れたら同じ会話のまま「入れました」と返してもらい、アプリは開き直さない → `references/setup.md`「道具をそろえる」）。`deps.mjs` が `[注意]` で「コマンドの頭に付ける 1 行」を出したら控えておく（下の「Bash で ffmpeg を直接打つとき」）
3. キーが無い → `references/setup.md`「鍵を保存する」の保存用コマンドを、**受講生がアプリの中のターミナルに貼って実行するもの**として出す（Claude は実行しない）。「保存しました」と返ってきたら 2 をもう一度
4. `promo-video/` を作り、`templates/package.json` と `templates/showcase.config.example.json`（→ `showcase.config.json`）を写して、`promo-video` で `npm install`（1〜3 分）。`.gitignore` に `promo-video/node_modules/`・`promo-video/capture/credentials/` を足す（→ `references/setup.md`「promo-video を用意する」）
5. 書き出しと録画に使うブラウザを入れる: `npx --yes hyperframes@0.8.77 browser ensure`（約 200MB・数分・1 回だけ。`deps.mjs` が `[注意]` で知らせる）
6. `deps.mjs --dir <promo-video のフォルダ>` が NG 0 になったら STEP 1 へ

## STEP 1〜9（要約）

▶ = 受講生 / ◀ = Claude

| # | 何を | 誰 | OK の目印 | 詳細 |
|---|---|---|---|---|
| 1 | 🙋 初めての動画なら、最後に出す名前を聞く（会社名・屋号は必須・個人の名前は任意・読みも）。`credit.ts show` に控えがあれば「前と同じでよいか」だけ聞く | ◀ → ▶ | `credit.ts save` が `[ok]` | `script-and-voice.md`「最後に出す名前」 |
| 2 | アプリのコードを読んで事実確認表（`docs/facts.md`）と、画面に出る個人情報の一覧を作る | ◀ | 各行に `ファイル:行` | `script-and-voice.md`「事実確認表」・`capture.md` |
| 3 | 台本（15 秒の文言・紹介動画の場面表）と写真の一覧（`docs/images.jobs.json`）を作り、見積もり（`gen-images.ts --dry-run`・`eleven-tts.ts --dry-run`）を出す | ◀ | 全文が事実確認表に対応 | `script-and-voice.md`・`images.md` |
| 4 | 🙋 **台本・写真の一覧・費用を 1 回だけ承認してもらう** | ▶ | 「OK」 | `script-and-voice.md`「承認の出し方」 |
| 5 | 声を作る → 書き起こして読み間違いを確かめる → 🙋 名前の読みを受講生に 1 回聞いてもらう | ◀ → ▶ | 誤読なし・読みが OK | `script-and-voice.md`「ナレーションを作る」 |
| 6 | 写真を作る → 全枚を開いて検品（画面の向き・性別と年代・人物の国・地域がそろっているか・文字が入っていないか） | ◀ | 不合格 0 枚 | `images.md` |
| 7 | ダミーのデータを入れて録画する（ログインが要る画面は受講生が 1 回だけログイン） | ◀ ＋ ▶ ログインだけ | `takes/*.mp4` と禁止語 0 | `capture.md` |
| 8 | ① 15 秒 → ② 紹介動画を組み立てて書き出し、③ サムネイルを書き出す | ◀ | `check` エラー 0・`template` `timing` `thumb` NG 0 | `compose.md` |
| 9 | 書き出した動画を確かめる（コマの文字・書き起こし・止まっている所）→ 3 点の場所を報告 | ◀ | 本物の情報 0 件 | `compose.md`「書き出したあとの確認」 |

## 終わったときの報告（この形で出す）

- できたもの 3 点のファイルの場所（`promo-video/final/15秒.mp4`・`promo-video/final/紹介動画.mp4`・`promo-video/stills/final/thumb-ogp.png`）と動画の長さ
- 使った費用: 画像の枚数と円（台帳の累計）・声の文字数（ElevenLabs の今月の残り）・書き起こしの円
- 受講生に見てほしい所（読みが怪しかった語・差し替えた写真など）
- 最後に 1 行: **「事業サイトへの掲載などは、このスキルを自分で改良すれば足せます」**

## 参照先

| 文書 | 中身 |
|---|---|
| `references/setup.md` | 道具をそろえる（Mac / Windows）・鍵を保存する・ElevenLabs と OpenAI のプランと料金・promo-video を用意する・Mac だけで確かめた所 |
| `references/script-and-voice.md` | 最後に出す名前・事実確認表・長さの決め方・台本の型・読み（同じ音の言葉は漢字）・承認の出し方・ナレーション・声を選び直す |
| `references/images.md` | 写真の使いどころ（生活の場面・アプリの中の写真）・プロンプトの型・検品・枚数と費用 |
| `references/capture.md` | ダミーのデータ・録画の台本（record.mjs）・ログイン・書き込みが要る場面・本物の情報を映さない |
| `references/compose.md` | 15 秒の動画・紹介動画・サムネイル・書き出し・書き出したあとの確認 |
| `references/pitfalls.md` | 実際に踏んだ失敗と、防いでいる場所 |
