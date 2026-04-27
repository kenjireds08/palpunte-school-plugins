# 週次チェックリスト（Claude Code 運用）

**出典**: Boris Cherny（Claude Code 生みの親）の運用方針

毎週末に4項目をチェック。Claude Code 環境を健全に保ち、継続的に賢くしていくための定例運用。

---

## チェック4項目

### 1. 同じミスを2回指摘してないか？
- してたら → 該当プロジェクトの **CLAUDE.md** に追記
- 全プロジェクトに関わるなら → **グローバル CLAUDE.md** または `~/.claude/rules/` に追記
- 汎用的な開発知見なら → `~/.claude/docs/best-practices.md` に追記

### 2. Skill や Hook で吸収できる反復作業が残ってないか？
- 1日1回以上やる作業 → **Skill 化**（`~/.claude/skills/` に配置）
- 例外なく守らせたい規則 → **Hook で強制**（`~/.claude/settings.json` に PreToolUse/PostToolUse）
- 複数案件で使い回せそうなら → グローバル、案件固有なら → プロジェクト側

### 3. context window 使用率が高すぎないか？
- セッション中は status line で常時確認（branch + ctx% + cost）
- 70% 超えたら → **/compact** で整理
- 90% 超えたら → **/clear-prep + /clear** で新セッション

### 4. worktree の本数は適切か？
- 目安: **3〜5本**（Boris 推奨）
- レビュー帯域・CPU・頭の切り替えコストで調整
- 並列が増えすぎたら本数を減らす（独立タスクで2本でも十分なことも）

---

## 補足: Boris の運用フロー（参考）

```
Plan Mode（調査・計画）
  ↓ 実装セッション
  ↓ テスト・スクリーンショット・CLI で自己検証
  ↓ PR作成
  ↓ Code Review（プラグインの review スキル + Codex 別タブコピペ独立レビュー）
  ↓ 学びを CLAUDE.md / Hook / Skill に還元 ← /learn スキルが自動で実行
```

→ **「Plan → Verify → Persist → Automate」** の4フェーズで運用構成要素を一つずつ固める。

## いつ実行するか

- **毎週末（金曜夕方〜日曜）** が目安
- 案件納品後・大きなフェーズ完了後にも追加で実行
- セッション開始時に「週次チェックして」と依頼すれば、このファイルを読んで4項目を順に確認する
