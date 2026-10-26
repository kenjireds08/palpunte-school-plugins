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

const KEY_VARS = ["GEMINI_API_KEY", "ELEVENLABS_API_KEY", "OPENAI_API_KEY", "SHOWCASE_CREDENTIALS_FILE", "SHOWCASE_PROFILE_FILE", "SHOWCASE_IMAGE_STUDIO_ENV", "SHOWCASE_GEMINI_API_BASE", "SHOWCASE_DESKTOP_DIR", "SHOWCASE_VOICE_SAMPLES_DIR"];

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

/** 台本のひな形の〔 〕を埋める原稿。締めは名前と制作の 2 本（あいだに間をあけるため） */
const FILL = { "s6-name": "よやくる。", "s6-credit": "せいさく、{{credit}}。" };

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
  const filled = { ...example, items: example.items.map((it) => ({ ...it, text: FILL[it.id] ?? "見本の文です。" })) };
  const ok = path.join(d, "ok.script.json");
  fs.writeFileSync(ok, JSON.stringify(filled));
  const { jobs } = jobsFromScript(ok, "みほんこうぼう");
  assert.strictEqual(jobs.length, 7, "ひな形は 7 本（締めが名前と制作の 2 本）");
  assert.strictEqual(jobs[5].text, "よやくる。");
  assert.strictEqual(jobs[6].text, "せいさく、みほんこうぼう。");
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
  filled.items = filled.items.map((it) => ({ ...it, text: FILL[it.id] ?? "見本の文です。" }));
  fs.writeFileSync(path.join(nd, "narration.script.json"), JSON.stringify(filled));
  fs.writeFileSync(cred, `ELEVENLABS_API_KEY=${DUMMY_ELEVEN}\n`);
  const ok = runTs("showcase-check.ts", ["tts", "--config", cfg], env);
  assert.strictEqual(ok.status, 0, ok.out);
  assert.ok(!ok.out.includes(DUMMY_ELEVEN), "鍵の値を出さない");
});

// ---------- 締めの間（アプリの名前と「せいさく、〇〇」のあいだ） ----------

test("締めの間: 台本のひな形は 2 つとも、名前（s6-name）と制作（s6-credit）を別の声にする", { skip }, async () => {
  const { creditItemProblems } = await load("showcase-check.ts");
  for (const name of ["narration.script.example.json", "narration.script.gemini.example.json"]) {
    const s = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", name), "utf8"));
    const ids = s.items.map((it) => it.id);
    assert.deepStrictEqual(ids.slice(-2), ["s6-name", "s6-credit"], `${name}: 締めは名前 → 制作の順で最後の 2 本`);
    const name6 = s.items.find((it) => it.id === "s6-name");
    const credit6 = s.items.find((it) => it.id === "s6-credit");
    assert.ok(!name6.text.includes("{{credit}}") && !name6.text.includes("せいさく"), `${name}: 名前の声に制作を入れない`);
    assert.strictEqual(credit6.text, "せいさく、{{credit}}。", `${name}: 制作の声は「せいさく、{{credit}}。」だけ`);
    assert.deepStrictEqual(creditItemProblems(s.items), [], `${name}: ひな形は検査に通る`);
  }
});

test("締めの間: creditItemProblems は {{credit}} を名前と同じ声に入れた台本を止める", { skip }, async () => {
  const { creditItemProblems } = await load("showcase-check.ts");
  assert.deepStrictEqual(creditItemProblems([{ id: "s6-credit", text: "せいさく、{{credit}}。" }]), []);
  assert.deepStrictEqual(creditItemProblems([{ id: "s6-credit", text: "せいさく {{credit}}" }]), [], "読点なしでもよい");
  assert.deepStrictEqual(creditItemProblems([{ id: "s1-hook", text: "見本の文です。" }, null, { id: "x" }]), [], "{{credit}} の無い場面は見ない");
  const joined = creditItemProblems([{ id: "s6-name", text: "よやくる。せいさく、{{credit}}。" }]);
  assert.strictEqual(joined.length, 1);
  assert.match(joined[0], /^s6-name: /);
  assert.match(joined[0], /s6-credit「せいさく、\{\{credit\}\}。」/);
  assert.match(joined[0], /0\.6〜0\.8 秒/);
  assert.strictEqual(creditItemProblems([{ id: "a", text: "{{credit}}。" }]).length, 1, "「せいさく」が無い");
  assert.strictEqual(creditItemProblems([{ id: "a", text: "ちーけんぱーそなるじむ、せいさく、{{credit}}。" }]).length, 1, "名前のあとに読点でつないでも止める");
});

test("締めの間: creditGap は名前の話し終わりから「せいさく」の話し始めまでを測り、0.6〜0.8 秒の外なら入れる値を出す", { skip }, async () => {
  const { creditGap, CREDIT_GAP } = await load("showcase-check.ts");
  assert.deepStrictEqual(CREDIT_GAP, { min: 0.6, max: 0.8, target: 0.7 });
  const s5 = { key: "s5", start: 29.7, effective: 4.5, speechStart: 0, text: "特長です。" };
  const s6 = { key: "s6", start: 35, effective: 1.5, speechStart: 0.05, text: "よやくる。" };
  const ok = creditGap([{ key: "s6b", start: 37.1, effective: 3, speechStart: 0.1, text: "せいさく、みほんこうぼう。" }, s5, s6]);
  assert.strictEqual(ok.kind, "gap");
  assert.strictEqual(ok.prevKey, "s6", "並び順は data-start で決める");
  assert.strictEqual(ok.gap, 0.7, "37.1 + 0.1 − (35 + 1.5)");
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.creditAt, 37.2, "CREDIT_AT = 制作の声の data-start ＋ 話し始め");
  for (const [start, want] of [
    [36.6, false],
    [37.0, true],
    [37.2, true],
    [37.3, false],
  ]) {
    const r = creditGap([s5, s6, { key: "s6b", start, effective: 3, speechStart: 0.1, text: "せいさく、みほん。" }]);
    assert.strictEqual(r.ok, want, `data-start ${start} → 間 ${r.gap}`);
    assert.strictEqual(r.suggestedStart, 37.1, "直すなら 35 + 1.5 + 0.7 − 0.1");
  }
  assert.deepStrictEqual(creditGap([s5, { ...s6, text: "よやくる。せいさく、みほんこうぼう。" }]), { kind: "joined", key: "s6" });
  assert.deepStrictEqual(creditGap([s5, s6]), { kind: "none" }, "制作の声が無ければ測らない");
  assert.deepStrictEqual(creditGap([{ ...s5, text: null }, { ...s6, text: null }]), { kind: "none" }, "記録に原稿が無ければ測らない");
  assert.deepStrictEqual(creditGap([{ key: "s6b", start: 0.3, effective: 2, speechStart: 0, text: "せいさく、みほん。" }, s6]), { kind: "first", key: "s6b" });
});

test("締めの間: 紹介動画のテンプレートは制作の声 vo-s6b を名前の声 vo-s6 の 0.6〜0.8 秒後に置き、CREDIT_AT をその時刻にする", { skip }, async () => {
  const { tagsOf, CREDIT_GAP } = await load("showcase-check.ts");
  const html = fs.readFileSync(path.join(SKILL, "templates", "intro", "index.html"), "utf8");
  const audio = new Map(tagsOf(html, "audio").map((t) => [t.get("id"), t]));
  const v6 = audio.get("vo-s6");
  const v6b = audio.get("vo-s6b");
  assert.ok(v6 && v6b, "vo-s6 と vo-s6b");
  assert.strictEqual(v6.get("src"), "assets/audio/s6-name.wav");
  assert.strictEqual(v6b.get("src"), "assets/audio/s6-credit.wav");
  const gap = Number(v6b.get("data-start")) - (Number(v6.get("data-start")) + Number(v6.get("data-duration")));
  assert.ok(gap >= CREDIT_GAP.min - 1e-9 && gap <= CREDIT_GAP.max + 1e-9, `間 ${gap.toFixed(2)} 秒`);
  const t6 = Number(/const T = \{[^}]*\bs6: ([\d.]+)/.exec(html)?.[1]);
  const at = Number(/const CREDIT_AT = L0 \+ ([\d.]+);/.exec(html)?.[1]);
  assert.ok(Number.isFinite(t6) && Number.isFinite(at), "T.s6 と CREDIT_AT を読める");
  assert.ok(Math.abs(t6 + at - Number(v6b.get("data-start"))) < 1e-9, "CREDIT_AT は制作の声の始まり");
  const root = tagsOf(html, "div").find((t) => t.get("id") === "root");
  assert.ok(Number(v6b.get("data-start")) + Number(v6b.get("data-duration")) <= Number(root.get("data-duration")), "制作の声が動画の長さに収まる");
});

/** テンプレートと同じ形の S6 の時刻（L0 = 34.6・CREDIT_AT = 37.2） */
const S6_JS = "const T = { s5: 29.4, s6: 34.6, end: 42.0 };\nconst L0 = T.s6;\n// REPLACE: 制作クレジットが出る時刻\nconst CREDIT_AT = L0 + 2.6;";

function timingFixture(name, clips, js = S6_JS) {
  const d = tmpDir(name);
  const meta = path.join(d, "narration");
  fs.mkdirSync(meta);
  const audio = clips
    .map((c) => `<audio id="vo-${c.key}" src="assets/audio/${c.file}.wav" data-start="${c.start}" data-duration="${c.effective}" data-track-index="10"></audio>`)
    .join("\n");
  const html = path.join(d, "index.html");
  fs.writeFileSync(html, `<div id="root" data-duration="42">\n${audio}\n</div>\n<script>\n${js}\n</script>\n`);
  for (const c of clips) {
    fs.writeFileSync(path.join(meta, `${c.file}.wav`), silentWav(c.effective + 0.2));
    fs.writeFileSync(path.join(meta, `${c.file}.json`), JSON.stringify({ seconds: c.effective + 0.2, effectiveSeconds: c.effective, speechStart: c.speechStart, text: c.text }));
  }
  return { html, meta };
}

test("showcase-check timing: 締めの間が 0.6〜0.8 秒なら OK で CREDIT_AT を出し、外れていれば NG と入れる値を出す・1 本の声なら NG", { skip }, () => {
  const s5 = { key: "s5", file: "s5-features", start: 29.7, effective: 4.5, speechStart: 0, text: "特長です。" };
  const s6 = { key: "s6", file: "s6-name", start: 35, effective: 1.5, speechStart: 0, text: "よやくる。" };
  const credit = (start) => ({ key: "s6b", file: "s6-credit", start, effective: 3, speechStart: 0.1, text: "せいさく、みほんこうぼう。" });
  const run = (f) => runTs("showcase-check.ts", ["timing", "--html", f.html, "--meta-dir", f.meta], childEnv({}));

  const good = run(timingFixture("timing-gap-ok", [s5, s6, credit(37.1)]));
  assert.strictEqual(good.status, 0, good.out);
  assert.match(good.out, /締めの間（s6 の話し終わり → s6b の話し始め）: 0\.7 秒/);
  assert.match(good.out, /CREDIT_AT（制作の名前が出る時刻）= 37\.2 秒/);

  const tight = run(timingFixture("timing-gap-tight", [s5, s6, credit(36.6)]));
  assert.strictEqual(tight.status, 1, tight.out);
  assert.match(tight.out, /締めの間が 0\.2 秒です/);
  assert.match(tight.out, /vo-s6b の data-start を 37\.1 にする/);

  const joined = run(timingFixture("timing-gap-joined", [s5, { ...s6, effective: 4.3, text: "よやくる。せいさく、みほんこうぼう。" }]));
  assert.strictEqual(joined.status, 1, joined.out);
  assert.match(joined.out, /締めの声が 1 本です/);
});

test("creditAtFromHtml: テンプレートの形（T.s6 と L0 + 数）を読み、読めない形は理由を返す", { skip }, async () => {
  const { creditAtFromHtml } = await load("showcase-check.ts");
  assert.deepStrictEqual(creditAtFromHtml(S6_JS), { kind: "ok", at: 37.2, l0: 34.6 });
  const tpl = fs.readFileSync(path.join(SKILL, "templates", "intro", "index.html"), "utf8");
  assert.deepStrictEqual(creditAtFromHtml(tpl), { kind: "ok", at: 37.2, l0: 34.6 }, "テンプレートそのものを読める");
  assert.deepStrictEqual(creditAtFromHtml("const L0 = 30;\nconst CREDIT_AT = L0 - 0.5;"), { kind: "ok", at: 29.5, l0: 30 });
  assert.deepStrictEqual(creditAtFromHtml("const T = { s6: 30 };\nconst L0 = T.s6 + 1;\nconst CREDIT_AT = 33.25;"), { kind: "ok", at: 33.25, l0: 31 });
  assert.strictEqual(
    creditAtFromHtml("const T = { s6: 30 };\nconst L0 = T.s6;\n// const CREDIT_AT = L0 + 9;\nconst CREDIT_AT = L0 + 1;").kind === "ok" &&
      creditAtFromHtml("const T = { s6: 30 };\nconst L0 = T.s6;\n// const CREDIT_AT = L0 + 9;\nconst CREDIT_AT = L0 + 1;").at,
    31,
    "// で消した行は読まない",
  );
  for (const [src, re] of [
    ["const T = { s6: 30 };\nconst L0 = T.s6;", /CREDIT_AT = … ; の行が見つかりません/],
    ["const CREDIT_AT = L0 + 1;", /const L0 = T/],
    ["const T = { s5: 30 };\nconst L0 = T.s6;\nconst CREDIT_AT = L0 + 1;", /T\.s6 が const T/],
    ["const L0 = 30;\nconst CREDIT_AT = L0 + T.s6b;", /式「L0 \+ T\.s6b」を読めません/],
    ["const L0 = 30;\nconst CREDIT_AT = L0 + 1;\nconst CREDIT_AT = L0 + 2;", /2 か所/],
  ]) {
    const r = creditAtFromHtml(src);
    assert.strictEqual(r.kind, "unreadable", src);
    assert.match(r.reason, re);
  }
});

test("showcase-check timing: index.html の CREDIT_AT を制作の声の話し始めと突き合わせる（ずれ 0.15 秒以上は NG と入れる式・一致は OK・式なしは注意）", { skip }, () => {
  const s5 = { key: "s5", file: "s5-features", start: 29.7, effective: 4.5, speechStart: 0, text: "特長です。" };
  const s6 = { key: "s6", file: "s6-name", start: 35, effective: 1.5, speechStart: 0, text: "よやくる。" };
  const credit = { key: "s6b", file: "s6-credit", start: 37.1, effective: 3, speechStart: 0.1, text: "せいさく、みほんこうぼう。" };
  const run = (f) => runTs("showcase-check.ts", ["timing", "--html", f.html, "--meta-dir", f.meta], childEnv({}));
  const js = (at) => `const T = { s6: 34.6, end: 42.0 };\nconst L0 = T.s6;\nconst CREDIT_AT = ${at};`;

  const same = run(timingFixture("credit-at-ok", [s5, s6, credit], js("L0 + 2.6")));
  assert.strictEqual(same.status, 0, same.out);
  assert.match(same.out, /index\.html の CREDIT_AT: 37\.2 秒（L0 = 34\.6）.*ずれ 0 秒 OK/);

  const near = run(timingFixture("credit-at-near", [s5, s6, credit], js("L0 + 2.7")));
  assert.strictEqual(near.status, 0, `0.1 秒のずれは許す\n${near.out}`);

  // vo-s6b だけ動かして CREDIT_AT を直し忘れた（話し始め 37.6 秒・CREDIT_AT は 37.2 秒のまま）
  const stale = run(timingFixture("credit-at-stale", [s5, s6, { ...credit, start: 37.5, speechStart: 0.1 }], js("L0 + 2.6")));
  assert.strictEqual(stale.status, 1, stale.out);
  assert.match(stale.out, /CREDIT_AT（37\.2 秒）が、制作の声 vo-s6b の話し始め（37\.6 秒）と -0\.4 秒ずれています/);
  assert.match(stale.out, /const CREDIT_AT = L0 \+ 3\.00;/);

  const edge = run(timingFixture("credit-at-edge", [s5, s6, credit], js("L0 + 2.75")));
  assert.strictEqual(edge.status, 1, `0.15 秒ちょうどは NG\n${edge.out}`);

  const none = run(timingFixture("credit-at-none", [s5, s6, credit], "const T = { s6: 34.6 };\nconst L0 = T.s6;"));
  assert.strictEqual(none.status, 0, none.out);
  assert.match(none.out, /CREDIT_AT を読めないので、制作の声と突き合わせていません/);
  assert.match(none.out, /注意/);
});

test("showcase-check tts: 名前と {{credit}} を 1 本の声にした台本（1.29 までの形）は NG", { skip }, () => {
  const d = tmpDir("check-tts-joined");
  const nd = path.join(d, "intro", "narration");
  fs.mkdirSync(nd, { recursive: true });
  const cfg = path.join(d, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ intro: { narrationDir: "intro/narration" }, credit: { display: "見本工房", kana: "みほんこうぼう" } }));
  const s = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", "narration.script.example.json"), "utf8"));
  s.items = s.items.filter((it) => it.id !== "s6-credit").map((it) => ({ ...it, text: it.id === "s6-name" ? "よやくる。せいさく、{{credit}}。" : "見本の文です。" }));
  fs.writeFileSync(path.join(nd, "narration.script.json"), JSON.stringify(s));
  const cred = path.join(d, "credentials.env");
  fs.writeFileSync(cred, `ELEVENLABS_API_KEY=${DUMMY_ELEVEN}\n`);
  const r = runTs("showcase-check.ts", ["tts", "--config", cfg], childEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_IMAGE_STUDIO_ENV: path.join(d, "none.env") }));
  assert.strictEqual(r.status, 1, r.out);
  assert.match(r.out, /s6-name: \{\{credit\}\} が「せいさく、\{\{credit\}\}。」だけの場面になっていません/);
  assert.ok(!r.out.includes(DUMMY_ELEVEN), "鍵の値を出さない");
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
  s.items = s.items.map((it) => ({ ...it, text: FILL[it.id] ?? "見本の文です。" }));
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

test("設定のひな形: 声の種類の既定は gemini・既定の声は ja-jp-commercial-4（講師が試聴して決めたおすすめ・台本のひな形と同じ）", { skip }, async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", "showcase.config.example.json"), "utf8"));
  const { DEFAULT_GEMINI } = await load("gemini-tts.ts");
  assert.strictEqual(cfg.tts.provider, "gemini");
  assert.strictEqual(cfg.tts.voice, DEFAULT_GEMINI.voice);
  assert.strictEqual(cfg.tts.model, DEFAULT_GEMINI.model);
  assert.strictEqual(DEFAULT_GEMINI.voice, "ja-jp-commercial-4");
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
  assert.strictEqual(jobs.length, 7, "ひな形は 7 本（締めが名前と制作の 2 本）");
  assert.strictEqual(outDir, d);
  assert.strictEqual(jobs[5].text, "よやくる。");
  assert.strictEqual(jobs[6].text, "せいさく、みほんこうぼう。");
  assert.strictEqual(jobs[0].out, path.join(d, "s1-hook.wav"), "置き場と名前は eleven-tts.ts と同じ <outDir>/<id>.wav");
  assert.strictEqual(jobs[0].spec.voice, "ja-jp-commercial-4");
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
  assert.match(r.out, /生成 7 本（呼び出し 7 回/);
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
  assert.strictEqual(PRESETS.gemini.voice, "ja-jp-commercial-4");

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
  fs.writeFileSync(cfg, JSON.stringify({ intro: { narrationDir: "intro/narration" }, credit: { display: "見本工房", kana: "みほんこうぼう" }, tts: { provider: "gemini", voice: "ja-jp-commercial-4", model: "gemini-3.8-flash-tts" } }));
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
  eleven.items = eleven.items.map((it) => ({ ...it, text: FILL[it.id] ?? "見本の文です。" }));
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

// ---------- 1.30.0: できあがりをデスクトップへ・声を聞き比べて選ぶ ----------

/** promo-video の 3 点（中身は小さな偽物）を作る */
function fakePromo(d, { light = false, skip = [] } = {}) {
  const promo = path.join(d, "app", "promo-video");
  const files = { "final/15秒.mp4": "cm", "final/紹介動画.mp4": "intro", "stills/final/thumb-ogp.png": "png" };
  if (light) files["final/紹介動画_軽量.mp4"] = "light";
  for (const [rel, body] of Object.entries(files)) {
    if (skip.includes(rel)) continue;
    fs.mkdirSync(path.dirname(path.join(promo, rel)), { recursive: true });
    fs.writeFileSync(path.join(promo, rel), body);
  }
  const cfg = path.join(promo, "showcase.config.json");
  fs.writeFileSync(cfg, JSON.stringify({ project: { name: "予約:アプリ/β" } }));
  return { promo, cfg };
}

test("desktop: ホームの Desktop → OneDrive/Desktop → OneDrive/デスクトップ の順・無ければ null・Windows は設定のデスクトップを先に聞く", { skip }, async () => {
  const { findDesktop, desktopCandidates, safeFolderName } = await load("lib/desktop.ts");
  await withCleanEnv({}, () => {
    const home = tmpDir("desk-home");
    assert.deepStrictEqual(desktopCandidates(home), [path.join(home, "Desktop"), path.join(home, "OneDrive", "Desktop"), path.join(home, "OneDrive", "デスクトップ")]);
    assert.strictEqual(findDesktop({ home, platform: "darwin" }).dir, null, "どれも無ければ作らずに null");
    fs.mkdirSync(path.join(home, "OneDrive", "デスクトップ"), { recursive: true });
    assert.strictEqual(findDesktop({ home, platform: "win32", shell: () => null }).dir, path.join(home, "OneDrive", "デスクトップ"));
    fs.mkdirSync(path.join(home, "Desktop"));
    assert.strictEqual(findDesktop({ home, platform: "darwin" }).dir, path.join(home, "Desktop"));
    const shellDesk = path.join(home, "OneDrive", "デスクトップ");
    assert.strictEqual(findDesktop({ home, platform: "win32", shell: () => shellDesk }).dir, shellDesk, "Windows はホームの Desktop より設定のデスクトップを使う");
    assert.strictEqual(safeFolderName('予約:アプリ/β*?"<>|'), "予約アプリβ");
    assert.strictEqual(safeFolderName("〔アプリの名前〕"), "アプリの名前");
    assert.strictEqual(safeFolderName("  ...  "), "アプリ");
    assert.strictEqual(safeFolderName("末尾の点. "), "末尾の点");
  });
});

test("deliver: 3 点（軽い版があれば 4 点）をデスクトップの「紹介動画_<名前>」に写し、元は残す・足りなければ何も写さない・デスクトップが無ければ作らない", { skip }, () => {
  const d = tmpDir("deliver");
  const desk = path.join(d, "Desktop");
  fs.mkdirSync(desk);
  const { promo, cfg } = fakePromo(d, { light: true });
  const r = runTs("deliver.ts", ["--config", cfg], childEnv({ SHOWCASE_DESKTOP_DIR: desk }));
  assert.strictEqual(r.status, 0, r.out);
  const folder = path.join(desk, "紹介動画_予約アプリβ");
  assert.match(r.out, /デスクトップの「紹介動画_予約アプリβ」フォルダに置きました/);
  assert.deepStrictEqual(fs.readdirSync(folder).sort(), ["15秒.mp4", "サムネイル.png", "紹介動画.mp4", "紹介動画_軽量.mp4"].sort());
  assert.strictEqual(fs.readFileSync(path.join(folder, "紹介動画.mp4"), "utf8"), "intro");
  assert.ok(fs.existsSync(path.join(promo, "final", "紹介動画.mp4")), "元のファイルは残す");
  // 作り直したあとにもう一度実行すると上書きする
  fs.writeFileSync(path.join(promo, "final", "紹介動画.mp4"), "intro2");
  assert.strictEqual(runTs("deliver.ts", ["--config", cfg], childEnv({ SHOWCASE_DESKTOP_DIR: desk })).status, 0);
  assert.strictEqual(fs.readFileSync(path.join(folder, "紹介動画.mp4"), "utf8"), "intro2");
  // --name で名前を変えられる
  assert.strictEqual(runTs("deliver.ts", ["--config", cfg, "--name", "見本"], childEnv({ SHOWCASE_DESKTOP_DIR: desk })).status, 0);
  assert.ok(fs.existsSync(path.join(desk, "紹介動画_見本", "15秒.mp4")));

  // 足りないものがあれば止まり、フォルダを作らない
  const d2 = tmpDir("deliver-missing");
  const desk2 = path.join(d2, "Desktop");
  fs.mkdirSync(desk2);
  const p2 = fakePromo(d2, { skip: ["stills/final/thumb-ogp.png"] });
  const m = runTs("deliver.ts", ["--config", p2.cfg], childEnv({ SHOWCASE_DESKTOP_DIR: desk2 }));
  assert.strictEqual(m.status, 1, m.out);
  assert.match(m.out, /サムネイル/);
  assert.deepStrictEqual(fs.readdirSync(desk2), [], "何も作らない");

  // デスクトップが無ければ作らずに、できあがりの場所を出す
  const d3 = tmpDir("deliver-nodesk");
  const p3 = fakePromo(d3);
  const noDesk = path.join(d3, "Desktop");
  const n = runTs("deliver.ts", ["--config", p3.cfg], childEnv({ SHOWCASE_DESKTOP_DIR: noDesk }));
  assert.strictEqual(n.status, 0, n.out);
  assert.match(n.out, /\[注意\] デスクトップのフォルダが見つかりませんでした/);
  assert.ok(n.out.includes(path.join(p3.promo, "final", "15秒.mp4")));
  assert.ok(!fs.existsSync(noDesk), "デスクトップのフォルダを作らない");
  assert.strictEqual(runTs("deliver.ts", ["--config", p3.cfg, "--bogus", "x"], childEnv({ SHOWCASE_DESKTOP_DIR: noDesk })).status, 1);
});

test("声の候補（同梱の catalog.json）: 1 番がおすすめで設定のひな形の既定の声と同じ・Gemini は 4 つまで・形の悪い一覧は止める", { skip }, async () => {
  const { loadCatalog, validateCatalog, findCandidate, placedName } = await load("lib/voice-catalog.ts");
  const { DEFAULT_GEMINI } = await load("gemini-tts.ts");
  const { DEFAULT_VOICE } = await load("lib/eleven-client.ts");
  await withCleanEnv({}, () => {
    const cat = loadCatalog();
    assert.strictEqual(cat.gemini[0].id, DEFAULT_GEMINI.voice);
    assert.strictEqual(cat.gemini[0].model, DEFAULT_GEMINI.model);
    assert.strictEqual(cat.elevenlabs[0].id, DEFAULT_VOICE.id);
    assert.ok(cat.gemini.length >= 2 && cat.gemini.length <= 4, "Gemini の候補はおすすめを含めて 4 つまで（無料枠を試聴に 4 回だけ使う）");
    assert.ok(cat.elevenlabs.length <= 4);
    for (const c of cat.gemini) {
      assert.ok(/^ja-jp-[a-z]+-\d+$/.test(c.id), `日本語（ja-JP）の声: ${c.id}`);
      assert.strictEqual(c.model, DEFAULT_GEMINI.model);
    }
    assert.ok([...cat.sentence].length <= 40, "試聴の 1 文は数秒で終わる長さ");
    assert.strictEqual(findCandidate(cat, "gemini", "2")?.no, 2);
    assert.strictEqual(findCandidate(cat, "gemini", "ja-jp-commercial-4")?.no, 1);
    assert.strictEqual(findCandidate(cat, "gemini", "ja-jp-advisor-3")?.no, 2, "1.29 までの既定の声は 2 番（落ち着いた男性）");
    assert.deepStrictEqual(cat.gemini.map((c) => c.id), ["ja-jp-commercial-4", "ja-jp-advisor-3", "ja-jp-commercial-3", "ja-jp-advisor-2"], "講師が試聴して決めた並び");
    assert.deepStrictEqual(cat.gemini.map((c) => c.file), ["gemini/1.mp3", "gemini/2.mp3", "gemini/3.mp3", "gemini/4.mp3"], "mp3 は番号どおりの名前");
    assert.strictEqual(findCandidate(cat, "gemini", "9"), null);
    assert.strictEqual(findCandidate(cat, "elevenlabs", "ja-jp-commercial-4"), null, "種類の違う声は引かない");
    assert.match(placedName(cat.gemini[0]), /^1_おすすめ_.+\.mp3$/);
    assert.ok(!/[\\/:*?"<>|\s]/.test(placedName(cat.gemini[1])), "Windows のファイル名に使えない文字を入れない");
    const bad = (mut) => {
      const c = JSON.parse(JSON.stringify(cat));
      mut(c);
      return () => validateCatalog(c);
    };
    assert.throws(bad((c) => (c.gemini[1].recommended = true)), /おすすめ/);
    assert.throws(bad((c) => (c.gemini[1].no = 5)), /連番/);
    assert.throws(bad((c) => (c.gemini[1].id = c.gemini[0].id)), /重複/);
    assert.throws(bad((c) => (c.gemini[0].file = "../x.mp3")), /file/);
    assert.throws(bad((c) => (c.elevenlabs = [])), /候補がありません/);
  });
});

/** 試聴の音声を置いた仮の voice-samples（Gemini 2 つ・ElevenLabs 1 つで音声なし） */
function fakeSamples(d) {
  const dir = path.join(d, "voice-samples");
  fs.mkdirSync(path.join(dir, "gemini"), { recursive: true });
  const cat = JSON.parse(fs.readFileSync(path.join(SKILL, "voice-samples", "catalog.json"), "utf8"));
  cat.gemini = cat.gemini.slice(0, 2);
  cat.elevenlabs = cat.elevenlabs.slice(0, 1);
  fs.writeFileSync(path.join(dir, "catalog.json"), JSON.stringify(cat, null, 2));
  fs.writeFileSync(path.join(dir, "gemini", "1.mp3"), "one");
  fs.writeFileSync(path.join(dir, "gemini", "2.mp3"), "two");
  return { dir, cat };
}

test("voice-samples place: デスクトップの「声の聞き比べ_Gemini」に番号付きで写す・音声が無ければおすすめで進める・デスクトップが無ければ同梱の場所を出す", { skip }, () => {
  const d = tmpDir("samples");
  const desk = path.join(d, "Desktop");
  fs.mkdirSync(desk);
  const { dir, cat } = fakeSamples(d);
  const env = childEnv({ SHOWCASE_DESKTOP_DIR: desk, SHOWCASE_VOICE_SAMPLES_DIR: dir });
  const r = runTs("voice-samples.ts", ["place", "--provider", "gemini"], env);
  assert.strictEqual(r.status, 0, r.out);
  const folder = path.join(desk, "声の聞き比べ_Gemini");
  const names = fs.readdirSync(folder).sort();
  assert.strictEqual(names.length, 2);
  assert.match(names[0], /^1_おすすめ_/);
  assert.match(names[1], /^2_/);
  assert.strictEqual(fs.readFileSync(path.join(folder, names[1]), "utf8"), "two");
  assert.match(r.out, /ダブルクリックして聞き、気に入った声の番号を返してください/);
  assert.match(r.out, /voice-choice\.ts save .*--voice <番号>/);
  // 前に写した古い名前のファイルは消す・ほかのファイルには触らない
  fs.writeFileSync(path.join(folder, "2_古い説明.mp3"), "old");
  fs.writeFileSync(path.join(folder, "メモ.txt"), "keep");
  assert.strictEqual(runTs("voice-samples.ts", ["place", "--provider", "gemini"], env).status, 0);
  assert.ok(!fs.existsSync(path.join(folder, "2_古い説明.mp3")));
  assert.ok(fs.existsSync(path.join(folder, "メモ.txt")));

  // 音声が同梱されていない種類は、聞き比べを飛ばしておすすめで進める（フォルダを作らない）
  const e = runTs("voice-samples.ts", ["place", "--provider", "elevenlabs"], env);
  assert.strictEqual(e.status, 0, e.out);
  assert.match(e.out, /試聴の音声が入っていません/);
  assert.match(e.out, new RegExp(`--provider elevenlabs --voice 1`));
  assert.ok(!fs.existsSync(path.join(desk, "声の聞き比べ_ElevenLabs")));

  // デスクトップが無ければ作らず、同梱のファイルの場所を出す
  const nd = runTs("voice-samples.ts", ["place", "--provider", "gemini"], childEnv({ SHOWCASE_DESKTOP_DIR: path.join(d, "none"), SHOWCASE_VOICE_SAMPLES_DIR: dir }));
  assert.strictEqual(nd.status, 0, nd.out);
  assert.match(nd.out, /デスクトップのフォルダが見つかりませんでした/);
  assert.ok(nd.out.includes(path.join(dir, "gemini", "1.mp3")));
  assert.ok(!fs.existsSync(path.join(d, "none")));

  const l = runTs("voice-samples.ts", ["list", "--provider", "gemini"], env);
  assert.strictEqual(l.status, 0, l.out);
  assert.ok(l.out.includes(cat.sentence));
  assert.match(l.out, /1\. .+【おすすめ】.+試聴あり/);
  assert.strictEqual(runTs("voice-samples.ts", ["place", "--provider", "voicevox"], env).status, 1);
  assert.strictEqual(runTs("voice-samples.ts", ["place"], env).status, 1);
});

test("voice-choice --voice: 番号で選んだ声を設定と控えに書く・次は控えの声を使う・1.29 の控え（声の種類だけ）はおすすめの声のまま", { skip }, async () => {
  const { resolveVoice } = await load("voice-choice.ts");
  const { loadCatalog } = await load("lib/voice-catalog.ts");
  const cat = await withCleanEnv({}, () => loadCatalog());
  assert.strictEqual(resolveVoice("gemini", "2", {}, cat).id, cat.gemini[1].id);
  assert.strictEqual(resolveVoice("gemini", undefined, {}, cat).id, "ja-jp-commercial-4", "何も無ければおすすめ");
  assert.strictEqual(resolveVoice("gemini", undefined, { voiceProvider: "gemini" }, cat).id, "ja-jp-commercial-4", "1.29 の控え（声の種類だけ）は 1.30 のおすすめの声");
  assert.strictEqual(resolveVoice("gemini", undefined, { voiceProvider: "gemini", voiceId: cat.gemini[2].id }, cat).id, cat.gemini[2].id, "控えの声を使う");
  assert.strictEqual(resolveVoice("elevenlabs", undefined, { voiceProvider: "gemini", voiceId: cat.gemini[2].id }, cat).id, "EHMH9cyd1z3rXm4z0Jja", "種類を変えたらその種類のおすすめ");
  assert.strictEqual(resolveVoice("gemini", undefined, { voiceProvider: "gemini", voiceId: "ja-jp-nai-1" }, cat).id, "ja-jp-commercial-4", "一覧から消えた声ならおすすめ");
  assert.throws(() => resolveVoice("gemini", "9", {}, cat), /候補にありません/);

  const d = tmpDir("voice-choice-voice");
  const cfg = path.join(d, "showcase.config.json");
  fs.copyFileSync(path.join(SKILL, "templates", "showcase.config.example.json"), cfg);
  const profile = path.join(d, "profile.json");
  // 1.29 で保存した控え（声の種類だけ）
  fs.writeFileSync(profile, JSON.stringify({ org: "見本工房", voiceProvider: "gemini" }));
  const env = childEnv({ SHOWCASE_PROFILE_FILE: profile });
  const old = runTs("voice-choice.ts", ["show"], env);
  assert.strictEqual(old.status, 0, old.out);
  assert.match(old.out, /控え: 声の種類 gemini.*ja-jp-commercial-4/);
  const r = runTs("voice-choice.ts", ["save", "--config", cfg, "--provider", "gemini", "--voice", "3"], env);
  assert.strictEqual(r.status, 0, r.out);
  assert.ok(r.out.includes(cat.gemini[2].id));
  const saved = JSON.parse(fs.readFileSync(cfg, "utf8"));
  assert.deepStrictEqual([saved.tts.provider, saved.tts.voice, saved.tts.model], ["gemini", cat.gemini[2].id, cat.gemini[2].model]);
  assert.ok(typeof saved.tts.$comment === "string", "tts の説明は残す");
  const p = JSON.parse(fs.readFileSync(profile, "utf8"));
  assert.strictEqual(p.voiceId, cat.gemini[2].id);
  assert.strictEqual(p.org, "見本工房", "制作クレジットの控えを消さない");
  assert.match(runTs("voice-choice.ts", ["show"], env).out, new RegExp(`声 3\\. .*${cat.gemini[2].id}`));
  // 次の動画で「前と同じ」なら --voice なしで同じ声になる
  const cfg2 = path.join(d, "showcase2.config.json");
  fs.copyFileSync(path.join(SKILL, "templates", "showcase.config.example.json"), cfg2);
  assert.strictEqual(runTs("voice-choice.ts", ["save", "--config", cfg2, "--provider", "gemini"], env).status, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(cfg2, "utf8")).tts.voice, cat.gemini[2].id);
  // 一覧に無い番号は書かずに止まる
  const before = fs.readFileSync(cfg2, "utf8");
  const bad = runTs("voice-choice.ts", ["save", "--config", cfg2, "--provider", "gemini", "--voice", "99"], env);
  assert.strictEqual(bad.status, 1, bad.out);
  assert.strictEqual(fs.readFileSync(cfg2, "utf8"), before, "設定を書き換えない");
});

test("showcase-check tts: 聞き比べで選んだ Gemini の声（おすすめ以外）でも、台本と設定がそろっていれば NG にしない", { skip }, async () => {
  const { loadCatalog } = await load("lib/voice-catalog.ts");
  const cat = await withCleanEnv({}, () => loadCatalog());
  const d = tmpDir("check-tts-picked");
  const nd = path.join(d, "intro", "narration");
  fs.mkdirSync(nd, { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(SKILL, "templates", "showcase.config.example.json"), "utf8"));
  cfg.tts.voice = cat.gemini[1].id;
  cfg.credit = { display: "見本工房", kana: "みほんこうぼう" };
  fs.writeFileSync(path.join(d, "showcase.config.json"), JSON.stringify(cfg));
  const s = JSON.parse(fs.readFileSync(GEMINI_SCRIPT, "utf8"));
  s.voice = cat.gemini[1].id;
  s.items = [{ id: "s1-hook", text: "見本の文です。" }, { id: "s6-name", text: "みほん。" }, { id: "s6-credit", text: "せいさく、{{credit}}。" }];
  fs.writeFileSync(path.join(nd, "narration.script.json"), JSON.stringify(s));
  const cred = path.join(d, "credentials.env");
  fs.writeFileSync(cred, `GEMINI_API_KEY=${DUMMY_GEMINI}\n`);
  const r = runTs("showcase-check.ts", ["tts", "--config", path.join(d, "showcase.config.json")], childEnv({ SHOWCASE_CREDENTIALS_FILE: cred }));
  assert.ok(!/voice が設定と違います/.test(r.out), r.out);
  assert.ok(r.out.includes(cat.gemini[1].id), r.out);
});

test("gen-voice-samples（講師用）: 声の一覧で候補を確かめてから 1 候補 1 回だけ作り、mp3 を置く・作ってあれば呼ばない・一覧に無い声は 1 回も読み上げない", { skip }, async () => {
  const http = await import("node:http");
  const { spawn } = await import("node:child_process");
  const d = tmpDir("gen-samples");
  const { dir, cat } = fakeSamples(d);
  fs.rmSync(path.join(dir, "gemini"), { recursive: true });
  let speech = 0;
  let listed = 0;
  let known = cat.gemini.map((c) => c.id);
  let keyInUrl = false;
  const server = http.createServer((req, res) => {
    if (req.url.includes("key=")) keyInUrl = true;
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.method === "GET" && req.url.startsWith("/v1beta/voices")) {
        listed++;
        assert.match(req.url, /language_code=ja-JP/);
        res.end(JSON.stringify({ voices: known.map((id) => ({ id })) }));
        return;
      }
      speech++;
      res.end(JSON.stringify({ steps: [{ type: "model_output", content: [{ type: "audio", data: toneWav(1.5).toString("base64") }] }] }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const cred = path.join(d, "credentials.env");
  fs.writeFileSync(cred, `GEMINI_API_KEY=${DUMMY_GEMINI}\n`);
  const env = childEnv({ SHOWCASE_CREDENTIALS_FILE: cred, SHOWCASE_VOICE_SAMPLES_DIR: dir, SHOWCASE_GEMINI_API_BASE: `http://127.0.0.1:${server.address().port}/v1beta` });
  const run = (args) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [path.join(SCRIPTS, "gen-voice-samples.ts"), ...args], { env });
      let out = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (out += c));
      p.on("close", (code) => resolve({ status: code, out }));
    });
  try {
    const dry = await run(["--provider", "gemini", "--dry-run"]);
    assert.strictEqual(dry.status, 0, dry.out);
    assert.match(dry.out, /読み上げの呼び出し: 2 回/);
    assert.strictEqual(speech + listed, 0, "--dry-run は呼ばない");

    known = [cat.gemini[0].id];
    const missing = await run(["--provider", "gemini"]);
    assert.strictEqual(missing.status, 1, missing.out);
    assert.ok(missing.out.includes(cat.gemini[1].id));
    assert.strictEqual(speech, 0, "一覧に無い声があれば 1 回も読み上げない");

    known = cat.gemini.map((c) => c.id);
    const r = await run(["--provider", "gemini"]);
    assert.strictEqual(r.status, 0, r.out);
    assert.strictEqual(speech, 2, "1 候補 1 回");
    assert.ok(!r.out.includes(DUMMY_GEMINI), "鍵の値を出さない");
    assert.ok(!keyInUrl, "キーを URL に入れない");
    for (const n of [1, 2]) {
      const b = fs.readFileSync(path.join(dir, "gemini", `${n}.mp3`));
      assert.ok(b.length > 1000 && (b.subarray(0, 3).toString() === "ID3" || b[0] === 0xff), "mp3 になっている");
    }
    const written = JSON.parse(fs.readFileSync(path.join(dir, "catalog.json"), "utf8"));
    assert.deepStrictEqual(written.gemini.map((c) => c.file), ["gemini/1.mp3", "gemini/2.mp3"]);

    const again = await run(["--provider", "gemini"]);
    assert.strictEqual(again.status, 0, again.out);
    assert.strictEqual(speech, 2, "作ってあれば呼ばない（無料枠の回数を使わない）");
  } finally {
    server.close();
  }
});

test("gen-voice-samples（講師用）: 引数の誤りは止める・ElevenLabs の自動の候補は日本語の声だけで男女を交互に選ぶ", { skip }, async () => {
  const { parseArgs, eligibleShared, pickAlternating, elevenLabel } = await load("gen-voice-samples.ts");
  assert.throws(() => parseArgs([]), /--provider/);
  assert.throws(() => parseArgs(["--provider", "gemini", "--list"]), /elevenlabs だけ/);
  assert.throws(() => parseArgs(["--provider", "elevenlabs", "--pick", "a/b"]), /英数字/);
  assert.throws(() => parseArgs(["--provider", "gemini", "--bogus"]), /知らない引数/);
  assert.deepStrictEqual(parseArgs(["--provider", "elevenlabs", "--pick", "abc", "--auto", "2"]).pick, ["abc"]);
  const list = [
    { voice_id: "m1", name: "M1", gender: "male", language: "ja", usage_character_count_1y: 900 },
    { voice_id: "en", name: "EN", gender: "female", language: "en", usage_character_count_1y: 99999 },
    { voice_id: "f1", name: "F1", gender: "female", language: "ja", usage_character_count_1y: 800 },
    { voice_id: "m2", name: "M2", gender: "male", language: "ja", usage_character_count_1y: 700 },
    { voice_id: "pay", name: "PAY", gender: "female", language: "ja", rate: 2, usage_character_count_1y: 5000 },
    { voice_id: "mod", name: "MOD", gender: "female", language: "ja", live_moderation_enabled: true, usage_character_count_1y: 5000 },
    { voice_id: "m1", name: "M1", gender: "male", language: "ja", usage_character_count_1y: 900 },
    { voice_id: "yuma", name: "Y", gender: "male", language: "ja", usage_character_count_1y: 99999 },
  ];
  const ok = eligibleShared(list, new Set(["yuma"]));
  assert.deepStrictEqual(ok.map((v) => v.voice_id), ["m1", "f1", "m2"], "日本語・料金の上乗せなし・重複なし・使われている順");
  assert.deepStrictEqual(pickAlternating(ok, 3).map((v) => v.voice_id), ["f1", "m1", "m2"]);
  assert.match(elevenLabel({ name: "X", gender: "female", age: "young", descriptive: "calm" }), /^穏やかな若い女性（X）$/);
});

test("SKILL.md: 声は聞き比べてから番号で選ぶ・できあがりはデスクトップのフォルダにも置く・無料枠は 1 日 10 回", () => {
  const skill = fs.readFileSync(path.join(SKILL, "SKILL.md"), "utf8");
  assert.ok(skill.includes("voice-samples.ts"), "聞き比べの道具");
  assert.ok(skill.includes("deliver.ts"), "デスクトップへ写す道具");
  assert.ok(skill.includes("デスクトップの「紹介動画_"), "完了報告でデスクトップのフォルダを言う");
  assert.ok(skill.includes("声を変えて"), "選び直し方");
  assert.ok(skill.includes("1 日 10 回"), "無料枠の回数");
  assert.ok(skill.includes("7 回（読み直しがあればその分増える）"), "1 本で使う回数");
  const sv = fs.readFileSync(path.join(SKILL, "references", "script-and-voice.md"), "utf8");
  assert.match(sv, /voice-samples\.ts"? place --provider/);
  assert.ok(sv.includes("--voice"));
});
