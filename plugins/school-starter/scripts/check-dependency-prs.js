#!/usr/bin/env node
/**
 * SessionStart Hook (matcher: startup): 届いている「部品の更新提案」を検知して Claude から声をかけさせる。
 *
 * 背景（2026-08-23 ちーけん指摘）:
 *   品質ゲート（quality-gate）を入れると Dependabot が毎週 PR を作る。しかし受講生は
 *   「プルリクエスト」が何かを知らず、GitHub の Pull requests タブも見ない。
 *   dependency-pr スキルは受講生が PR を話題に出したときに起動する設計だったため、
 *   「受講生が言い出さない限り永遠に起動しない」穴があった。
 *   → セッション開始時に決定論的に検知し、Claude 側から切り出させることで穴を塞ぐ。
 *
 * 検知方法（ネットワークを使わない・gh の認証も不要）:
 *   Dependabot は PR を作るとき、リポジトリ自体に `dependabot/...` という名前の
 *   ブランチを作る。手元に取り込み済みのリモート参照を見るだけで分かる。
 *   - `gh` コマンドの認証は不要（受講生は VS Code の認証を使っており gh は未設定なことが多い）
 *   - 通信しないのでセッション開始が遅くならない・オフラインでも落ちない
 *
 * 精度について:
 *   手元のリモート参照は最後に同期した時点のものなので、すでにマージ済みのものが
 *   残っている可能性がある。そこで「N 件あります」と断定させず、
 *   「届いているかもしれないので一緒に確認しましょう」と Claude に案内させる。
 *   検知＝コードの仕事、説明と確認＝Claude の仕事、と役割を分ける。
 */

const { execFileSync } = require('node:child_process');

function listDependabotBranches(cwd) {
  let out;
  try {
    out = execFileSync('git', ['branch', '-r', '--format=%(refname:short)'], {
      cwd,
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'], // git のエラー出力は捨てる（非 git フォルダ等）
    });
  } catch (_e) {
    return []; // git 未インストール / リポジトリでない / リモート未設定 → 何もしない
  }

  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /(^|\/)dependabot\//.test(l))
    .map((l) => l.replace(/^[^/]+\//, '')); // 先頭の origin/ を落とす
}

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw || '{}');
  } catch (_e) {
    process.exit(0);
  }

  // matcher で絞っているはずだが、念のため startup 以外は素通し
  if (String(input.source || '') !== 'startup') process.exit(0);

  const cwd = input.cwd || process.cwd();
  const branches = listDependabotBranches(cwd);
  if (branches.length === 0) process.exit(0);

  const list = branches.map((b) => `  - ${b}`).join('\n');

  const context =
    '【school-starter】部品（パッケージ）の更新提案が届いている可能性があります\n\n' +
    'このプロジェクトに、Dependabot（部品の見張り）が作ったとみられる更新の目印が ' +
    branches.length +
    ' 件あります:\n' +
    list +
    '\n\n' +
    'YOU MUST: これはユーザーが自分から言い出さない話題です。**あなたのほうから最初に切り出してください。**\n' +
    'ユーザーはプルリクエスト（PR）が何かを知らない前提で、次のように進めます:\n\n' +
    '1. まず「GitHub のほうで、アプリが使っている部品の更新の提案が届いているかもしれません。' +
    '一緒に見てみますか？」と、**専門用語を使わずに**声をかける\n' +
    '2. 「これは事故ではなく見張りが働いている証拠」「今すぐ対応しなくてもアプリは壊れない」' +
    'の2点を先に伝えて安心させる\n' +
    '3. 進めるなら dependency-pr スキルの手順に従う（1件ずつ・まとめてマージしない・' +
    '判断の根拠をコメントに残す・マージ後に本番へ反映されたか確認）\n' +
    '4. 「あとにする」と言われたら素直に引き下がる。急ぐ話ではない\n\n' +
    '注意: この目印は手元に取り込み済みの情報から見ているため、**すでに対応済みのものが混ざっている' +
    '可能性があります**。「◯件あります」と断定せず、GitHub の Pull requests タブで現状を' +
    '一緒に確認してから話を進めてください。\n' +
    '注意: 作業の途中でユーザーが別のことに集中している場合は、割り込まず、区切りがついてから切り出すこと。';

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: context,
      },
    })
  );
  process.exit(0);
});
