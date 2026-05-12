---
name: claude-md
description: CLAUDE.md は wishlist ではなく behavioral contract（行動契約）として設計する。「CLAUDE.md に何を書けばいい？」「CLAUDE.md を整理したい」「ルール追加していい？」「Claude の挙動が変な気がする」「CLAUDE.md を最適化して」等の発話で発動。Karpathy 4 ルール + @mnilax 追加 8 ルールの 12 ルール一覧と、「自分の失敗モードに当てて育てる」手順をガイドする。200 行制限と「効かないルール」も実証データ付きで提示。
---

# CLAUDE.md 設計ガイド — behavioral contract として育てる

## 核となる思想

CLAUDE.md は「あったらいいなリスト」ではなく、**実際に観測した失敗を再発させないための行動契約**。

> CLAUDE.md is not a wishlist. It's a **behavioral contract** that closes specific failure modes you've observed.
> Every rule should answer: **what mistake does this prevent?**

ルールを書く前のチェック:
- [ ] このルールは、**具体的に観測した失敗モード**を防ぐか？
- [ ] このルールがなかった場合、どの mistake が起きるか言える？
- [ ] 「あったらいいな」「ベストプラクティスっぽいから」で書こうとしていないか？

「あったらいいな」で追加するのは禁止。**自分が踏んだ地雷をルール化する**。

---

## 12 ルール（参考テンプレート / そのままコピペするな）

### Karpathy 由来の 4 つ（基礎）

1. **Think Before Coding** — 仮定を明示、不明なら聞く、迷ったら止まる
2. **Simplicity First** — 最小コードで解決、推測機能なし、抽象化なし
3. **Surgical Changes** — 必要な所だけ触る、隣の改良禁止、既存スタイル踏襲
4. **Goal-Driven Execution** — 成功条件を定義してループ、手順を指示しない

### @mnilax 追加 8 つ（エージェント時代向け）

5. **Use the model only for judgment calls** — 判断にだけ AI、決定論的処理はコードで
6. **Token budgets are not advisory** — per-task 4k / per-session 30k
7. **Surface conflicts, don't average them** — 矛盾するパターンを混ぜない
8. **Read before you write** — 書く前に exports / caller / utilities を読む
9. **Tests verify intent, not just behavior** — テストは「なぜ」を検証
10. **Checkpoint after every significant step** — ステップごとに要約
11. **Match the codebase's conventions** — 既存規約に従う
12. **Fail loud** — 「完了」「pass」を簡単に言わない

→ **既に school-starter プラグインの `rules/development.md` に Rule 5, 7, 12 を取り込み済み**。受講生は自動的にこの 3 つが適用される。

---

## 自分の CLAUDE.md を育てる手順

### Step 1: 12 ルールから「自分の失敗モードに当たるもの」を選ぶ

各ルールを「自分は実際にこれで失敗したことがあるか？」で判定する:

- [ ] 仮定で実装が始まって後で齟齬発覚 → Rule 1
- [ ] 過剰実装で工数膨張 → Rule 2
- [ ] 関係ない隣のコードを勝手に「改良」されて困った → Rule 3
- [ ] 弱い指示で迷子になる → Rule 4
- [ ] AI に判断させてランダムな挙動になった → Rule 5
- [ ] 同じ話題を AI と何時間もループした → Rule 6
- [ ] 矛盾する規約を AI が混ぜた → Rule 7
- [ ] 既存と重複する新規関数を書かれた → Rule 8
- [ ] テストが通ってるのに本番で壊れた → Rule 9
- [ ] 多段ステップで途中ミスに気付けず破壊が広がった → Rule 10
- [ ] 既存規約を無視した「自分流」を導入された → Rule 11
- [ ] 「完了」報告の裏で何かが silent にスキップされた → Rule 12

**3〜6 個** に絞るのが理想。「自分はまだ失敗してない」ルールは入れない。

### Step 2: プロジェクト個別ルールを追加

12 ルールはあくまで「汎用」。プロジェクト固有のルールも必要:
- 使うフレームワーク・ライブラリ
- テストコマンド
- DB スキーマ・命名規則
- 業務ロジック上の制約

### Step 3: 200 行を超えないか確認

**14 ルール超え or 200 行超え**でコンプライアンスが急落する（実証データあり）。
- 詳細手順は `docs/` ファイルに切り出してリンクする
- ルールは 1 行で書く（説明は別ファイル）

### Step 4: 1〜2 週間運用 → 観測 → 更新

実際に Claude と作業して、**新しい失敗を観測**したらルール化する。古いルールで「もう発火しない」ものは削除する。

---

## 200 行ルール（実証済み）

@mnilax の 30 codebase × 6 週間実験で:
- 14 ルール超えるとコンプライアンスが **76% → 52% に急落**
- Anthropic 公式の「200 行ルール」は経験則ではなく計測可能な現象

→ **200 行以下を維持**する。超えそうになったら docs/ に切り出し。

---

## 効かないルール（書いても意味なし）

実証データで「効かない」と分かっているもの:

- **"Be careful" / "think hard" / "really focus"** — 検証不能、コンプライアンス 30%。`state assumptions explicitly` のような **imperative rule**（命令形）に置き換える
- **"Be a senior engineer"** — Claude は既に「自分は senior」と思っている、identity prompt は無意味
- **ツール依存ルール** — `Always use eslint` は eslint がない環境で silent fail。`match the codebase's enforced style` のように capability-agnostic に書く
- **CLAUDE.md 内の例示** — 例示 3 個 ≒ ルール 10 個分のコンテキストコスト、過剰フィット。**ルールは抽象、例は具体**。CLAUDE.md にはルールだけ書く
- **14 ルール超え** — コンプライアンス急落。6-rule で当たってる方が、12-rule で半分使わないものより強い

---

## ミニ・テンプレ（最小構成例）

実際の失敗モードがまだ少ない初学者向けの出発点:

```markdown
# CLAUDE.md

## 開発原則
- 依頼内容のみ実装、過剰な機能追加・抽象化をしない（Simplicity First）
- 既存パターンを踏襲、新しい流儀を勝手に導入しない（Match conventions）
- 推測せず該当ファイルを確認してから回答する（Read before write）
- 不明点は黙って進めず聞く（Think before coding）
- 「完了」「pass」を簡単に言わない、skip した部分は明示する（Fail loud）

## このプロジェクトのコマンド
- npm run dev / npm run build / npm test / npm run lint

## このプロジェクトの NG
（自分が踏んだ地雷をここに追記していく）
```

最初は短くて OK。**失敗を踏むたびに 1 行追加**して育てる。

---

## 関連リンク

- 一次情報（@mnilax 原文）: https://x.com/mnilax/status/2053116311132155938
- Forrest Chang の GitHub repo（オリジナル 4 ルール / 120k スター）: https://github.com/forrestchang/andrej-karpathy-skills
- Anthropic 公式 CLAUDE.md ガイド: https://docs.claude.com/en/docs/claude-code/memory
- 解説記事（日本語 HTML）: https://ai-news-effect.pages.dev/posts/2026-05-13-claude-md-12-rules.html
