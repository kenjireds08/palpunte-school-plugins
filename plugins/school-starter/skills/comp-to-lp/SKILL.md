---
name: comp-to-lp
description: 完成したデザインカンプ画像（ChatGPT 等で作った LP の 1 枚絵）から、LP（ランディングページ）を HTML/CSS で再現する。文字・ボタン・カードは HTML/CSS、写真・アイコン・手書き文字だけを OpenAI の画像 API（gpt-image-2.5）で作る。素材の見積もりを 1 回だけ承認してもらい、画像担当と HTML 担当を並行で動かし、Playwright でカンプと見比べて数値で合わせる。「カンプから LP 作って」「このデザイン通りに LP を作って」「カンプを再現して」「この画像のサイトを HTML にして」「猫カフェの LP を作る（補講3）」で発動。途中で止めた LP の続き（「lp/ の続きから再開して」）にも使う。デザインがまだ無い・既存サイトの改修・他社の実在サイトの複製には使わない。
---

# comp-to-lp（デザインカンプから LP を作る）

カンプ画像を、**HTML/CSS ＋ 必要な分だけの生成画像**で再現する。
お手本: 猫カフェ LP（カンプ 724x2172・画像 50 枚前後・約 100 円）。

## 最初に宣言する 4 つ（このスキルの間はこれを優先する）

1. **止まって確認するのは STEP 2 の「見積もりの承認」1 回だけ。** それ以外のステップは、1 つ終えるたびに止まらず次へ進む（ハンズオン 4 ルールの「1 メッセージ = 1 ステップ」は、このスキルでは見積もりの承認のところだけ使う）。止まるのは、道具が NG を出して先へ進めないときだけ
2. **feature-dev・Plan Mode・実装計画のファイル作成を提案しない。** このスキルの STEP がそのまま計画になっている
3. **画像担当と HTML 担当を並行で動かすのは、講師が許可した例外。**「並行作業を提案しない」ルールより、こちらを優先する
4. **DESIGN.md は作らない。** カンプがデザインの正。frontend-design スキルと UI 禁止パターン集は使わない（カンプに紫やクリーム色があっても、カンプどおりにする）

## 守ること（破りそうになったら止める）

- **`.env.local` は開かない・読まない・中身を表示しないでください。** 鍵は道具が `node --env-file=.env.local` で受け取る。鍵を読むコード・鍵を表示するコマンドを書かない
- **見積もりの承認より前に、有料の画像を 1 枚も作らない**（試しの 1 枚も有料）
- **サイトの情報を画像に焼き込まない。** 見出し・本文・価格・時間・ボタンの文字は HTML テキスト。絵文字・記号・アイコンフォントで代用しない
- **道具のスクリプトを書き直さない・新しいスクリプトを作らない。** 画像の生成・透過・採寸は下の道具だけで行う（画素の処理を別の言語で書かない）
- 他社のロゴ・既存のキャラクターに似せた画像を作らない。AI で作った店内・動物・料理の写真は、実在のお店に使うなら「仮の素材」

## 道具（このスキルのフォルダの scripts/）

作業フォルダ（Code タブで開いたフォルダ）は **image-studio**。コマンドはすべて image-studio で実行し、道具は**このとおりの形（二重引用符つき）**で呼ぶ。

| 道具 | 役割 |
|---|---|
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/deps.mjs"` | 必要な物がそろっているかの確認。足りない物の導入コマンドを出す |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/gen.mjs"` | 見積もり（`--dry-run`）と画像の一括生成。上限 300 円・台帳つき・並列数は自動 |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/mask.mjs"` | 白地に黒の画像を透過＋色の塗り直し、写真の縮小（`batch` で jobs.json の `final` どおり） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/shot.mjs"` | カンプと実装を上下に並べた比較画像（`comp-shots/cmp_*.png`） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/crop.mjs"` | カンプの一部を目盛りつきで拡大（目標値を読む） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/measure.mjs"` | 要素の位置・大きさを目標値と比べる（ずれていれば終了コード 1） |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/textw.mjs"` | 文字の幅を目標と比べる |
| `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/sheet.mjs"` | 生成した画像の一覧（透過は市松模様の上） |

ひな形: `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/templates/"`（comp.config.example.json・jobs.example.json）。
詳しい手順: `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/references/workflow.md"`／プロンプトの型: `references/prompt-patterns.md`／困ったとき: `references/gotchas.md`。

作るファイルの置き場所（すべて `image-studio/lp/` の下）:

```
lp/
  design/comp-pc.png       カンプ
  comp.config.json         設定（ひな形から作る）
  jobs.json                素材の一覧（画像担当と HTML 担当の約束）
  index.html  styles.css   LP 本体
  assets/raw/              生成した元の画像     assets/img・icons・hand/  書き出した画像
  comp-shots/              比較画像
  prompts/images/          送ったプロンプト
  docs/image-ledger.tsv    台帳（道具が自動で書く。手で書き換えない）
  docs/ASSETS.md           素材の採否と費用のメモ
  docs/PROGRESS.md         どこまで進んだかのメモ（人が読むためのもの）
```

## 始めるときのひとことで変えられること

受講生が最初のひとことで次を言ったら、そのとおりにする（言われなければ既定のまま）。

- **費用の上限**: 既定 300 円。300 円より下げるのは可、上げるのは不可。**300 円を超える見積もりは承認しない。** 超えるなら素材を減らして見積もり直す
- **画像の枚数**: 「アイコンは少なめに」「写真をまとめて」など → STEP 2 で減らした一覧を出す
- **どこまでやるか**: 「画像入りの HTML まで」「見比べ（STEP 4）もやる」
- **スマホ幅の確認**: 既定は「横にはみ出さない」まで
- **同時に作る枚数**: 指定しなくてよい（変える方法も無い）。道具が OpenAI の返事から決める。上限が読み取れないときは 2 枚ずつで始め、混んでいる（429）と出たら 1 枚ずつに下げてそのまま続ける

## STEP 0 準備（必要な物がそろっているか）

▶ 受講生には「準備を確かめます。許可を求められたら許可してください」とだけ伝え、◀ Claude が次を順に行う。

1. `node --version` を実行する。**20.6 より古い**（例 v18.x・v20.5）なら、ここで止めて次を伝える:
   「Node.js を LTS 版に更新する手順を、このパソコンの OS に合わせて教えてください」と Claude に頼んで更新し、更新したら Claude のアプリを完全に終了して開き直してから、もう一度「カンプから LP 作って」と送ってください
   （Mac は nodejs.org の LTS 版インストーラ（.pkg）、Windows は LTS 版インストーラ（.msi）。古い Node だと次の確認そのものが動かない）
2. 確認の道具を実行する:
   ```
   node --env-file=.env.local "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/deps.mjs" --expect-version-from "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"
   ```
3. 表で **NG** の行があれば、その行の「次にやること」のコマンドを **1 つずつ別々に**実行する（2 つを 1 行につなげない）。終わったら 2 をもう一度実行する
   - 「package.json」が NG: **先に `npm init -y` を実行する**（image-studio に package.json が無いまま `npm i` を実行すると、上のフォルダ（ホームなど）に入ってしまう）。終わってから、別に次の `npm i -D playwright@1.61.1` を実行する
   - よく出る NG: `npm i -D playwright@1.61.1` → `npx playwright install chromium`（約 350MB・2〜5 分。失敗したら同じコマンドをもう一度、だめなら `npx playwright install --force chromium`）／`.gitignore` に `node_modules/` の 1 行を足す
   - 「作業フォルダ」が NG: 「Code タブで選んだフォルダが image-studio ではありません。作業フォルダを image-studio に選び直して、もう一度送ってください」と伝えて止める
   - 「鍵の形」「鍵の生存」が NG: 表の文言を伝えて止める（鍵を作り直す・保存し直すのは受講生）
   - chromium だけがどうしても入らない人は、その人だけ「画像の生成（STEP 3 の画像担当）まで」に切り替える
4. **鍵の防壁の確認**（deps.mjs が image-studio の直下に `.env.probe` を作っている。中身は鍵ではない）:
   - Read ツールで `.env.probe` を読もうとする → **拒否される**のが正しい
   - Bash で `cat .env.probe` を実行しようとする → **拒否される**のが正しい
   - 2 つとも、拒否されたときの文言をそのまま受講生に報告する。**1 つでも読めてしまったら、鍵を使う工程（STEP 2 の承認より後）に進まず、「講師に知らせてください」と伝えて止める**

完了: deps.mjs の NG が 0 件（「鍵の防壁」は要確認のままでよい）、`.env.probe` が Read と cat の両方で拒否された

## STEP 1 カンプを置く

1. ダウンロードフォルダ（Mac は `~/Downloads`、Windows は「ダウンロード」か OneDrive の中の「ダウンロード」）にある `nekocafe-comp.png` を `lp/design/comp-pc.png` にコピーする。同じ名前が複数あれば一番新しいもの（`nekocafe-comp (1).png` など）。見つからなければ、受講生に「シートからカンプをダウンロードしてください」と伝える
2. ひな形 `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/templates/comp.config.example.json"` を `lp/comp.config.json` にコピーし、カンプの幅の 2 倍を `targetWidth` にする（724px なら 1448）。カンプの大きさは shot.mjs の最初の行（`comp 724x2172`）でも分かる
3. カンプを Read で見て、上から順にセクション（ヘッダー・ヒーロー・特徴…）を書き出し、`sections` を埋める

完了: `lp/design/comp-pc.png` と `lp/comp.config.json` がある

## STEP 2 素材の一覧と見積もり（ここだけ止まって承認をもらう）

1. カンプを上から見て、要素ごとに「HTML/CSS で作る」か「画像を作る」かを分ける（分け方の表: `references/workflow.md` の 2-1）
2. 画像にするものを `lp/jobs.json` に書く（ひな形 `templates/jobs.example.json`）。`name`・`kind`（photo / bg / icon / hand / logo / map）・`size`（1536x1024 / 1024x1024 / 1024x1536 のどれか）・`slot`（どこに置くか）・`final`（書き出すファイル名と色・幅）・`prompt`（`references/prompt-patterns.md` の型）
3. 見積もりを出す（費用はかからない）:
   ```
   node --env-file=.env.local "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/gen.mjs" --jobs lp/jobs.json --config lp/comp.config.json --dry-run
   ```
4. 出た表をチャットに貼り、合計と「作り直しを見込んだ目安」と上限（300 円、または受講生が言った額）を添えて、**AskUserQuestion で 1 回だけ聞く**:
   - **この内容で作る (Recommended)** / **枚数を減らす**（アイコンを減らす・似た写真をまとめる）/ **上限を下げる**
   - 見積もりが 300 円（または受講生が言った上限）を超えるときは承認を取らない。素材を減らして 3 からやり直す
   - 受講生に添える 1 行: 「道具は 1 枚ごとに、作る前に最大の額を見込んで上限を守ります。ただ、最後の 1 枚の料金が見込みより高かった場合だけ、上限を 1 枚分（数円）超えることがあります」
5. 承認された上限を `lp/comp.config.json` の `images.budgetYen` に書く。「減らす」「下げる」なら jobs.json か budgetYen を直して 3 に戻る

完了: 承認済みで、`images.budgetYen` に承認額が入っている

## STEP 3 画像担当と HTML 担当を並行で動かす

承認のあと、**サブエージェントを 2 体同時に**起動する（指示文は下の「サブへの指示文」）。2 体が動いている間、受講生には「裏で 2 つの作業が走っています。終わったら知らせます」と伝える。

- **画像担当**: gen.mjs の一括 → 1 枚ずつ検品 → 作り直し → mask.mjs batch → `lp/docs/ASSETS.md`
- **HTML 担当**: jobs.json の `final` のパスで HTML/CSS を組む。画像が届くまでは点線の仮枠

**gen.mjs を起動するのは「一括 1 回 ＋ 作り直し 1 回」の 2 回だけ。** 3 回目が要りそうなら、作らずに止めて報告する。

```
node --env-file=.env.local "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/gen.mjs" --jobs lp/jobs.json --config lp/comp.config.json
```

作り直しは、直したい素材の prompt を jobs.json で直してから（直す点は 1 つ）、名前をまとめて 1 回で:

```
node --env-file=.env.local "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/gen.mjs" --jobs lp/jobs.json --config lp/comp.config.json --only hero-bg,icon-paw --suffix -v2
```

採用した作り直し版は jobs.json の `adopt` に（例 `assets/raw/hero-bg-v2.png`）書く。失敗（err）だけを作り直すときは `--only` を付けずに一括と同じコマンドでよい（作成済みは自動で飛ばす）。

**並行で動かせなかったとき**（サブが起動できない・片方が待ちになる）: 次の順で 1 体ずつ動かす。① 画像担当の gen.mjs の一括だけを先に起動 → ② その間に HTML 担当を最後まで → ③ 画像担当の検品・作り直し・mask.mjs batch。並行より 15 分ほど長くかかる。

完了: 画像担当の報告（検品済み・台帳の金額）と HTML 担当の報告（画像なしで measure.mjs が終了コード 0、または残りの一覧）がそろった

## STEP 4 見比べて直す（時間が余ったとき・2 周まで）

1 体のサブ（またはメイン）で、画像入りのページを上のセクションから順に:

```
node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/shot.mjs" --config lp/comp.config.json --diff
```

```
node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/measure.mjs" --config lp/comp.config.json
```

- 比較画像 `lp/comp-shots/cmp_*.png` を 1 枚ずつ Read して、ずれを数か所ずつ直す。**2 周で止める**。目安は ±3px（今日はここまで。本気で合わせるなら ±1px）
- スマホ幅は `node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/shot.mjs" --config lp/comp.config.json --mobile` で「横にはみ出していない」ことだけ確かめる
- 画像そのものがダメなら、作り直しの回数が残っているときだけ STEP 3 の作り直しに回す

## STEP 5 まとめ（90 分で終わったところまで）

当日のゴールは「90 分で終わったところまで」。完成していなくてよい。

1. `lp/docs/PROGRESS.md` に、終わった STEP・残っていること・次にやることを短く書く（人が読むメモ。再開の判断には使わない）
2. 台帳の金額（gen.mjs の最後の行の「累計」）を伝え、「OpenAI の Usage 画面でも確かめてください」と添える
3. 完成したら `lp/comp-shots/impl.png` を Discord に貼ってもらうよう伝える
4. 続きのやり方を伝える: 「後日、image-studio を開いて『lp/ の続きから再開してください』と送れば続きから始められます」

## 途中で止めた LP を再開する

「lp/ の続きから再開して」と言われたら:

1. **作った画像の判断は台帳（`lp/docs/image-ledger.tsv`）だけで行う。** PROGRESS.md は「次に何をするか」を知るためのメモで、どの画像ができたかの判断には使わない
2. **見積もりの承認は済んでいる。** `lp/comp.config.json` の `images.budgetYen` を上限として使い、もう一度は聞かない
3. STEP 0 の 1〜2（Node・deps.mjs）だけをやり直してから、STEP 3 の一括と同じコマンドを実行する。道具が台帳を見て、できた画像は作り直さない・保存できていた画像は「ok 扱い」にする
4. 道具が「状態不明: <name>」と出した素材は、**自動では作り直さない**（課金されたか分からないため）。受講生に「OpenAI の Usage 画面で、止めた時刻に 1 枚分の課金があるか確かめてください」と伝え、無ければ `--only <name>` で作り直す
5. あとは PROGRESS.md のメモの続きから STEP 3〜5 を進める

## サブへの指示文

起動するときは、`<...>` を埋めて渡す。**4 つの宣言（上の「最初に宣言する 4 つ」）も必ず入れる。**

----ここから----
あなたは comp-to-lp の画像担当です。報告は日本語で。commit / push はしないでください。
最初に守ること: (1) 止まって確認しない。終わったら報告だけする (2) feature-dev・Plan Mode を提案しない (3) HTML 担当と並行で動くのは講師が許可した例外 (4) DESIGN.md を作らない・frontend-design と UI 禁止パターン集は使わない。
.env.local は開かない・読まない・中身を表示しないでください。道具のスクリプトを書き直さない・新しく作らない。
- 作業フォルダ: <image-studio の絶対パス>（コマンドはここで実行する）
- 素材の一覧: lp/jobs.json（変えてよいのは prompt と adopt だけ。name・final・slot を変えたいときは報告に書く）
- 承認済みの上限: <円>（lp/comp.config.json の images.budgetYen）
- 手順: "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/references/workflow.md" の「3-B」、プロンプトの型は同じフォルダの prompt-patterns.md
やること:
1. 一括生成（gen.mjs の起動はこれと作り直しの 2 回だけ）: node --env-file=.env.local "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/gen.mjs" --jobs lp/jobs.json --config lp/comp.config.json
   **このコマンドはほかのコマンドと1行につながず、単独で実行する**（つなぐと止められる。作り直しの 2 回目も同じ）
2. 一覧: node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/sheet.mjs" --out lp/comp-shots/img/sheet.png --cols 4 lp/assets/raw/*.png を Read で当たりを付け、そのあと全画像を 1 枚ずつ原寸で Read して検品する（動物の脚・耳・目、画像の中の文字を 1 文字ずつ、見出しを置く側の余白）
3. ダメなものは直す点を 1 つ決めて prompt を直し、まとめて 1 回で作り直す: 同じコマンドに --only <名前をカンマ区切り> --suffix -v2。採用したら adopt に書く。3 回目は作らずに報告
4. 書き出し: node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/mask.mjs" batch --jobs lp/jobs.json --config lp/comp.config.json --force
5. lp/docs/ASSETS.md に素材ごとの採否・検品メモ・費用（台帳の累計）を書く
報告: 採用した画像と検品メモ（1 行ずつ）、作り直した素材と理由、状態不明・失敗の素材、台帳の今回の金額と累計。
----ここまで----

----ここから----
あなたは comp-to-lp の HTML 担当です。デザインカンプを HTML/CSS で再現します。報告は日本語で。commit / push はしないでください。
最初に守ること: (1) 止まって確認しない。終わったら報告だけする (2) feature-dev・Plan Mode を提案しない (3) 画像担当と並行で動くのは講師が許可した例外 (4) DESIGN.md を作らない・frontend-design と UI 禁止パターン集は使わない（カンプどおりにする）。
.env.local は開かない・読まない。画像の生成（gen.mjs）は呼ばない。道具のスクリプトを書き直さない・新しく作らない。
HTML・CSS の修正は Edit ツールで行う（sed や一括置換をコマンドでつなぐと止められる）。
- 作業フォルダ: <image-studio の絶対パス>（コマンドはここで実行する）
- カンプ: lp/design/comp-pc.png（<幅>x<高さ>、targetWidth <幅の 2 倍>）
- 設定: lp/comp.config.json（measure / text / sections を書いてよいのはあなただけ）
- 素材の一覧: lp/jobs.json（画像は final の out のパスで参照し、slot の説明どおりに置く。jobs.json は書き換えない）
- 手順: "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/references/workflow.md" の「3-A」
やること:
1. lp/index.html と lp/styles.css で全セクションを作る。画像はまだ無いので、final の out のパスを書いたうえで点線の仮枠を出す
2. カンプを拡大して目標値を読む: node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/crop.mjs" --config lp/comp.config.json --y <上端> --h <高さ> --out-dir lp/comp-shots/html → Read して measure / text に書く
3. 測る: node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/measure.mjs" --config lp/comp.config.json --out-dir lp/comp-shots/html と node "${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/scripts/shot.mjs" --config lp/comp.config.json --diff --out-dir lp/comp-shots/html で、上のセクションから順に合わせる（目安 ±3px）
4. スマホ幅（390px）でも見て、横にはみ出していないか・カードが細く潰れていないかを確かめる
完了: 画像なしの状態で measure.mjs が終了コード 0。無理な項目は理由つきで残す。
報告: measure.mjs で NG の項目、目で見て残っているずれ、jobs.json への変更希望、作ったファイル。
----ここまで----

## Gotchas

- ❌ 承認の前に「試しに 1 枚」作る → ✅ 試しも有料。承認の後にする
- ❌ gen.mjs を何度も起動する → ✅ 一括 1 回 ＋ 作り直し 1 回。作り直しは名前をまとめて `--only a,b,c`
- ❌ 「状態不明」の素材を、確かめずに作り直す → ✅ Usage 画面で課金が無いと分かってから `--only`
- ❌ 見出しや価格を画像に入れて見た目を合わせる → ✅ 情報の文字は HTML。画像にしてよい文字は手書き風の飾り文字と、写真の中の看板だけ
- ❌ 🐾 や ⌂ で済ませる → ✅ OS で形が変わる。白地に黒で作って mask.mjs で透過、または CSS
- ❌ `mask-image: url(icon.png)` で色を変える → ✅ ファイルを直接開くと表示されない。色ごとに透過 PNG を書き出す（`final` に色違いを並べる）
- ❌ 下のセクションから合わせる → ✅ 上の高さが変わると下が全部ずれる。上から順に
- ❌ 0px にこだわる → ✅ カンプを拡大して読んだ値にも誤差がある。今日は ±3px で止める
- ❌ ASSETS.md を lp/ の直下に作る → ✅ `lp/docs/ASSETS.md`（直下だと作成を止められる）
- ❌ 止められたら別の場所・別の方法で書く → ✅ 止められた理由をそのまま受講生に伝える

詳しい症状と対処: `"${CLAUDE_PLUGIN_ROOT}/skills/comp-to-lp/references/gotchas.md"`
