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

const KEY_VARS = ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "OPENAI_API_KEY", "SHOWCASE_CREDENTIALS_FILE", "SHOWCASE_PROFILE_FILE", "SHOWCASE_IMAGE_STUDIO_ENV", "SHOWCASE_GEMINI_API_BASE"];

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

test("どのスキルの description も、厳しい YAML の読み方で壊れない（Windows で説明が空になった対策）", () => {
  const skillsDir = path.join(ROOT, "plugins", "school-starter", "skills");
  for (const name of fs.readdirSync(skillsDir)) {
    const file = path.join(skillsDir, name, "SKILL.md");
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("description:"));
    assert.ok(line, `${name}: description がない`);
    const value = line.slice("description:".length).trim();
    if (value.startsWith('"')) {
      assert.doesNotThrow(() => JSON.parse(value), `${name}: 引用符の中が壊れている`);
    } else {
      assert.ok(!/: | #/.test(value), `${name}: 引用符なしの description に「: 」か「 #」がある（引用符で囲む）`);
    }
  }
});

// ---------- Gemini の声（ネットに出ない範囲。API はにせの fetch で差し替える） ----------

const DUMMY_GEMINI = "AIza" + "d".repeat(35);
const GEMINI_SCRIPT = path.join(SKILL, "templates", "narration.script.gemini.example.json");
function filledGeminiScript(dir) {
  const s = JSON.parse(fs.readFileSync(GEMINI_SCRIPT, "utf8"));
  s.items = s.items.map((it) => ({ ...it, text: it.id === "s6-name" ? "よやくる。せいさく、{{credit}}。" : "見本の文です。" }));
  const f = path.join(dir, "narration.script.json");
  fs.writeFileSync(f, JSON.stringify(s));
  return f;
}

test("keys: GEMINI_API_KEY は 環境変数 → 共通の置き場 の順・image-studio は見ない・AIza… を伏せる", { skip }, async () => {
  const { findKey, keyShape, redactKeys } = await load("lib/keys.ts");
  const d = tmpDir("keys-gemini");
  const cred = path.join(d, "credentials.env");
  const studio = path.join(d, "studio.env");
  fs.writeFileSync(studio, `GEMINI_API_KEY=${DUMMY_GEMINI}\n`);
  await withCleanEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_IMAGE_STUDIO_ENV: studio }, () => {
    assert.strictEqual(findKey("GEMINI_API_KEY"), null, "image-studio の Gemini は使わない");
    fs.writeFileSync(cred, `ELEVENLABS_API_KEY=${DUMMY_ELEVEN}\nGEMINI_API_KEY=${DUMMY_GEMINI}\n`);
    assert.strictEqual(findKey("GEMINI_API_KEY")?.source, "共通の置き場");
    assert.strictEqual(findKey("GEMINI_API_KEY")?.value, DUMMY_GEMINI);
    process.env.GEMINI_API_KEY = DUMMY_GEMINI + "x";
    assert.strictEqual(findKey("GEMINI_API_KEY")?.source, "環境変数");
  });
  assert.strictEqual(keyShape("GEMINI_API_KEY", DUMMY_GEMINI), "ok");
  assert.strictEqual(keyShape("GEMINI_API_KEY", "short"), "bad-char");
  assert.ok(!redactKeys(`x ${DUMMY_GEMINI} y`).includes(DUMMY_GEMINI));
});

test("save-key: gemini は GEMINI_API_KEY に保存・端末でなければ保存せずに止まる", { skip }, async () => {
  const { TARGETS, saveKey } = await load("save-key.ts");
  const { findKey } = await load("lib/keys.ts");
  assert.strictEqual(TARGETS.gemini.name, "GEMINI_API_KEY");
  assert.match(TARGETS.gemini.where, /AI Studio/);
  const d = tmpDir("save-gemini");
  const file = path.join(d, "credentials.env");
  saveKey("ELEVENLABS_API_KEY", DUMMY_ELEVEN, file);
  saveKey("GEMINI_API_KEY", DUMMY_GEMINI, file);
  await withCleanEnv({ SHOWCASE_CREDENTIALS_FILE: file }, () => {
    assert.strictEqual(findKey("GEMINI_API_KEY")?.value, DUMMY_GEMINI);
    assert.strictEqual(findKey("ELEVENLABS_API_KEY")?.value, DUMMY_ELEVEN, "ほかのキーの行は残る");
  });
  const file2 = path.join(d, "notty.env");
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, "save-key.ts"), "gemini"], {
    encoding: "utf8",
    input: `${DUMMY_GEMINI}\n`,
    env: childEnv({ SHOWCASE_CREDENTIALS_FILE: file2 }),
    timeout: 30000,
  });
  assert.notStrictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(file2), "保存していない");
  assert.ok(!`${r.stdout}${r.stderr}`.includes(DUMMY_GEMINI), "キーを画面に出さない");
});

test("設定のひな形: 声の種類の既定は gemini・既定の声は ja-jp-advisor-3（台本のひな形と同じ）", { skip }, async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", "showcase.config.example.json"), "utf8"));
  const { DEFAULT_GEMINI } = await load("gemini-tts.ts");
  assert.strictEqual(cfg.tts.provider, "gemini");
  assert.strictEqual(cfg.tts.voice, DEFAULT_GEMINI.voice);
  assert.strictEqual(cfg.tts.model, DEFAULT_GEMINI.model);
  assert.strictEqual(DEFAULT_GEMINI.voice, "ja-jp-advisor-3");
  const s = JSON.parse(fs.readFileSync(GEMINI_SCRIPT, "utf8"));
  assert.strictEqual(s.provider, "gemini");
  assert.strictEqual(s.voice, cfg.tts.voice);
  assert.strictEqual(s.model, cfg.tts.model);
});

test("gemini-tts: 台本の〔 〕・ElevenLabs の台本は 1 回も呼ばずに止まる・{{credit}} を読みに置き換える", { skip }, async () => {
  const { jobsFromScript, UsageError, cacheKey } = await load("gemini-tts.ts");
  const d = tmpDir("gemini-jobs");
  assert.throws(() => jobsFromScript(GEMINI_SCRIPT, "みほん"), UsageError, "〔 〕の仮の原稿");
  assert.throws(() => jobsFromScript(path.join(SKILL, "templates", "narration.script.example.json"), "みほん"), /Gemini 用ではありません/);
  const f = filledGeminiScript(d);
  const { jobs, outDir } = jobsFromScript(f, "みほんこうぼう");
  assert.strictEqual(jobs.length, 6);
  assert.strictEqual(outDir, d);
  assert.strictEqual(jobs[5].text, "よやくる。せいさく、みほんこうぼう。");
  assert.strictEqual(jobs[0].out, path.join(d, "s1-hook.wav"), "置き場と名前は eleven-tts.ts と同じ <outDir>/<id>.wav");
  assert.strictEqual(jobs[0].spec.voice, "ja-jp-advisor-3");
  assert.throws(() => jobsFromScript(f, null), UsageError, "{{credit}} があるのに読みが無い");
  const other = { ...jobs[0], spec: { ...jobs[0].spec, voice: "ja-jp-tutor-9" } };
  assert.notStrictEqual(cacheKey(jobs[0]), cacheKey(other), "声が変われば作り直す");
});

test("gemini-tts --dry-run: キーなしでも本数・文字数・見込みを出し、無料枠の注意を出す（API は呼ばない）", { skip }, () => {
  const d = tmpDir("gemini-dry");
  const f = filledGeminiScript(d);
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ credit: { display: "見本工房", kana: "みほんこうぼう" } }));
  // 呼んだら必ず失敗する宛先にしておく（dry-run は呼ばないので関係ない）
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: path.join(d, "none.env"), SHOWCASE_GEMINI_API_BASE: "http://127.0.0.1:9" });
  const r = runTs("gemini-tts.ts", ["--script", f, "--config", cfg, "--dry-run"], env);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /生成 6 本（呼び出し 6 回/);
  assert.match(r.out, /送る文字数 \d+/);
  assert.match(r.out, /見込みの長さ/);
  assert.match(r.out, /品質改善/);
  assert.ok(!fs.existsSync(path.join(d, "s1-hook.wav")), "何も作らない");
});

test("gemini-tts: キーが無ければ呼ぶ前に止まる（終了コード 5・保存の案内）", { skip }, () => {
  const d = tmpDir("gemini-nokey");
  const f = filledGeminiScript(d);
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ credit: { display: "見本工房", kana: "みほんこうぼう" } }));
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: path.join(d, "none.env"), SHOWCASE_GEMINI_API_BASE: "http://127.0.0.1:9" });
  const r = runTs("gemini-tts.ts", ["--script", f, "--config", cfg], env);
  assert.strictEqual(r.status, 5, r.out);
  assert.match(r.out, /Gemini のキーがありません/);
  assert.match(r.out, /save-key|保存用コマンド/);
});

test("gemini-tts: 429 の分け方（1 日の上限は待たずに止めて 2 択・分単位は短く待つ・長い Retry-After は信じない）", { skip }, async () => {
  const { decideFailure, MAX_WAIT_MS, MAX_RETRIES } = await load("gemini-tts.ts");
  const daily = decideFailure(429, '{"error":{"message":"Quota exceeded for metric: generate_requests_per_day"}}', null, 1);
  assert.strictEqual(daily.kind, "stop-premise");
  assert.match(daily.message, /明日もう一度/);
  assert.match(daily.message, /Starter/);
  const perDayId = decideFailure(429, '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel"}]}]}}', null, 1);
  assert.strictEqual(perDayId.kind, "stop-premise");
  assert.deepStrictEqual(decideFailure(429, "Resource exhausted per minute", "5", 1), { kind: "retry", waitMs: 5000 });
  assert.strictEqual(decideFailure(429, "Resource exhausted", "82360", 1).kind, "stop-premise", "翌日を指す Retry-After は待たない");
  const noHeader = decideFailure(429, "Resource exhausted", null, 2);
  assert.strictEqual(noHeader.kind, "retry");
  assert.ok(noHeader.waitMs <= MAX_WAIT_MS);
  assert.strictEqual(decideFailure(429, "Resource exhausted", null, MAX_RETRIES + 1).kind, "stop-premise", "分単位でも続いたら止める");
  const zero = decideFailure(429, "Quota exceeded ... limit: 0, model: gemini-3.8-flash-tts", null, 1);
  assert.strictEqual(zero.kind, "stop-premise");
  assert.match(zero.message, /無料枠/);
  assert.strictEqual(decideFailure(400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}', null, 1).kind, "stop-premise");
  assert.strictEqual(decideFailure(403, "PERMISSION_DENIED", null, 1).kind, "stop-premise");
  assert.strictEqual(decideFailure(503, "unavailable", null, 1).kind, "retry");
  assert.strictEqual(decideFailure(503, "unavailable", null, MAX_RETRIES + 1).kind, "fail");
  assert.strictEqual(decideFailure(400, "bad request", null, 1).kind, "fail");
});

/** にせの fetch。返事を順に返し、呼ばれた回数と送った見出しを覚える */
function fakeFetch(responses) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(r.body, { status: r.status, headers: r.headers ?? {} });
  };
  return { f, calls };
}
function silentWav(seconds = 0.5, rate = 24000) {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(n * 2, 40);
  return b;
}

test("gemini-tts: requestSpeech は分単位の 429 を短く待って取り直し、1 日の上限では 1 回で止まる（キーはヘッダだけ）", { skip }, async () => {
  const { requestSpeech, GeminiStop, MIN_INTERVAL_MS, extractAudio, parseWav } = await load("gemini-tts.ts");
  const ok = { status: 200, body: JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "audio", data: silentWav().toString("base64") }] }] }) };
  let clock = 1000;
  const sleeps = [];
  const deps = (f) => ({ fetch: f, sleep: async (ms) => { sleeps.push(ms); clock += ms; }, now: () => clock, log: () => {} });

  const a = fakeFetch([{ status: 429, body: "per minute", headers: { "retry-after": "3" } }, ok]);
  const resp = await requestSpeech({ base: "https://example.invalid/v1beta", key: DUMMY_GEMINI, body: { x: 1 }, timeoutMs: 1000, state: { lastCallAt: 0 } }, deps(a.f));
  assert.strictEqual(a.calls.length, 2);
  assert.ok(sleeps.includes(3000), `Retry-After の 3 秒だけ待つ: ${sleeps}`);
  assert.strictEqual(a.calls[0].url, "https://example.invalid/v1beta/interactions");
  assert.strictEqual(a.calls[0].init.headers["x-goog-api-key"], DUMMY_GEMINI);
  assert.ok(!a.calls[0].url.includes(DUMMY_GEMINI), "URL にキーを入れない");
  const info = parseWav(extractAudio(resp));
  assert.strictEqual(info.sampleRate, 24000);
  assert.ok(Math.abs(info.seconds - 0.5) < 0.001);

  sleeps.length = 0;
  const b = fakeFetch([{ status: 429, body: '{"error":{"message":"Quota exceeded: requests per day"}}', headers: { "retry-after": "82360" } }, ok]);
  await assert.rejects(
    requestSpeech({ base: "https://example.invalid/v1beta", key: DUMMY_GEMINI, body: {}, timeoutMs: 1000, state: { lastCallAt: 0 } }, deps(b.f)),
    (e) => e instanceof GeminiStop && /明日もう一度/.test(e.message) && !e.message.includes(DUMMY_GEMINI),
  );
  assert.strictEqual(b.calls.length, 1, "1 日の上限では取り直さない");
  assert.deepStrictEqual(sleeps, [], "長く待たない");

  // 続けて呼ぶときは 6.5 秒あける
  sleeps.length = 0;
  const state = { lastCallAt: 0 };
  const c = fakeFetch([ok]);
  await requestSpeech({ base: "https://example.invalid/v1beta", key: DUMMY_GEMINI, body: {}, timeoutMs: 1000, state }, deps(c.f));
  await requestSpeech({ base: "https://example.invalid/v1beta", key: DUMMY_GEMINI, body: {}, timeoutMs: 1000, state }, deps(c.f));
  assert.deepStrictEqual(sleeps, [MIN_INTERVAL_MS]);
  assert.throws(() => extractAudio({ steps: [{ type: "model_output", content: [{ type: "text" }] }] }), /音声がありません/);
});

test("voice-choice: 選んだ声の種類を設定の tts と控えに書き、制作クレジットの控えを消さない", { skip }, async () => {
  const { applyChoice, PRESETS } = await load("voice-choice.ts");
  const out = applyChoice({ project: { name: "x" }, tts: { $comment: "c", provider: "gemini", voice: "v", model: "m" } }, "elevenlabs");
  assert.deepStrictEqual(out.tts, { $comment: "c", provider: "elevenlabs", voice: "EHMH9cyd1z3rXm4z0Jja", model: "eleven_v4" });
  assert.deepStrictEqual(out.project, { name: "x" });
  assert.strictEqual(PRESETS.gemini.voice, "ja-jp-advisor-3");

  const d = tmpDir("voice-choice");
  const cfg = path.join(d, "showcase.config.json");
  fs.copyFileSync(path.join(SKILL, "templates", "showcase.config.example.json"), cfg);
  const profile = path.join(d, "profile.json");
  const env = childEnv({ SHOWCASE_PROFILE_FILE: profile });
  assert.match(runTs("voice-choice.ts", ["show"], env).out, /まだありません/);
  const credit = runTs("credit.ts", ["save", "--config", cfg, "--org", "見本工房", "--org-kana", "みほんこうぼう"], env);
  assert.strictEqual(credit.status, 0, credit.out);
  const r = runTs("voice-choice.ts", ["save", "--config", cfg, "--provider", "elevenlabs"], env);
  assert.strictEqual(r.status, 0, r.out);
  assert.match(r.out, /save-key\.ts elevenlabs/);
  const saved = JSON.parse(fs.readFileSync(cfg, "utf8"));
  assert.strictEqual(saved.tts.provider, "elevenlabs");
  assert.strictEqual(saved.credit.display, "見本工房", "設定のほかの項目は残る");
  const p = JSON.parse(fs.readFileSync(profile, "utf8"));
  assert.strictEqual(p.voiceProvider, "elevenlabs");
  assert.strictEqual(p.org, "見本工房", "制作クレジットの控えを消さない");
  assert.match(runTs("voice-choice.ts", ["show"], env).out, /控え: 声の種類 elevenlabs/);
  // 後から credit を保存し直しても声の控えは残る
  runTs("credit.ts", ["save", "--config", cfg, "--org", "見本工房", "--org-kana", "みほんこうぼう"], env);
  assert.strictEqual(JSON.parse(fs.readFileSync(profile, "utf8")).voiceProvider, "elevenlabs");
  assert.strictEqual(runTs("voice-choice.ts", ["save", "--config", cfg, "--provider", "voicevox"], env).status, 1);
  // 声の控えだけがあるとき、credit.ts show は「まだありません」と言う
  const onlyVoice = path.join(d, "only-voice.json");
  fs.writeFileSync(onlyVoice, JSON.stringify({ voiceProvider: "gemini" }));
  assert.match(runTs("credit.ts", ["show"], childEnv({ SHOWCASE_PROFILE_FILE: onlyVoice })).out, /控えはまだありません/);
});

test("showcase-check tts: 設定が gemini なら Gemini の台本と Gemini のキーを求める（ElevenLabs の台本は NG）", { skip }, () => {
  const d = tmpDir("check-tts-gemini");
  const nd = path.join(d, "intro", "narration");
  fs.mkdirSync(nd, { recursive: true });
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ intro: { narrationDir: "intro/narration" }, credit: { display: "見本工房", kana: "みほんこうぼう" }, tts: { provider: "gemini", voice: "ja-jp-advisor-3", model: "gemini-3.8-flash-tts" } }));
  const cred = path.join(d, "credentials.env");
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none.env") });
  filledGeminiScript(nd);
  fs.writeFileSync(cred, `ELEVENLABS_API_KEY=${DUMMY_ELEVEN}\n`);
  const nokey = runTs("showcase-check.ts", ["tts", "--config", cfg], env);
  assert.strictEqual(nokey.status, 1, nokey.out);
  assert.match(nokey.out, /Gemini のキー/);
  fs.writeFileSync(cred, `GEMINI_API_KEY=${DUMMY_GEMINI}\n`);
  const ok = runTs("showcase-check.ts", ["tts", "--config", cfg], env);
  assert.strictEqual(ok.status, 0, ok.out);
  assert.ok(!ok.out.includes(DUMMY_GEMINI), "鍵の値を出さない");
  const eleven = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", "narration.script.example.json"), "utf8"));
  eleven.items = eleven.items.map((it) => ({ ...it, text: it.id === "s6-name" ? "よやくる。せいさく、{{credit}}。" : "見本の文です。" }));
  fs.writeFileSync(path.join(nd, "narration.script.json"), JSON.stringify(eleven));
  const mixed = runTs("showcase-check.ts", ["tts", "--config", cfg], env);
  assert.strictEqual(mixed.status, 1, mixed.out);
  assert.match(mixed.out, /声の種類（elevenlabs）が設定（tts.provider gemini）と違います/);
});

test("eleven-client: 無料プランで止まったときは「Starter にする／Gemini に切り替える」の 2 択を出す", { skip }, async () => {
  const { classify4xx } = await load("lib/eleven-client.ts");
  for (const [status, body] of [[402, '{"detail":{"status":"free_users_not_allowed"}}'], [403, "forbidden"]]) {
    const m = classify4xx(status, body, "EHMH9cyd1z3rXm4z0Jja").message;
    assert.match(m, /Starter（月 6 ドル）/);
    assert.match(m, /--provider gemini/);
    assert.match(m, /英語なまりなので、日本語の紹介動画には使わない/);
  }
});

test("deps: 声のキーは選んだ声の種類の方だけを見る・まだ選んでいなければ NG にしない", { skip }, () => {
  const d = tmpDir("deps-voice");
  const cred = path.join(d, "credentials.env");
  fs.writeFileSync(cred, `OPENAI_API_KEY=${DUMMY_OPENAI}\nELEVENLABS_API_KEY=${DUMMY_ELEVEN}\n`);
  const profile = path.join(d, "profile.json");
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none.env"), SHOWCASE_PROFILE_FILE: profile });
  const run = () => {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, "deps.mjs")], { encoding: "utf8", env, timeout: 60000 });
    return `${r.stdout}\n${r.stderr}`;
  };
  const none = run();
  assert.ok(!/\[NG\] (Gemini|ElevenLabs) のキー/.test(none), none);
  assert.match(none, /声の種類はまだ選んでいません/);
  fs.writeFileSync(profile, JSON.stringify({ voiceProvider: "gemini" }));
  const gem = run();
  assert.match(gem, /\[NG\] Gemini のキー（声）: なし/);
  assert.ok(!/ElevenLabs のキー/.test(gem), "選ばなかった方は見ない");
  fs.writeFileSync(profile, JSON.stringify({ voiceProvider: "elevenlabs" }));
  assert.match(run(), /\[OK\] ElevenLabs のキー（声）: あり（共通の置き場）/);
  assert.ok(!run().includes(DUMMY_ELEVEN), "鍵の値を出さない");
});

function toneWav(seconds = 1.2, rate = 24000) {
  const b = silentWav(seconds, rate);
  const n = (b.length - 44) / 2;
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 8000), 44 + i * 2);
  return b;
}

test("gemini-tts: にせの API から受けた WAV を、eleven-tts.ts と同じ形（24kHz mono・−16 LUFS 付近・<id>.json）で置く・2 回目は作り直さない", { skip }, async () => {
  const http = await import("node:http");
  const { spawn } = await import("node:child_process");
  let hits = 0;
  let sawKeyHeader = true;
  const server = http.createServer((req, res) => {
    hits++;
    if (req.headers["x-goog-api-key"] !== DUMMY_GEMINI || req.url.includes("key=")) sawKeyHeader = false;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "audio", data: toneWav().toString("base64") }] }], usage: { total_output_tokens: 40 } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const d = tmpDir("gemini-e2e");
  const s = JSON.parse(fs.readFileSync(GEMINI_SCRIPT, "utf8"));
  s.items = [{ id: "s1-hook", text: "見本の文です。" }];
  const f = path.join(d, "narration.script.json");
  fs.writeFileSync(f, JSON.stringify(s));
  const cred = path.join(d, "credentials.env");
  fs.writeFileSync(cred, `GEMINI_API_KEY=${DUMMY_GEMINI}\n`);
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_GEMINI_API_BASE: `http://127.0.0.1:${port}/v1beta` });
  const run = () =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(SCRIPTS, "gemini-tts.ts"), "--script", f], { env });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (out += c));
      p.on("close", (code) => resolve({ status: code, out }));
    });
  try {
    const r = await run();
    assert.strictEqual(r.status, 0, r.out);
    assert.ok(!r.out.includes(DUMMY_GEMINI), "鍵の値を出さない");
    const meta = JSON.parse(fs.readFileSync(path.join(d, "s1-hook.json"), "utf8"));
    assert.strictEqual(meta.provider, "gemini");
    assert.strictEqual(meta.outputSampleRate, 24000);
    assert.strictEqual(meta.channels, 1);
    assert.strictEqual(typeof meta.effectiveSeconds, "number");
    assert.ok(Math.abs(meta.seconds - 1.2) < 0.05, `長さ ${meta.seconds}`);
    assert.ok(meta.truePeakDb <= -1, `true peak ${meta.truePeakDb}`);
    const head = fs.readFileSync(path.join(d, "s1-hook.wav")).subarray(0, 44);
    assert.strictEqual(head.readUInt32LE(24), 24000);
    assert.strictEqual(head.readUInt16LE(22), 1);
    assert.ok(sawKeyHeader, "キーは x-goog-api-key のヘッダで渡し、URL に入れない");
    assert.strictEqual(hits, 1);
    const again = await run();
    assert.strictEqual(again.status, 0, again.out);
    assert.match(again.out, /作成済み/);
    assert.strictEqual(hits, 1, "同じ原稿・同じ声なら呼ばない");
  } finally {
    server.close();
  }
});

test("gemini-tts: ffmpeg の置き場を探す（PATH が古いままでも動く）", () => {
  const t = fs.readFileSync(path.join(SCRIPTS, "gemini-tts.ts"), "utf8");
  assert.ok(t.includes('from "./lib/ffpath.mjs"'));
  assert.ok(/ensureFfmpegOnPath\(\)/.test(t));
});
