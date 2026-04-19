---
description: 【受注後・本実装用】詳細ヒアリング（9観点）。spec-lightがあれば自動補完。UX・データ・技術・エッジケース・優先順位・コスト・法令・LLMリスク・性能を全て固める
argument-hint: [作りたい機能や要件の概要（既にspec-light-*.mdがあれば不要）]
allowed-tools: AskUserQuestion, Write, Read, Glob, Grep, Bash
---

interview スキルを **--full モード** で実行してください: $ARGUMENTS

スキル定義: `~/.claude/skills/interview/SKILL.md` の「▼ --full モード（本実装用）」セクションに従う。

## 用途
- 案件受注後の本実装前
- 個人プロジェクトでも本格運用前
- DB設計・タスクバックログ作成の前段階

## 実行フロー
1. コードベース探索（既存プロジェクトの場合）
2. `docs/spec-light-*.md` があれば読み込み、共通項目はスキップして不足分のみヒアリング
3. AskUserQuestionで9観点を確認:
   - **既存5観点**: ユーザー体験 / データ設計 / 技術的判断 / エッジケース / 優先順位
   - **新規4観点**: コスト / 法令・コンプライアンス / LLMリスク（該当時）/ 性能の現実
4. `docs/spec-[機能名].md` に出力（実装前提セクション含む）

## 次のアクション
- `/deep-plan docs/spec-[機能名].md に基づいて計画を作成して`
- `/feature-dev docs/spec-[機能名].md の仕様に基づいて実装して`
