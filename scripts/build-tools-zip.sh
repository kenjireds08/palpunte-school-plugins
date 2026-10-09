#!/usr/bin/env bash
# comp-to-lp の道具一式を、プロンプト版（シート章 A）向けの zip にする。
#
# 使い方: npm run build:tools -- <出力先のフォルダ>
#         （出力先を省くと $TMPDIR。palpunte-school-html/cheatsheet/ への配置は別の手順で行う）
#
# zip の中身（フォルダを 1 段も作らない。lp/tools/ に展開すると lp/tools/VERSION・lp/tools/templates/ になる）:
#   VERSION            plugin.json の version（zip の名前と同じ版）
#   *.mjs              plugins/school-starter/skills/comp-to-lp/scripts/ の道具
#   compose.html       同じフォルダの合成用ページ
#   templates/*.json   plugins/school-starter/skills/comp-to-lp/templates/ のひな形
set -euo pipefail

# 先に必要なコマンドがあるかを確かめる（途中で止まって古い zip だけが消える、を起こさない）
for cmd in node zip unzip; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd コマンドが見つかりません。入れてからもう一度実行してください（今ある zip はそのままです）" >&2
    exit 1
  fi
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL="$ROOT/plugins/school-starter/skills/comp-to-lp"
PLUGIN_JSON="$ROOT/plugins/school-starter/.claude-plugin/plugin.json"

VERSION="$(node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version; if (!/^\d+\.\d+\.\d+$/.test(v || "")) { console.error("plugin.json の version が読めません: " + v); process.exit(1); } console.log(v);' "$PLUGIN_JSON")"

OUT_DIR="${1:-${TMPDIR:-/tmp}}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
NAME="comp-to-lp-tools-$VERSION.zip"

# 入れる前に、道具が壊れていないことを確かめる
for f in "$SKILL"/scripts/*.mjs; do
  node --check "$f"
done
for f in "$SKILL"/templates/*.json; do
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$f"
done
if grep -l 'CLAUDE_PLUGIN_ROOT' "$SKILL"/scripts/* "$SKILL"/templates/* >/dev/null 2>&1; then
  echo "道具かひな形に CLAUDE_PLUGIN_ROOT が入っています（受講生側のファイルには書かない）" >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/comp-to-lp-tools.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
STAGE="$WORK/stage"
mkdir -p "$STAGE/templates"
cp "$SKILL"/scripts/*.mjs "$SKILL/scripts/compose.html" "$STAGE/"
cp "$SKILL"/templates/*.json "$STAGE/templates/"
printf '%s\n' "$VERSION" > "$STAGE/VERSION"

# 一時ファイルに作り、中身を確かめてから置き換える（失敗したら今ある zip はそのまま）
TMP_ZIP="$WORK/$NAME"
# -X: 余計な属性を入れない / -D: フォルダだけの項目を入れない
(cd "$STAGE" && zip -X -D -q -r "$TMP_ZIP" VERSION *.mjs compose.html templates)

EXPECTED="$(cd "$STAGE" && find . -type f | sed 's#^\./##' | LC_ALL=C sort)"
ACTUAL="$(unzip -Z1 "$TMP_ZIP" | LC_ALL=C sort)"
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "zip の中身が想定と違います（今ある zip はそのままです）" >&2
  diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") >&2 || true
  exit 1
fi
if [ "$(unzip -p "$TMP_ZIP" VERSION | tr -d '\r\n')" != "$VERSION" ]; then
  echo "zip の中の VERSION が $VERSION ではありません（今ある zip はそのままです）" >&2
  exit 1
fi
unzip -tq "$TMP_ZIP" >/dev/null

# 同じフォルダに一時の名前で移してから名前を変える（置き換えの途中で壊れた zip が見えないように）
cp "$TMP_ZIP" "$OUT_DIR/.$NAME.tmp"
mv -f "$OUT_DIR/.$NAME.tmp" "$OUT_DIR/$NAME"

echo "$OUT_DIR/$NAME"
unzip -l "$OUT_DIR/$NAME"
