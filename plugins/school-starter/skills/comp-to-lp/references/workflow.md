# 詳しい手順（comp-to-lp・受講生版）

SKILL.md の STEP を、実際に手を動かす細かさで書いたもの。お手本は猫カフェ LP（カンプ 1 枚 724x2172）。

- 道具のフォルダは、SKILL.md のコマンドに書かれている `.../skills/comp-to-lp/scripts/` のパス（以下 `<道具>`）。コマンドは `"<道具>/gen.mjs"` のように二重引用符で囲む（パスに空白があっても動くように）
- コマンドはすべて作業フォルダ **image-studio** で実行する。LP のファイルは `lp/` の下
- 鍵を使う道具は、`node --env-file=.env.local "<道具>/deps.mjs" ...`（準備の確認）・`node --env-file=.env.local "<道具>/gen.mjs" ...`（見積もりと生成）の形で起動する。`.env.local` は開かない・読まない
- 書き出し先（jobs.json の `out`・`adopt`・`final` の `out`、設定の `rawDir`）は `lp/` の中だけ。`../` や絶対パス、名前が `.env` で始まるものを書くと、道具が何もせずに止まる

---

## 1. カンプを確かめる

- 幅は shot.mjs の最初の行（`pc: comp 724x2172 → ...`）で分かる
- 表示したい PC 幅（1440 前後）になる倍率を決めて `targetWidth` にする。724px なら 2 倍の 1448px
- 読めない文字（小さすぎる・潰れている）は推測で埋めず、一覧にして受講生に確かめる

## 2. 素材の一覧（jobs.json）と見積もり

### 2-1. HTML/CSS にするもの・画像にするもの

| 種類 | 作り方 | 理由 |
|---|---|---|
| 見出し・本文・価格・ボタンの文字・メニュー | HTML テキスト ＋ Web フォント | 画像にすると直せない・読み上げられない・拡大でにじむ |
| ボタン・カード・枠・区切り線・吹き出しの三角・点線 | CSS | 幅や色を数値で合わせられる |
| 写真（動物・人・店内・料理） | 画像を作る（写真） | CSS では描けない |
| アイコン | 画像を作る（白地に黒）→ 透過 | 絵文字・記号は OS ごとに形が変わる |
| 手書き文字・ロゴマーク（絵の部分） | 画像を作る（白地に黒）→ 透過 | Web フォントで代用すると雰囲気が別物になる |
| ロゴの「文字」部分 | HTML/CSS | 大きさを変えてもにじまない |
| 地図 | 文字なしのイラストを作る ＋ 駅名などは HTML で重ねる | 地図の中の文字は崩れやすい |

- 画像のサイズは **1536x1024 / 1024x1024 / 1024x1536 の 3 種だけ**。表示する枠への合わせ込みは CSS（`object-fit` / `object-position`）で行う
- 枚数の目安: 猫カフェのカンプで 50 枚前後・約 100 円

### 2-2. jobs.json（HTML 担当と画像担当の約束）

| キー | 内容 |
|---|---|
| `name` | 英数字と `-`。元の画像は `assets/raw/<name>.png`。`icon-` `hand-` `logo-` で始まると透過の対象 |
| `kind` | photo / bg / icon / hand / logo / map（見積もりの内訳と、透過するかの判定） |
| `size` | 3 種のどれか |
| `slot` | どこに置くか（セクション・クラス名・注意点）。HTML 担当が読む |
| `final` | 書き出すファイル。写真は `{ "out", "maxWidth" }`、透過は色ごとに `{ "out", "color" }` |
| `adopt` | 作り直し版を採用したときだけ。そのファイル（例 `assets/raw/hero-bg-v2.png`） |
| `prompt` | `prompt-patterns.md` の型から組む（英語。画像に入れる日本語だけ「」で囲む） |

**HTML 担当は `final` の `out` のパスだけを見て組み、画像担当は `final` どおりに書き出す。** ファイル名を変えたくなったら、勝手に変えずに報告する。

### 2-3. 見積もり

- `gen.mjs --dry-run` で表が出る（費用はかからない・台帳も作らない）
- 単価の目安（medium）: 1536x1024 約 1.7〜1.9 円、1024x1024 約 2.2 円
- 上限は 300 円が最大。承認した額を `images.budgetYen` に書く。台帳の累計 ＋ 見積もりが上限を超えると、gen.mjs は 1 枚も作らずに止まる

## 3. 並行で作る

### 3-A. HTML 担当

1. 画像がまだ無い所は点線の仮枠にする。例: `<div class="slot hero__bg" data-ph="hero-bg"><img src="assets/img/hero-bg.jpg" alt="..." onerror="ph(this)"></div>` と、`<head>` に `function ph(img){ var s = img.closest('.slot'); if (s) s.classList.add('is-ph'); img.remove(); }`、CSS に `.slot.is-ph { background: repeating-linear-gradient(135deg, #f8eee2 0 8px, #f3e4d4 8px 16px); outline: 1.5px dashed #c98a6c; }`。画像が届いたら自動で差し替わる
2. 数値は最初から targetWidth 基準で書く（styles.css の先頭に「カンプ幅 724px を 2 倍した 1448px 基準」とコメント）
3. 色は CSS 変数にまとめる。カンプの色は少しぶれているので、近い色は 1 つにそろえる
4. Web フォントはカンプの字形に近いものを最初に決め切る（明朝の見出し → Shippori Mincho B1、丸ゴシック → Zen Maru Gothic など）。フォントを変えると文字の幅が全部変わる
5. 採寸（上のセクションから順に、1 回に数か所ずつ）:
   - 目標値を読む: `"<道具>/crop.mjs" --config lp/comp.config.json --y 740 --h 420 --out-dir lp/comp-shots/html` → 出た画像を Read して top / height / left / width を `measure` に書く
   - 測る: `"<道具>/measure.mjs" --config lp/comp.config.json --out-dir lp/comp-shots/html`（ずれが許容差を超えると終了コード 1）
   - 文字の幅: `"<道具>/textw.mjs" --config lp/comp.config.json --out-dir lp/comp-shots/html`。`ratio`（目標 / 実測）を font-size か letter-spacing に掛ける
   - 見比べる: `"<道具>/shot.mjs" --config lp/comp.config.json --diff --out-dir lp/comp-shots/html` → `cmp_<番号>_<名前>.png` を 1 枚ずつ Read。3 段目は黒いほど一致
6. スマホ幅は `shot.mjs --mobile` で横にはみ出していないかだけ確かめる

### 3-B. 画像担当

1. 一括で作る（**gen.mjs の起動は、この一括と作り直しの 2 回だけ**）。並列数は道具が自動で決める（返事に上限が書いてあればそこから。書いていなければ 2 枚ずつで始め、429 が出たら 1 枚ずつ。1 枚ずつだと 50 枚で 25〜35 分）。受け取ったヘッダの名前を確かめたいときは `--verbose`（値は出ない）
2. 一覧で当たりを付ける: `"<道具>/sheet.mjs" --out lp/comp-shots/img/sheet.png --cols 4 lp/assets/raw/*.png`
3. **全画像を 1 枚ずつ原寸で Read する**（一覧だけで合格にしない）。見る所:
   - 動物・人: 脚・指・耳・目の数と形、体のつながり
   - 画像の中の文字（看板・手書き文字）: 1 文字ずつ。画数の多い漢字は特に
   - 構図: 見出しを重ねる側が空いているか
   - カンプとの一致: 柄・色・向き・小物
4. ダメなものは直す点を 1 つ決めて prompt を直す。全部そろえてから、名前をまとめて 1 回で作り直す（`--only a,b,c --suffix -v2`。元の画像は残る）。同じ prompt のまま作り直さない
5. 作り直し版を採用したら `adopt` に書き、`"<道具>/mask.mjs" batch --jobs lp/jobs.json --config lp/comp.config.json --force` で書き出す
6. `lp/docs/ASSETS.md` に素材ごとの採否・検品メモ・費用（台帳の累計）を書く

### gen.mjs が出す言葉

| 出力 | 意味 | すること |
|---|---|---|
| `並列数: 1（上限ヘッダ L=5 ...）` | 1 枚ずつ作る | 待つ |
| `並列数: 2（上限ヘッダが無いので 2 枚から始めます ...）` | 上限が分からないので 2 枚ずつ。混んでいれば道具が 1 枚ずつに下げる | 待つ |
| `429: 並列数を ... に下げます` | 混んでいるので少し待つ | 待つ（道具が自動で再開する） |
| `状態不明: <name>` | 送ったあと止まった。課金されたか分からない | 受講生に Usage 画面を確かめてもらい、課金が無ければ `--only <name>` |
| `保存済みを確認して ok 扱い` | 保存までできていた | 何もしない |
| `止めました: ... 残高（Billing）か鍵を確認してください` | 残高不足・鍵が無効など | 文言をそのまま受講生に伝えて止まる |
| `上限を超える見積もりです` | 上限に届く | 枚数を減らす。上限は上げない |

### 並行のときの決まり

- 出力先を分ける（HTML 担当 `lp/comp-shots/html/`、画像担当 `lp/comp-shots/img/`）
- `lp/comp.config.json` の measure / text / sections を書くのは HTML 担当だけ。画像担当は jobs.json の prompt と adopt だけ
- 台帳 `lp/docs/image-ledger.tsv` は道具だけが書く（手で書き換えない・消さない）

## 4. 見比べと修正（時間が余ったとき・2 周まで）

- 画像入りのページで shot.mjs --diff → measure.mjs を上のセクションから順に
- 画像の見え方（`object-position`・`transform: scale`）はここで詰める
- 目安は ±3px。2 周で止める

## 5. 途中で止める・再開する

- 再開の判断は台帳 `lp/docs/image-ledger.tsv` だけで行う。1 つの素材の状態は「その name の最後の行」で決まる
  - `ok` / `reconciled` = できている（作り直さない）
  - `err` = 失敗（次の一括で作る）
  - `pending` = 送ったあと止まった（道具が「状態不明」と出す。自動では作らない）
- 再開は一括と同じコマンドを 1 回実行するだけ。できた画像は道具が飛ばす
- `lp/docs/PROGRESS.md` は「次に何をするか」のメモ。画像ができたかどうかの判断には使わない
