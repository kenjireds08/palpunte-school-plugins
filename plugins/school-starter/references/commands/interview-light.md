---
description: 【受注前・モックアップ用】要件をざっくり固める軽量ヒアリング（5問完結）。冒頭でHobby or work?を確認し、business文脈・ユーザー・MVP・モックアップ範囲・制約を聞く
argument-hint: [作りたい機能や要件の概要（例: 予約管理アプリ、ECカート機能など）]
allowed-tools: AskUserQuestion, Write, Read, Glob, Grep, Bash
---

interview スキルを **--light モード** で実行してください: $ARGUMENTS

スキル定義: `~/.claude/skills/interview/SKILL.md` の「▼ --light モード（モックアップ・商談用）」セクションに従う。

## 用途
- モックアップ作成前
- 見積もり作成前
- クライアントとの商談前
- まだ受注していない / 受注確定していない案件

## 実行フロー
1. コードベース探索（既存プロジェクトの場合）
2. 5つのAskUserQuestionで質問:
   - Q1: 用途（Hobby or work?）+ クライアント文脈
   - Q2: エンドユーザー（年齢層・デバイス・利用シーン）
   - Q3: 機能スコープ（MVP / 管理画面 / やらないこと）
   - Q4: モックアップ範囲（画面数・主要画面・デザイン方向性）
   - Q5: 制約・前提（予算感・納期感・技術希望）
3. `docs/spec-light-[機能名].md` に出力

## 受注後の流れ
受注確定したら `/interview-full` で詳細化（spec-light-*.md を自動読み込みして補完）
