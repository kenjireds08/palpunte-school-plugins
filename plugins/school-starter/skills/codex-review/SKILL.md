---
name: codex-review
description: Codexによる自動レビューゲート。「コードレビューして」「レビューして」「Codexでチェックして」で発動。実装完了後に自動でCodexレビュー→修正→再レビューを繰り返し、approveになるまで反復（最大10回）。公式プラグイン（codex-companion）経由で実行。
---

# Codex反復レビュー（公式プラグイン版）

## 概要
OpenAI公式Codexプラグインのcompanion scriptを使用してレビューを実行する。
Claude Codeが書いたコードをCodexがレビューし、問題があればClaude Codeが修正、Codexが再確認。これをCodexがOKを出すまで最大10回自動で繰り返す。

**前提条件**: Codex公式プラグインがインストール済みであること（`/plugin install codex@openai-codex`）

## フロー
```
[規模判定] → small:  review ──────────────────→ [修正ループ]
          → medium: review ────────────────→ [修正ループ]
          → large:  review → adversarial ──→ [修正ループ]
```

- Codex: read-onlyでレビュー（監査役、公式プラグイン経由）
- Claude Code: 修正担当

## companion scriptの場所

以下のglobパターンで動的に解決する（バージョン更新に対応）:
```
~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs
```

セッション開始時に1回だけ解決し、変数 `COMPANION` として保持する:
```bash
COMPANION=$(ls ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs 2>/dev/null | sort -V | tail -1)
```

見つからない場合: 「Codexプラグインが未インストールです。`/plugin install codex@openai-codex` を実行してください」と報告して終了。

## 規模判定

```bash
git diff <diff_range> --stat
git diff <diff_range> --name-status --find-renames
```

| 規模 | 基準 | 戦略 |
|-----|------|-----|
| small | ≤3ファイル、≤100行 | review |
| medium | 4-10ファイル、100-500行 | review |
| large | >10ファイル、>500行 | review → adversarial-review |

`diff_range` 省略時: HEAD を使用し、作業ツリーの未コミット変更を対象とする。

## Codex実行（公式プラグイン経由）

### 標準レビュー
```bash
node "$COMPANION" review --wait
```

### 厳格レビュー（large時、または明示指定時）
```bash
node "$COMPANION" adversarial-review --wait
```

### 実行ルール
- `--wait` を常に付与（フォアグラウンド実行、完了まで待機）
- レビュー完了待ち（必須）: 実行中は次の工程に進まない

## Codex出力の解析

公式プラグインのcompanion scriptは**テキスト形式**でレビュー結果を返す。

### severityの解析ルール

| タグ | severity | 扱い | アクション |
|------|---------|------|-----------|
| `[P0]` | critical | blocking | 修正必須。修正ループへ |
| `[P1]` | high | blocking | 修正必須。修正ループへ |
| `[P2]` | medium | advisory | レポートに記載。修正はユーザー判断 |
| `[P3]` | low | advisory | レポートに記載のみ |

### verdict判定
- `[P0]` または `[P1]` が**1件以上** → 修正ループへ
- `[P0]`/`[P1]` が**0件** → approve（レビュー完了）

## 修正ループ

blocking findingsがある場合、最大10回まで反復:

1. critical/highのみ修正計画を立てる
2. Claude Codeが修正（最小差分のみ）
3. テスト/リンタ実行（可能なら）
4. Codexに再レビュー依頼（`node "$COMPANION" review --wait`）

停止条件:
- approve（blocking findingsが0件）
- 最大10回到達
- テスト2回連続失敗

## エラー時

companion script失敗時:
1. 1回リトライ
2. 再失敗 → エラー内容を報告し、手動レビューを推奨
3. プラグイン未インストール → `/plugin install codex@openai-codex` を案内

## 終了レポート

```
## Codexレビュー結果
- 規模: small（1ファイル、38行）
- 反復: 1/10 / verdict: approve

### 修正履歴
- iter 1: auth.ts L42-45 — 認可チェック追加

### Advisory（参考）
- utils/helper.ts L30 — 変数名がやや冗長
```

## 最終サマリー出力（絶対省略禁止）

**この出力は絶対に省略してはならない。** 変更が小さくても、ファイルが1つでも、必ず出力する。

レビューが approve で完了したら、以下の形式で作業サマリーを出力する。

```markdown
---

## 作業サマリー（Codex独立レビュー用）

### 完了タスク
- タスク1: 概要

### 変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| path/to/file.tsx | 変更の説明 |

### 主な実装ポイント
- ポイント1

### ビルド状態
- TypeScript: /
- ESLint: /
- Build: /

---
```
