# 名前・事実確認・台本・ナレーション（STEP 1〜5）

---

## 最後に出す名前（制作：〇〇）（STEP 1）

紹介動画の最後に「制作：〇〇」を出し、ナレーションでも「せいさく、〇〇」と読む。**文字と読みは設定の `credit.display` と `credit.kana` から入る**。HTML や台本に名前を直接書かない。

1. 控えがあるかを見る: `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/credit.ts" show`
   - 控えがある → 「前の動画と同じ『制作：〇〇』でよいですか」とだけ聞く
   - 「まだありません」→ 受講生に次を聞く（AskUserQuestion ではなく、ふつうの質問で）:
     - **会社名か屋号（必須）** と、その**読み**（ひらがなかカタカナ）
     - **個人の名前を入れるか（任意）**。入れるなら名前と読み
     - 例:「動画の最後に『制作：〇〇』と出します。会社名か屋号と、その読みを教えてください。個人の名前も入れるなら名前と読みも」
2. 設定に書く（受講生に設定ファイルを開かせない）:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/credit.ts" save --config promo-video/showcase.config.json --org "<会社名・屋号>" --org-kana "<読み>" [--name "<名前>" --name-kana "<読み>"]
   ```
   画面は「制作：<会社名>　<名前>」、読みは「せいさく、<読み>、<名前の読み>」になる。次の動画のための控え（`~/.config/school-starter/showcase-profile.json`）にも書く
3. HTML への差し込みは組み立てのときに `credit.ts apply`（→ `compose.md`）。台本は最後の場面に `{{credit}}` と書けば、`gemini-tts.ts --config`（または `eleven-tts.ts --config`）が読みに置き換える
4. 声ができたら、**受講生に最後の場面の wav（`s6-name.wav` と `s6-credit.wav`）を 1 回聞いてもらう**（STEP 5）。社名は読み違いが起きやすい（実際に社名が 1 音違いで読まれて作り直した）

---

## 声を選ぶ（STEP 1・名前と同じメッセージで種類を聞き、続けて見本を聞いて番号で選ぶ）

1. 控えがあるかを見る: `node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voice-choice.ts" show`
   - 控えがある → 名前の確認と一緒に「声も前と同じ（`show` が出した種類と声）でよいですか」とだけ聞く。「同じ」なら 3 の `save` を `--voice` なしで実行する（控えの声になる。1.29 までの控えは声の種類だけなので、おすすめの 1 番の声になる。Gemini は 1.30 でおすすめが明るく軽やかな男性 `ja-jp-commercial-4` に変わったので、1.29 で作った声（落ち着いた男性 `ja-jp-advisor-3`）とは違う声になる。`show` が出した声のとおりに聞く）
   - 「まだありません」→ 名前を聞くメッセージに、次の 2 択の表を付けて聞く（AskUserQuestion ではなく、ふつうの質問で）

   | | ① Gemini（おすすめ・無料枠あり） | ② ElevenLabs |
   |---|---|---|
   | 声 | 明るく軽やかな男性の日本語の声 | 見本の動画と同じ Yuma Uchida |
   | 料金 | 無料枠あり（**1 日 10 回まで**・紹介動画 1 本で 7 回（読み直しがあればその分増える）） | Starter（月 6 ドル）以上が必要。無料プランでは日本人の声は使えない |
   | 声の候補 | 4 つ（おすすめは 1 番の明るく軽やかな男性） | おすすめは 1 番の Yuma Uchida（見本の動画の声） |
   | 気をつけること | 無料枠では送った原稿が Google の品質改善に使われる（お客様の実名や秘密は台本に入れない）。商用の条件は `setup.md`「確かめた所」 | — |

   「見本の動画の声は、ElevenLabs の有料プラン（Starter 以上）でないと使えません」と 1 行添える
2. 選んだ種類の見本の声をデスクトップに置く（課金なし・キー不要・回数を使わない。見本は講師が作って同梱している）:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voice-samples.ts" place --provider gemini
   ```
   ElevenLabs なら `--provider elevenlabs`。道具が出した番号の一覧をそのまま見せて、こう頼む: 「デスクトップの『声の聞き比べ_Gemini』フォルダの音声をダブルクリックして聞き、気に入った声の番号を返してください（1 番がおすすめです）」
   - `[注意] 試聴の音声が入っていません` → 聞き比べは飛ばし、おすすめの 1 番で進めると伝えて 3 へ
   - `[注意] デスクトップのフォルダが見つかりませんでした` → 道具が出したファイルの場所を伝え、そのファイルを開いて聞いてもらう
3. 返ってきた番号を設定に書く（受講生に設定ファイルを開かせない）:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/voice-choice.ts" save --config promo-video/showcase.config.json --provider gemini --voice 2
   ```
   設定の `tts`（provider・voice・model）と、次の動画のための控えに書く。次の動画からは聞かない。台本を書くときは、台本の `voice`・`model` を道具が出した値（設定の `tts.voice`・`tts.model`）にする
   - あとで「声を変えて」と言われたら、2 からやり直す（SKILL.md「声を変えたいと言われたとき」）
4. 選んだ方のキーが無ければ（`deps.mjs` の `[注意]` か `[NG]`）、`setup.md`「鍵を保存する」の保存用コマンド（`save-key.ts gemini` か `save-key.ts elevenlabs`）を受講生に出す
5. 1 本の動画の中で声を混ぜない。途中で変えるなら `voice-choice.ts save` をやり直し、台本を選んだ方のひな形の形にして全場面を作り直す

---

## 事実確認表（STEP 2・台本より前）

台本と画面の文字に入れてよいのは**コードで確かめた機能だけ**。説明の資料とコードが食い違ったら**コードが正しい**。

`promo-video/docs/facts.md` に 2 つの表を作る。

**F 表（アプリが実際にやること）**

| # | 事実 | 根拠（ファイル:行） |
|---|---|---|
| F1 | 予約は 日付 → コース → 確認 の 3 ステップ | `app/reserve/page.tsx:12` |

**D 表（資料にはあるが、コードに無いもの＝台本に入れない）**

| # | 資料の記述 | コードの事実 | 扱い |
|---|---|---|---|
| D1 | キャンセルのお知らせメール | 送る処理が無い | 台本に入れない |

確かめる観点（実際に食い違ったもの）:

- **通知**: 「メールでお知らせ」は、送る処理をコードで見つけたときだけ
- **自動で更新**: 「リアルタイム」「すぐに反映」は、購読・再読み込みのコードを見つけたときだけ
- **数字**: 何の数字かまで書く（「24 時間」がキャンセル期限なのに「24 時間いつでも予約」と書きかけた例がある）
- **画面があるか**: 資料にある画面が実装に無いことがある。撮る前に `app/` などで確かめる

同じファイルに「画面に出る個人情報の一覧」も作る（→ `capture.md`「本物の情報を映さない」）。

---

## 長さの決め方

| 動画 | 長さ |
|---|---|
| ① 15 秒の動画 | **15 秒で固定**（テンプレートの場面の区切りも固定） |
| ② 紹介動画 | **決めない。見せる機能の数で決まる**（1 つの機能に 1 場面） |

紹介動画の組み立て（骨格）はアプリの形で選ぶ（迷ったら受講生に聞く）:

- **A. お客さんの画面がある**（予約・注文・受付など。お客さんはスマホ、お店は PC）: 困りごと → お客さんの操作（スマホ）→ 管理側（PC。間に「つなぐ線」の場面）→ 特長 → 名前と制作。テンプレート `templates/intro` はこの形
- **B. PC だけ**（在庫・経理・社内の管理画面など）: 困りごと → 管理画面の機能 × 機能の数（PC の場面を写して増やす。スマホの場面とつなぐ線は消す）→ 特長 → 名前と制作
- **C. 立場が複数**（お客さん・現場・スタッフで別の画面）: 困りごと → 立場ごとの場面（外から内へ: お客さん → 現場 → スタッフ）→ 「ほかにも」→ 名前と制作

- 1 場面はナレーションの長さ＋前後の間で決まる（→「長さを測る」）
- **長くなりすぎそうなら**（見る人の集中が続かない）、機能を絞るか 2 本に分けるかを受講生に聞く。**勝手に削らない**

---

## 台本の型（STEP 3）

`promo-video/docs/script.md` に書く。

**① 15 秒の動画**: テンプレート `templates/cm-15s` の場面（S1 つかみ・S2 写真と数字 2 つ・S3 手順とスマホの録画・S4 特長 3 枚・S5 名前とタグラインと呼びかけ）に入れる文言の一覧。**音を消しても文字だけで伝わる**こと。数字は事実確認表にあるものだけ。15 秒には制作の名前を入れない

**② 紹介動画**: 場面ごとの表。

| 場面 | 映像（どの画面・どの写真） | 画面に出す文字 | 声の原稿（読みのとおりに書く） | 字数 | 見込み秒 | 根拠（F 表） |
|---|---|---|---|---|---|---|
| S1 困りごと | 生活の場面の写真 3 枚 | 電話とメモで、予約がバラバラ。 | 電話とメモで、予約がバラバラ。 | 15 | 2.5 | — |

- **見込み秒 = 字数 ÷ 6**（最初の 1 本を作ったら、実際の字/秒で引き直す）
- 画面の文字と声の原稿は別の列にする。画面は英字・漢字のまま、声の原稿だけ読みのとおりに書く
- 冒頭の困りごとは**紙片やメモが散らばる絵にしない**。困っている生活の場面の写真を数枚つなぐ（→ `images.md`）

### 読み（声の原稿の書き方）

- **英字・数字・記号はかなで書く**（英字のままだと生成のたびに読みが揺れる）。例: LINE → らいん、3 ステップ → スリーステップ
- **同じ音で意味が違う言葉は、ひらがなにせず漢字で書く**。例: 紙／神（かみ）、橋／箸（はし）、雨／飴（あめ）。「かみのタイムカード」と書いたら「神」の高さで読まれ、「紙のタイムカード」に直したら正しく読まれた
- **会社名・屋号・アプリの名前は、読みをかなで書いて 1 回聞いて確かめる**（`credit.kana` も同じ）
- 予約番号などの記号の列は読ませない

### 承認の出し方（STEP 4・止まるのはここ 1 回）

次の 4 つを 1 つのメッセージにまとめて見せ、「この内容で作ってよいか」を聞く。**承認より前に、声・画像の生成を 1 つもしない**。

1. 15 秒の文言と、紹介動画の場面表（場面ごとの見込み秒と合計）
2. 作る写真の一覧（どの場面の何の写真か・枚数）
3. 費用の見積もり: `gen-images.ts --dry-run` の円と、声の見込み（Gemini なら `gemini-tts.ts --dry-run` の呼び出し回数と「無料枠では原稿が品質改善に使われる」の注意、ElevenLabs なら `eleven-tts.ts --dry-run` の字数と今月の残り）
4. 最後に出す名前と読み（「制作：〇〇／せいさく、〇〇」）

---

## ナレーションを作る（STEP 5）

声は STEP 1 で選んだ方（設定の `tts.provider`）で作る。道具・台本のひな形・キーは次のとおり。

| 声の種類 | 道具 | 台本のひな形 | 声 | キー |
|---|---|---|---|---|
| `gemini` | `gemini-tts.ts` | `templates/narration.script.gemini.example.json` | 聞き比べで選んだ声（おすすめ `ja-jp-commercial-4`）・`gemini-3.8-flash-tts` | `GEMINI_API_KEY` |
| `elevenlabs` | `eleven-tts.ts` | `templates/narration.script.example.json` | 聞き比べで選んだ声（おすすめ Yuma Uchida `EHMH9cyd1z3rXm4z0Jja`・`eleven_v4`） | `ELEVENLABS_API_KEY` |

- 設定の `tts.voice` / `tts.model` と台本を同じにする（`showcase-check.ts tts` が確かめる）
- **場面ごとに wav 1 本**（場面ごとに長さを測るため）。どちらの道具も、置き場・名前・形（`<id>.wav` と `<id>.json`）は同じ
- 台本 JSON は、選んだ方のひな形を `promo-video/intro/narration/narration.script.json` に写して書く。id は紹介動画のテンプレートの `vo-s1`〜`vo-s6`・`vo-s6b` に対応する（`s1-hook` … `s6-name`・`s6-credit`）。
- **締めの場面は声を 2 本に分ける**: `s6-name` は「〔アプリの名前の読み〕。」だけ、`s6-credit` は「せいさく、{{credit}}。」だけ（例: 「ヨヤクル。」と「せいさく、みほんキッチンこうぼう。」）。組み立てのときに 2 本のあいだを 0.6〜0.8 秒あけて、名前と制作の間を作る（→ `compose.md` 手順 3）。1 本にまとめた台本は `showcase-check.ts tts` が NG にする。1 回の呼び出しが増えるので、Gemini は 1 本の動画で 7 回（＋作り直し）になる
- `s6-name` は短いので、書き起こしで名前が抜けやすい（下の「読み間違いの確認」の、頭の部分だけを書き起こし直すやり方を使う）

Gemini のとき:

```
# 1) 設定・台本・キーがそろっているか（読み取り専用。NG 0 で次へ）
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/showcase-check.ts" tts --config promo-video/showcase.config.json
# 2) 呼ばずに、呼び出しの回数・文字数・見込みの長さを見る（キーも読まない）
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gemini-tts.ts" --script promo-video/intro/narration/narration.script.json --config promo-video/showcase.config.json --dry-run
# 3) 作る（承認の後）
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/gemini-tts.ts" --script promo-video/intro/narration/narration.script.json --config promo-video/showcase.config.json
```

- 1 本ずつ 6.5 秒あけて呼ぶ（7 本で 40 秒ほど）。同じ原稿・同じ声なら作り直さない（作り直すなら `--force`。1 日の回数を使う）
- 終了コード 5: キーが無い・**1 日の上限**・無料枠で使えない（上限 0 回）・キーが無効 → 止まって理由を受講生に伝える。1 日の上限なら、**無料枠は 1 日 10 回まで（紹介動画 1 本で 7 回（読み直しがあればその分増える））で、回数は日本時間の夕方 16 時（11 月〜3 月中旬は 17 時）に戻る**と伝えて 2 択（回数が戻ってから「showcase-video の続きから」と送る／ElevenLabs の Starter に切り替える）。**待ち続けない・勝手に ElevenLabs に切り替えない**
- 無料枠では送った原稿が Google の品質改善に使われる。台本にお客様の実名や秘密を入れない（ダミーの名前にする）

ElevenLabs のとき:

```
# 1) 設定・台本・キーがそろっているか（読み取り専用。NG 0 で次へ）
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/showcase-check.ts" tts --config promo-video/showcase.config.json
# 2) 送らずに、本数・字数・今月の残りを見る（キーも読まない）
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/eleven-tts.ts" --script promo-video/intro/narration/narration.script.json --config promo-video/showcase.config.json --dry-run
# 3) 作る（承認の後）。--max-credits でこの台本に使う字数の上限を決められる
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/eleven-tts.ts" --script promo-video/intro/narration/narration.script.json --config promo-video/showcase.config.json --max-credits 1500
```

- 出力: `<id>.wav`（24kHz・モノラル・音量は −16 LUFS にそろえる）と `<id>.json`（`effectiveSeconds`＝話している長さ など）。同じ原稿・同じ声なら作り直さない（作り直すなら `--force`。字数を使う）
- 試行の記録は `intro/narration/credits-log.json`
- 終了コード 5: キーが無い・今月の残りが足りない・上限に届く → 止まって理由を受講生に伝える（1 字も送っていない）
- 終了コード 6: **この声を使えない**（無料プランのまま作ろうとした）→「ElevenLabs の無料プランで止まったとき」へ。**別の声に勝手に切り替えない**

### 読み間違いの確認（書き起こし）

**同じ原稿・同じ声でも、作るたびに読みが揺れる**。1 本ごとに書き起こして原稿と比べる。

```
node "${CLAUDE_PLUGIN_ROOT}/skills/showcase-video/scripts/transcribe.ts" --media promo-video/intro/narration/s2-phone.wav --prompt "<アプリの名前など>"
```

- 出力 `s2-phone.words.json` の `transcript` と原稿を比べる。`tokens[].at` は語の始まりの秒（動きを声に合わせるのに使う → `compose.md`）
- **同じ音の別の漢字は誤読ではない**（「店舗」→「テンポ」など）。音が合っていれば OK
- 音が違う → `--force` で作り直す。作り直しても直らなければ原稿の書き方を変える（漢字にする・区切りの読点を足す）
- **頭の短い語（アプリの名前など）は、書き起こしで抜けたり別の字になったりする**（見本アプリで「ヨヤクル。」が抜けた）。`tokens[0].at` が 0.5 秒より後なら、頭の部分だけを切り出して書き起こし直す（`deps.mjs` が「コマンドの頭に付ける 1 行」を出していたら `ffmpeg` の頭に付ける）: `ffmpeg -v error -y -i <wav> -af apad=pad_dur=0.8 -t 1.5 <作業用>/head.wav` → `transcribe.ts --media <作業用>/head.wav`
- 迷う所は、秒数を添えて受講生に耳で確かめてもらう
- **🙋 最後の場面（名前と制作）は必ず受講生に 1 回聞いてもらう**。「s6-name.wav と s6-credit.wav を開いて、アプリの名前と『〇〇』の読みが合っているか聞いてください」と、ファイルの場所を添えて頼む

### 長さを測る

- `<id>.json` の `effectiveSeconds`（末尾の無音を除いた、話している長さ）が場面の長さの基準。**音が先・映像が後**（声ができるまで映像の時刻を決めない）
- 場面の長さ = `effectiveSeconds` ＋ 前後の間（0.3〜0.6 秒）。録画を見せる場面は、見せたい操作が収まる長さにする
- 実際の字/秒（字数 ÷ effectiveSeconds）で台本の表を引き直す

### ElevenLabs の無料プランで止まったとき（終了コード 6）

1. 止まった理由をそのまま伝える（例:「無料プランでは、Yuma Uchida（Voice Library の声）を API から使えません」）
2. 選べることを 2 つだけ伝える。どちらにするかは受講生が決める:
   - **ElevenLabs を Starter（月 6 ドル）以上にする** → 同じコマンドをもう一度実行（Yuma Uchida のまま・商用に使える）
   - **Gemini の声に切り替える**（無料枠あり）→ `voice-choice.ts save --config promo-video/showcase.config.json --provider gemini`、台本を `templates/narration.script.gemini.example.json` の形にして（原稿はそのまま写す）`gemini-tts.ts` で作る。キーが無ければ `save-key.ts gemini`
3. 無料プランの公式の声（英語なまり）へは逃がさない。日本語の紹介動画には使えなかった
4. 1 本の動画の中で声を混ぜない（途中で変えたら全場面を作り直す）

