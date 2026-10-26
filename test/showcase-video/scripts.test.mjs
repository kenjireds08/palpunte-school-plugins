#!/usr/bin/env node
/**
 * showcase-video スキルの道具（scripts/*.ts）のテスト。課金なし・ネットワークなし・鍵なし
 *
 * 実行: npm run test:showcase-video（Node 22.18 以上。.ts をそのまま読み込むため。古い Node では全体を skip）
 * 鍵・制作クレジットの置き場は、テストごとに一時フォルダへ向ける（SHOWCASE_CREDENTIALS_FILE / SHOWCASE_PROFILE_FILE /
 * SHOWCASE_IMAGE_STUDIO_ENV）。本物の ~/.config/school-starter/ には触らない
 */
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..", "..");
const SKILL = path.join(ROOT, "plugins", "school-starter", "skills", "showcase-video");
const SCRIPTS = path.join(SKILL, "scripts");

const [maj, min] = process.versions.node.split(".").map(Number);
const skip = maj > 22 || (maj === 22 && min >= 18) ? false : `Node ${process.versions.node} は .ts をそのまま動かせないので skip（22.18 以上で動く）`;

const KEY_VARS = ["ELEVENLABS_API_KEY", "OPENAI_API_KEY", "SHOWCASE_CREDENTIALS_FILE", "SHOWCASE_PROFILE_FILE", "SHOWCASE_IMAGE_STUDIO_ENV"];

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `showcase-test-${name}-`));
}

/** 鍵まわりの環境変数を退避して空にし、終わったら戻す（値は表示しない） */
async function withCleanEnv(set, fn) {
  const saved = Object.fromEntries(KEY_VARS.map((k) => [k, process.env[k]]));
  for (const k of KEY_VARS) delete process.env[k];
  Object.assign(process.env, set);
  try {
    return await fn();
  } finally {
    for (const k of KEY_VARS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

/** 子プロセスに渡す環境（鍵を消し、置き場を一時フォルダに向ける） */
function childEnv(extra) {
  const env = { ...process.env };
  for (const k of KEY_VARS) delete env[k];
  return { ...env, ...extra };
}

function runTs(file, args, env) {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, file), ...args], { encoding: "utf8", env, timeout: 60000 });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

const load = (rel) => import(pathToFileURL(path.join(SCRIPTS, rel)).href);

const DUMMY_ELEVEN = "a".repeat(24) + "0123456789";
const DUMMY_OPENAI = "sk-test-" + "b".repeat(30);

// ---------- 鍵の探し方 ----------

test("keys: 環境変数 → 共通の置き場 → image-studio（OpenAI だけ）の順に探す", { skip }, async () => {
  const { findKey, keyStatus } = await load("lib/keys.ts");
  const d = tmpDir("keys");
  const cred = path.join(d, "credentials.env");
  const studio = path.join(d, "studio.env");
  fs.writeFileSync(cred, `ELEVENLABS_API_KEY=${DUMMY_ELEVEN}\n`);
  fs.writeFileSync(studio, `OPENAI_API_KEY="${DUMMY_OPENAI}"\nELEVENLABS_API_KEY=${DUMMY_ELEVEN}x\n`);
  await withCleanEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_IMAGE_STUDIO_ENV: studio }, () => {
    assert.strictEqual(findKey("ELEVENLABS_API_KEY")?.source, "共通の置き場");
    assert.strictEqual(findKey("ELEVENLABS_API_KEY")?.value, DUMMY_ELEVEN, "image-studio の ElevenLabs は使わない");
    const o = findKey("OPENAI_API_KEY");
    assert.strictEqual(o?.source, "image-studio");
    assert.strictEqual(o?.value, DUMMY_OPENAI, "引用符を外す");
    process.env.OPENAI_API_KEY = "sk-env-" + "c".repeat(30);
    assert.strictEqual(findKey("OPENAI_API_KEY")?.source, "環境変数");
    const st = keyStatus("OPENAI_API_KEY");
    assert.deepStrictEqual(Object.keys(st).sort(), ["found", "shape", "source"], "keyStatus は値を返さない");
  });
  await withCleanEnv({ SHOWCASE_CREDENTIALS_FILE: path.join(d, "none.env"), SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none2.env") }, () => {
    assert.strictEqual(findKey("ELEVENLABS_API_KEY"), null);
    assert.strictEqual(findKey("OPENAI_API_KEY"), null);
  });
});

test("keys: parseEnvValue は export・コメント・同名の 2 行目に対応、keyShape は形だけを見る", { skip }, async () => {
  const { parseEnvValue, keyShape, redactKeys } = await load("lib/keys.ts");
  assert.strictEqual(parseEnvValue("export OPENAI_API_KEY=sk-aaa # memo\n", "OPENAI_API_KEY"), "sk-aaa");
  assert.strictEqual(parseEnvValue("OPENAI_API_KEY=sk-1\nOPENAI_API_KEY=sk-2\n", "OPENAI_API_KEY"), "sk-2");
  assert.strictEqual(parseEnvValue("OTHER=1\n", "OPENAI_API_KEY"), null);
  assert.strictEqual(keyShape("OPENAI_API_KEY", DUMMY_OPENAI), "ok");
  assert.strictEqual(keyShape("OPENAI_API_KEY", DUMMY_ELEVEN), "bad-prefix");
  assert.strictEqual(keyShape("ELEVENLABS_API_KEY", "short"), "bad-char");
  assert.strictEqual(keyShape("ELEVENLABS_API_KEY", `"${DUMMY_ELEVEN}"`), "bad-char");
  assert.strictEqual(keyShape("ELEVENLABS_API_KEY", ""), "missing");
  assert.ok(!redactKeys(`x ${DUMMY_OPENAI} y`).includes(DUMMY_OPENAI));
  assert.ok(!redactKeys(`x ${DUMMY_ELEVEN} y`, [DUMMY_ELEVEN]).includes(DUMMY_ELEVEN));
});

// ---------- 鍵の保存 ----------

test("save-key: upsertKeyLine は同じ名前の行だけを置き換え、ほかの行を残す", { skip }, async () => {
  const { upsertKeyLine } = await load("save-key.ts");
  assert.strictEqual(upsertKeyLine("", "OPENAI_API_KEY", "sk-1"), "OPENAI_API_KEY=sk-1\n");
  assert.strictEqual(
    upsertKeyLine("ELEVENLABS_API_KEY=e1\nexport OPENAI_API_KEY=sk-old\n", "OPENAI_API_KEY", "sk-new"),
    "ELEVENLABS_API_KEY=e1\nOPENAI_API_KEY=sk-new\n",
  );
});

test("save-key: saveKey は一時ファイルの置き場に 600 で書き、形の悪いキーは保存しない", { skip }, async () => {
  const { saveKey, SaveKeyError } = await load("save-key.ts");
  const { findKey } = await load("lib/keys.ts");
  const d = tmpDir("save");
  const file = path.join(d, "sub", "credentials.env");
  saveKey("ELEVENLABS_API_KEY", DUMMY_ELEVEN, file);
  saveKey("OPENAI_API_KEY", DUMMY_OPENAI, file);
  if (process.platform !== "win32") {
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    assert.strictEqual(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  }
  assert.throws(() => saveKey("OPENAI_API_KEY", "not-a-key-but-long-enough", file), SaveKeyError);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ["credentials.env"], "一時ファイルが残らない");
  await withCleanEnv({ SHOWCASE_CREDENTIALS_FILE: file, SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none.env") }, () => {
    assert.strictEqual(findKey("OPENAI_API_KEY")?.value, DUMMY_OPENAI, "形の悪いキーで上書きされていない");
    assert.strictEqual(findKey("ELEVENLABS_API_KEY")?.value, DUMMY_ELEVEN);
  });
});

test("save-key: 端末でない入力（Claude が実行した場合）は保存せずに止まる", { skip }, () => {
  const d = tmpDir("save-notty");
  const file = path.join(d, "credentials.env");
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, "save-key.ts"), "elevenlabs"], {
    encoding: "utf8",
    input: `${DUMMY_ELEVEN}\n`,
    env: childEnv({ SHOWCASE_CREDENTIALS_FILE: file }),
    timeout: 30000,
  });
  assert.notStrictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(file), "保存していない");
  assert.ok(!`${r.stdout}${r.stderr}`.includes(DUMMY_ELEVEN), "キーを画面に出さない");
});

// ---------- ガード（鍵の置き場を Claude が読まない） ----------

test("guard: 共通の置き場を cat / grep / head で読むコマンドは止まり、保存用・確認用の道具は通る", () => {
  const require = createRequire(import.meta.url);
  const { detect } = require(path.join(ROOT, "plugins", "school-starter", "scripts", "guard-env-access.js"));
  for (const c of [
    "cat ~/.config/school-starter/credentials.env",
    "grep KEY ~/.config/school-starter/credentials.env",
    "head -1 ~/.config/school-starter/credentials.env",
    "cat ~/claude-code-projects/image-studio/.env.local",
  ]) assert.strictEqual(detect(c), true, c);
  for (const c of [
    `node "${SCRIPTS}/save-key.ts" elevenlabs`,
    `node "${SCRIPTS}/deps.mjs" --dir promo-video`,
    `node "${SCRIPTS}/showcase-check.ts" tts --config promo-video/showcase.config.json`,
  ]) assert.strictEqual(detect(c), false, c);
});

// ---------- 制作クレジット ----------

test("credit: buildCredit は会社名必須・名前は任意・読みはかなだけ", { skip }, async () => {
  const { buildCredit, CreditError } = await load("credit.ts");
  assert.deepStrictEqual(buildCredit({ org: "見本工房", orgKana: "みほんこうぼう" }), {
    org: "見本工房",
    orgKana: "みほんこうぼう",
    name: null,
    nameKana: null,
    display: "見本工房",
    kana: "みほんこうぼう",
  });
  const c = buildCredit({ org: "見本工房", orgKana: "みほんこうぼう", name: "見本 太郎", nameKana: "みほんたろう" });
  assert.strictEqual(c.display, "見本工房　見本 太郎");
  assert.strictEqual(c.kana, "みほんこうぼう、みほんたろう");
  assert.throws(() => buildCredit({ orgKana: "みほん" }), CreditError);
  assert.throws(() => buildCredit({ org: "見本工房", orgKana: "mihon" }), CreditError);
  assert.throws(() => buildCredit({ org: "見本工房", orgKana: "みほん", name: "見本 太郎" }), CreditError);
  assert.throws(() => buildCredit({ org: "見本工房", orgKana: "みほん", nameKana: "たろう" }), CreditError);
  assert.throws(() => buildCredit({ org: "〔会社〕", orgKana: "かいしゃ" }), CreditError);
});

test("credit: applyToHtml は data-credit-name の中身だけを書き換え、HTML をエスケープする", { skip }, async () => {
  const { applyToHtml, creditFromConfig, CreditError } = await load("credit.ts");
  const src = '<p>制作：<span class="c" data-credit-name>〔会社名〕</span></p><b data-credit-name="">x</b><i>keep</i>';
  const r = applyToHtml(src, "A&B <工房>");
  assert.strictEqual(r.count, 2);
  assert.ok(r.html.includes('<span class="c" data-credit-name>A&amp;B &lt;工房&gt;</span>'));
  assert.ok(r.html.includes("<i>keep</i>"));
  assert.deepStrictEqual(creditFromConfig({ credit: { display: "見本工房", kana: "みほんこうぼう" } }), { display: "見本工房", kana: "みほんこうぼう" });
  assert.throws(() => creditFromConfig({ credit: { display: "〔会社名・屋号〕", kana: "" } }), CreditError);
});

test("credit: save は SHOWCASE_PROFILE_FILE の置き場と設定の credit に書く", { skip }, () => {
  const d = tmpDir("credit");
  const profile = path.join(d, "profile.json");
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ project: { name: "見本" }, credit: { display: "〔会社名・屋号〕", kana: "〔読み〕" } }, null, 2));
  const help = runTs("credit.ts", ["--help"], childEnv({ SHOWCASE_PROFILE_FILE: profile }));
  assert.strictEqual(help.status, 0, help.out);
  const usage = help.out.split("\n").filter((l) => /save/.test(l)).join("\n");
  assert.ok(usage.length > 0, help.out);
  const r = runTs("credit.ts", ["save", "--config", cfg, "--org", "見本工房", "--org-kana", "みほんこうぼう"], childEnv({ SHOWCASE_PROFILE_FILE: profile }));
  assert.strictEqual(r.status, 0, r.out);
  const saved = JSON.parse(fs.readFileSync(cfg, "utf8"));
  assert.deepStrictEqual(saved.credit, { display: "見本工房", kana: "みほんこうぼう" });
  assert.ok(fs.existsSync(profile), "次の動画のために覚えておく");
});

// ---------- 読み上げ ----------

test("eleven-tts: {{credit}} を読みに置き換え、読みが無ければ止まる", { skip }, async () => {
  const { applyCreditToken, UsageError } = await load("eleven-tts.ts");
  assert.strictEqual(applyCreditToken("せいさく、{{credit}}。", "みほんこうぼう", "x"), "せいさく、みほんこうぼう。");
  assert.strictEqual(applyCreditToken("ふつうの文", null, "x"), "ふつうの文");
  assert.throws(() => applyCreditToken("せいさく、{{credit}}。", null, "x"), UsageError);
});

test("eleven-tts: 台本の〔 〕は 1 字も送らずに止まる・正しい台本は jobs になる", { skip }, async () => {
  const { jobsFromScript, UsageError } = await load("eleven-tts.ts");
  const d = tmpDir("tts");
  const example = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", "narration.script.example.json"), "utf8"));
  const raw = path.join(d, "raw.script.json");
  fs.writeFileSync(raw, JSON.stringify(example));
  assert.throws(() => jobsFromScript(raw, "みほん"), UsageError);
  const filled = { ...example, items: example.items.map((it) => ({ ...it, text: it.id === "s6-name" ? "よやくる。せいさく、{{credit}}。" : "見本の文です。" })) };
  const ok = path.join(d, "ok.script.json");
  fs.writeFileSync(ok, JSON.stringify(filled));
  const { jobs } = jobsFromScript(ok, "みほんこうぼう");
  assert.strictEqual(jobs.length, 6);
  assert.strictEqual(jobs[5].text, "よやくる。せいさく、みほんこうぼう。");
  assert.strictEqual(jobs[0].spec.voice, "EHMH9cyd1z3rXm4z0Jja");
  assert.strictEqual(jobs[0].spec.model, "eleven_v4");
  assert.throws(() => jobsFromScript(ok, null), UsageError, "{{credit}} があるのに読みが無い");
});

test("eleven-tts: parseArgs と stopReason（上限・今月の残り）", { skip }, async () => {
  const { parseArgs, stopReason, UsageError } = await load("eleven-tts.ts");
  const a = parseArgs(["--script", "a.json", "--config", "c.json", "--dry-run", "--max-credits", "300"]);
  assert.strictEqual(a.script, "a.json");
  assert.strictEqual(a.dryRun, true);
  assert.strictEqual(a.maxCredits, 300);
  assert.throws(() => parseArgs(["--nope"]), UsageError);
  assert.strictEqual(stopReason({ sub: { count: 0, limit: 10000, resetUnix: null, tier: "free" }, usedThisRun: 0, need: 50, maxCredits: null, usedTotal: 0 }), null);
  assert.match(stopReason({ sub: { count: 9990, limit: 10000, resetUnix: null, tier: "free" }, usedThisRun: 0, need: 50, maxCredits: null, usedTotal: 0 }) ?? "", /残りが足りない/);
  assert.match(stopReason({ sub: null, usedThisRun: 0, need: 50, maxCredits: 100, usedTotal: 60 }) ?? "", /上限/);
});

test("eleven-client: 4xx の分け方（声を選び直す／前提の不備／失敗）", { skip }, async () => {
  const { classify4xx } = await load("lib/eleven-client.ts");
  const v = "EHMH9cyd1z3rXm4z0Jja";
  assert.strictEqual(classify4xx(402, '{"detail":{"status":"free_users_not_allowed"}}', v).kind, "voice");
  assert.match(classify4xx(402, "free users", v).message, /voices\.ts/);
  assert.strictEqual(classify4xx(401, '{"detail":{"status":"missing_permissions"}}', v).kind, "premise");
  assert.strictEqual(classify4xx(401, "invalid api key", v).kind, "premise");
  assert.strictEqual(classify4xx(429, "quota_exceeded", v).kind, "premise");
  assert.strictEqual(classify4xx(404, "voice_not_found", v).kind, "voice");
  assert.strictEqual(classify4xx(400, "something else", v).kind, "failed");
});

test("voices: 日本語で確かめ済みのモデルだけを拾い、v4 を優先する", { skip }, async () => {
  const { toRow, pickModel } = await load("voices.ts");
  const row = toRow({
    voice_id: "abc",
    name: "Sample",
    category: "premade",
    labels: { gender: "female", accent: "american" },
    verified_languages: [
      { language: "ja", model_id: "eleven_multilingual_v2" },
      { language: "ja", model_id: "eleven_v4" },
      { language: "en", model_id: "eleven_turbo_v2_5" },
    ],
  });
  assert.deepStrictEqual(row?.jaModels, ["eleven_multilingual_v2", "eleven_v4"]);
  assert.strictEqual(row?.gender, "female");
  assert.strictEqual(toRow({ name: "no id" }), null);
  assert.strictEqual(pickModel(row?.jaModels ?? []), "eleven_v4");
  assert.strictEqual(pickModel(["eleven_multilingual_v2", "x"]), "eleven_multilingual_v2");
  assert.strictEqual(pickModel([]), null);
});

// ---------- 効果音・画像・書き起こし ----------

test("gen-sfx: 全部の効果音が作れて、同じ名前なら同じ音（再現できる）・ピークが -3dB 以下", { skip }, async () => {
  const { SFX_NAMES, render, toWav, PEAK, SAMPLE_RATE } = await load("gen-sfx.ts");
  assert.ok(SFX_NAMES.length >= 3, SFX_NAMES.join(","));
  for (const n of SFX_NAMES) {
    const a = render(n);
    const b = render(n);
    assert.ok(a.length > SAMPLE_RATE * 0.05, n);
    assert.deepStrictEqual(Buffer.from(a.buffer), Buffer.from(b.buffer), n);
    let peak = 0;
    for (const s of a) peak = Math.max(peak, Math.abs(s));
    assert.ok(peak > 0 && peak <= PEAK + 1e-6, `${n} peak ${peak}`);
    const wav = toWav(a);
    assert.strictEqual(wav.toString("ascii", 0, 4), "RIFF");
    assert.strictEqual(wav.toString("ascii", 8, 12), "WAVE");
  }
});

test("gen-images: 作り済みと合わせて 30 枚まで・台帳の最後の行で「できた」を決める", { skip }, async () => {
  const { checkImageCount, doneNames, MAX_IMAGES } = await load("gen-images.ts");
  const jobs = (n, p = "j") => Array.from({ length: n }, (_, i) => ({ name: `${p}${i}`, size: "1024x1024", prompt: "x" }));
  assert.strictEqual(MAX_IMAGES, 30);
  assert.strictEqual(checkImageCount(jobs(30), new Set()).message, null);
  assert.match(checkImageCount(jobs(31), new Set()).message ?? "", /30 枚まで/);
  assert.match(checkImageCount(jobs(25), new Set(["d0", "d1", "d2", "d3", "d4", "d5"])).message ?? "", /31 枚/);
  assert.strictEqual(checkImageCount(jobs(5), new Set(["j0", "j1"])).total, 5, "作り直しは数え直さない");
  assert.ok(checkImageCount({}, new Set()).message);
  const d = tmpDir("ledger");
  const ledger = path.join(d, "image-ledger.tsv");
  fs.writeFileSync(ledger, "time\tname\tevent\n1\ta\tsent\n2\ta\tok\n3\tb\tsent\n4\tc\tok\n5\tc\tfailed\n");
  assert.deepStrictEqual([...doneNames(ledger)].sort(), ["a"]);
});

test("gen-images: 31 枚は作る前に止まる（exit 2）・テストモードなら課金せずに作れる", { skip }, () => {
  const d = tmpDir("images");
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ images: { budgetYen: 60 } }));
  const many = path.join(d, "many.jobs.json");
  fs.writeFileSync(many, JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ name: `p${i}`, size: "1024x1024", prompt: "a bowl of rice" }))));
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: path.join(d, "none.env"), SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none2.env") });
  const r = runTs("gen-images.ts", ["--jobs", many, "--config", cfg, "--dry-run"], env);
  assert.strictEqual(r.status, 2, r.out);
  assert.match(r.out, /30 枚まで/);
  const two = path.join(d, "two.jobs.json");
  fs.writeFileSync(two, JSON.stringify([{ name: "a", size: "1024x1024", prompt: "a bowl of rice" }, { name: "b", size: "1536x1024", prompt: "a kitchen" }]));
  const fake = runTs("gen-images.ts", ["--jobs", two, "--config", cfg], { ...env, COMP_TO_LP_FAKE: "ok", COMP_TO_LP_FAKE_WAIT_MS: "1", OPENAI_API_KEY: DUMMY_OPENAI });
  assert.strictEqual(fake.status, 0, fake.out);
  assert.match(fake.out, /2 枚/);
  assert.ok(fs.existsSync(path.join(d, "docs", "image-ledger.tsv")), fake.out);
});

test("gen-images: 人物が写るプロンプトに国・地域（既定 Japanese）が無いものを拾う", { skip }, async () => {
  const { missingPeopleRegion, DEFAULT_PEOPLE_REGION } = await load("gen-images.ts");
  assert.strictEqual(DEFAULT_PEOPLE_REGION, "Japanese");
  const tail = " No text. Not resembling any real person, real shop or real place.";
  const jobs = [
    { name: "food", prompt: "Photorealistic food photo of bread on a board." + tail },
    { name: "jp", prompt: "A Japanese woman in her 40s holding a phone." + tail },
    { name: "group", prompt: "A small group of three adults kneading bread dough." + tail },
    { name: "hands", prompt: "Close-up of hands placing bread on a rack." + tail },
    { name: "jp-hands", prompt: "Close-up of hands of a japanese woman." + tail },
  ];
  assert.deepStrictEqual(missingPeopleRegion(jobs), ["group", "hands"], "決まり文句の real person は人物と数えない");
  assert.deepStrictEqual(missingPeopleRegion(jobs, "Korean"), ["jp", "group", "hands", "jp-hands"]);
  assert.deepStrictEqual(missingPeopleRegion({}), []);
  const sample = JSON.parse(fs.readFileSync(path.join(ROOT, "test", "showcase-video", "sample-app", "promo-video", "docs", "images.jobs.json"), "utf8"));
  assert.deepStrictEqual(missingPeopleRegion(sample), [], "見本アプリの写真の一覧は全部そろっている");
});

test("gen-images: 国・地域の無い人物のプロンプトは作る前に止まる（exit 2）・設定の peopleRegion に従う", { skip }, () => {
  const d = tmpDir("region");
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ images: { budgetYen: 60 } }));
  const jobs = path.join(d, "jobs.json");
  fs.writeFileSync(jobs, JSON.stringify([{ name: "group", size: "1536x1024", prompt: "Three adults kneading bread dough. No text." }]));
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: path.join(d, "none.env"), SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none2.env") });
  const ng = runTs("gen-images.ts", ["--jobs", jobs, "--config", cfg, "--dry-run"], env);
  assert.strictEqual(ng.status, 2, ng.out);
  assert.match(ng.out, /国・地域（Japanese）/);
  assert.match(ng.out, /group/);
  fs.writeFileSync(cfg, JSON.stringify({ images: { budgetYen: 60, peopleRegion: "adults" } }));
  const ok = runTs("gen-images.ts", ["--jobs", jobs, "--config", cfg, "--dry-run"], env);
  assert.strictEqual(ok.status, 0, ok.out);
});

test("transcribe: shapeResponse は単語の時刻と費用を出し、形が違えば止まる", { skip }, async () => {
  const { shapeResponse, USD_PER_MINUTE } = await load("transcribe.ts");
  const w = shapeResponse({ text: " よやくる。 ", duration: 60, words: [{ word: "よやくる", start: 0.1234, end: 0.9 }, { nope: 1 }], segments: [{ start: 0, end: 1, text: " よやくる。" }] }, "a.wav");
  assert.strictEqual(w.transcript, "よやくる。");
  assert.deepStrictEqual(w.tokens, [{ text: "よやくる", at: 0.123, to: 0.9 }]);
  assert.deepStrictEqual(w.segments, [{ from: 0, to: 1, text: "よやくる。" }]);
  assert.strictEqual(w.costUsd, USD_PER_MINUTE);
  assert.throws(() => shapeResponse({ duration: 1 }, "a.wav"));
});

// ---------- 検査 ----------

test("showcase-check: 純粋関数（〔 〕の埋め残し・REPLACE の印・コメント内は数えない・コントラスト）", { skip }, async () => {
  const { configPlaceholders, replaceMarkers, findInBody, contrastRatio, stripComments } = await load("showcase-check.ts");
  assert.deepStrictEqual(configPlaceholders({ project: { name: "〔名前〕", kind: "phone-pc" } }).length, 1);
  assert.deepStrictEqual(configPlaceholders({ project: { name: "見本" } }), []);
  assert.deepStrictEqual(replaceMarkers("a\n<!-- REPLACE: x -->\n「REPLACE」で検索\nDONE"), [2]);
  assert.deepStrictEqual(replaceMarkers("（PC の枠に替える。下の「REPLACE」）"), []);
  assert.deepStrictEqual(findInBody("<p>ok</p>\n<!-- 〔コメント〕 -->\n<p>〔残り〕</p>", /[〔〕]/g), [3]);
  assert.ok(!stripComments("a<!-- b -->c").includes("b"));
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01);
});

test("showcase-check tts: 〔 〕の残った台本・鍵なしは NG、埋めた台本と鍵ありは OK", { skip }, () => {
  const d = tmpDir("check-tts");
  const nd = path.join(d, "intro", "narration");
  fs.mkdirSync(nd, { recursive: true });
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ intro: { narrationDir: "intro/narration" }, credit: { display: "見本工房", kana: "みほんこうぼう" } }));
  const example = fs.readFileSync(path.join(SKILL, "templates", "narration.script.example.json"), "utf8");
  fs.writeFileSync(path.join(nd, "narration.script.json"), example);
  const cred = path.join(d, "credentials.env");
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none.env") });
  const ng = runTs("showcase-check.ts", ["tts", "--config", cfg], env);
  assert.strictEqual(ng.status, 1, ng.out);
  assert.match(ng.out, /〔 〕の仮の原稿/);
  assert.match(ng.out, /ElevenLabs のキー/);
  const filled = JSON.parse(example);
  filled.items = filled.items.map((it) => ({ ...it, text: it.id === "s6-name" ? "よやくる。せいさく、{{credit}}。" : "見本の文です。" }));
  fs.writeFileSync(path.join(nd, "narration.script.json"), JSON.stringify(filled));
  fs.writeFileSync(cred, `ELEVENLABS_API_KEY=${DUMMY_ELEVEN}\n`);
  const ok = runTs("showcase-check.ts", ["tts", "--config", cfg], env);
  assert.strictEqual(ok.status, 0, ok.out);
  assert.ok(!ok.out.includes(DUMMY_ELEVEN), "鍵の値を出さない");
});

// ---------- 配布物の決まりごと ----------

test("配布物: 講師・会社の名前と、外した機能（Drive・サイト掲載・カード版）が残っていない", () => {
  const banned = [/ちーけん/, /K-LifeInnovation/i, /菊池/, /ダイさん/, /ぱるぷんて/, /\bgws\b/, /Google ドライブ|Google Drive/i, /mode[=:]\s*"?card/];
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.(md|ts|mjs|js|json|html|css|txt)$/.test(e.name)) {
        const t = fs.readFileSync(p, "utf8");
        for (const re of banned) if (re.test(t)) hits.push(`${path.relative(SKILL, p)}: ${re}`);
      }
    }
  };
  walk(SKILL);
  assert.deepStrictEqual(hits, []);
  const skill = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  assert.ok(skill.includes("事業サイトへの掲載などは、このスキルを自分で改良すれば足せます"));
  assert.ok(!/30\s*〜\s*90/.test(skill), "紹介動画の長さの数字を書かない");
});

// ---------- ffmpeg の置き場（PATH が古いままでも見つける） ----------

const loadFfpath = () => import(pathToFileURL(path.join(SCRIPTS, "lib", "ffpath.mjs")).href);
function fakeBin(dir, names) {
  fs.mkdirSync(dir, { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(dir, n), "");
  return dir;
}

test("ffpath: Windows は PATH に無くても WinGet の Packages（Gyan.FFmpeg*/ffmpeg-*/bin）で見つけ、Path の先頭に足す", async () => {
  const { ensureFfmpegOnPath } = await loadFfpath();
  const local = tmpDir("ffpath-win");
  const bin = fakeBin(path.join(local, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-8.0-full_build", "bin"), ["ffmpeg.exe", "ffprobe.exe"]);
  const env = { LOCALAPPDATA: local, Path: "C:\\Windows\\system32" };
  const r = ensureFfmpegOnPath({ env, platform: "win32" });
  assert.deepStrictEqual(r, { status: "added", dir: bin });
  assert.strictEqual(env.Path, `${bin};C:\\Windows\\system32`, "区切りは ; ・先頭に足す");
  assert.ok(!("PATH" in env), "Windows の Path の名前をそのまま使う（PATH を別に作らない）");
  // 2 回目はもう PATH にあるので何もしない
  const again = ensureFfmpegOnPath({ env, platform: "win32" });
  assert.strictEqual(again.status, "on-path");
  assert.strictEqual(env.Path, `${bin};C:\\Windows\\system32`);
});

test("ffpath: Windows は WinGet の Links を先に見る・ffprobe が無いフォルダは使わない", async () => {
  const { ensureFfmpegOnPath } = await loadFfpath();
  const local = tmpDir("ffpath-links");
  const links = fakeBin(path.join(local, "Microsoft", "WinGet", "Links"), ["ffmpeg.exe", "ffprobe.exe"]);
  fakeBin(path.join(local, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_x", "ffmpeg-8.0-full_build", "bin"), ["ffmpeg.exe", "ffprobe.exe"]);
  const env = { LOCALAPPDATA: local, PATH: "" };
  assert.deepStrictEqual(ensureFfmpegOnPath({ env, platform: "win32" }), { status: "added", dir: links });
  assert.strictEqual(env.PATH, links);

  const local2 = tmpDir("ffpath-half");
  fakeBin(path.join(local2, "Microsoft", "WinGet", "Links"), ["ffmpeg.exe"]);
  const env2 = { LOCALAPPDATA: local2, Path: "C:\\x" };
  assert.deepStrictEqual(ensureFfmpegOnPath({ env: env2, platform: "win32" }), { status: "missing", dir: null });
  assert.strictEqual(env2.Path, "C:\\x", "見つからなければ PATH を変えない");
});

test("ffpath: すでに PATH にあれば何もしない・どこにも無ければ missing", async () => {
  const { ensureFfmpegOnPath } = await loadFfpath();
  const bin = fakeBin(path.join(tmpDir("ffpath-on"), "bin"), ["ffmpeg", "ffprobe"]);
  const before = `/nowhere:${bin}:/usr/bin`;
  const env = { PATH: before };
  assert.deepStrictEqual(ensureFfmpegOnPath({ env, platform: "darwin" }), { status: "on-path", dir: bin });
  assert.strictEqual(env.PATH, before, "PATH を 1 字も変えない");

  const empty = tmpDir("ffpath-none");
  const env2 = { LOCALAPPDATA: empty, Path: "" };
  assert.deepStrictEqual(ensureFfmpegOnPath({ env: env2, platform: "win32" }), { status: "missing", dir: null });
  assert.strictEqual(env2.Path, "");
  const env3 = { Path: "C:\\x" }; // LOCALAPPDATA が無い
  assert.strictEqual(ensureFfmpegOnPath({ env: env3, platform: "win32" }).status, "missing");
});

test("ffpath: 足した PATH は子プロセスにも効く（偽の ffmpeg が起動できる）", { skip: process.platform === "win32" ? "Mac / Linux で確かめる" : false }, async () => {
  const { ensureFfmpegOnPath } = await loadFfpath();
  const local = tmpDir("ffpath-child");
  const bin = fakeBin(path.join(local, "Microsoft", "WinGet", "Links"), []);
  for (const n of ["ffmpeg.exe", "ffprobe.exe"]) {
    fs.writeFileSync(path.join(bin, n), "#!/bin/sh\necho fake-ffmpeg-ok\n");
    fs.chmodSync(path.join(bin, n), 0o755);
  }
  // Windows の分岐で置き場を見つけて足し、その PATH を子プロセスに渡す（名前は .exe なので .exe で呼ぶ）
  const env = { LOCALAPPDATA: local, PATH: "/usr/bin:/bin" };
  // win32 の区切りは ; なので、子プロセス用には足したフォルダを : で前に付け直して確かめる
  const r0 = ensureFfmpegOnPath({ env, platform: "win32" });
  assert.strictEqual(r0.status, "added");
  const r = spawnSync("ffmpeg.exe", [], { encoding: "utf8", env: { PATH: `${r0.dir}:/usr/bin:/bin` } });
  assert.strictEqual(r.stdout.trim(), "fake-ffmpeg-ok");
});

test("ffpath: Bash と PowerShell の「頭に付ける 1 行」・record.mjs も同じ置き場を探す", async () => {
  const { pathPrefixLines, candidateDirs } = await loadFfpath();
  assert.deepStrictEqual(pathPrefixLines("/opt/homebrew/bin", "darwin"), { bash: 'export PATH="/opt/homebrew/bin:$PATH";' });
  assert.deepStrictEqual(pathPrefixLines("C:\\Users\\taro\\AppData\\Local\\Microsoft\\WinGet\\Links", "win32"), {
    bash: 'export PATH="/c/Users/taro/AppData/Local/Microsoft/WinGet/Links:$PATH";',
    powershell: '$env:Path = "C:\\Users\\taro\\AppData\\Local\\Microsoft\\WinGet\\Links;" + $env:Path;',
  });
  assert.deepStrictEqual(candidateDirs({ env: {}, platform: "darwin" }), ["/opt/homebrew/bin", "/usr/local/bin"]);
  const record = fs.readFileSync(path.join(SKILL, "templates", "capture", "record.mjs"), "utf8");
  for (const s of ['"/opt/homebrew/bin", "/usr/local/bin"', '"Microsoft", "WinGet"', '"Links"', '"Gyan.FFmpeg"', '"ffmpeg-"', "ensureFfmpegOnPath();"]) assert.ok(record.includes(s), `record.mjs: ${s}`);
});

test("ffpath: ffmpeg を使う道具は置き場を探す・案内に「アプリを再起動」が残っていない", () => {
  for (const f of ["eleven-tts.ts", "transcribe.ts", "showcase-check.ts", "deps.mjs"]) {
    const t = fs.readFileSync(path.join(SCRIPTS, f), "utf8");
    assert.ok(t.includes('from "./lib/ffpath.mjs"'), f);
    assert.ok(/ensureFfmpegOnPath\(\)/.test(t), f);
  }
  const deps = fs.readFileSync(path.join(SCRIPTS, "deps.mjs"), "utf8");
  assert.ok(!deps.includes("アプリを再起動"));
  assert.ok(deps.includes("同じ会話のまま「入れました」と送る（アプリを開き直さない）"));
  const skill = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  assert.ok(!skill.includes("入れたらアプリを再起動"));
  const desc = /^description: (.*)$/m.exec(skill)[1];
  assert.ok(desc.length < 1024, `description は 1024 文字未満（今 ${desc.length}）`);
  for (const w of ["このアプリの紹介動画を作って", "showcase-video で", "紹介動画スキルで", "torisetsu"]) assert.ok(desc.includes(w), w);
});
