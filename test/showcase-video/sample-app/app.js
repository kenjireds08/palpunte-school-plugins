// 見本アプリ「ヨヤクル」。データは localStorage（キー yoyakuru-reservations）だけ。名前はすべて見本のもの
(() => {
  const KEY = "yoyakuru-reservations";
  const SEED = [
    { day: "11/4（火）", time: "10:00", cls: "パン教室", name: "見本 一郎", st: "確定" },
    { day: "11/4（火）", time: "13:30", cls: "和食教室", name: "見本 二葉", st: "確定" },
    { day: "11/5（水）", time: "18:00", cls: "お菓子教室", name: "見本 三郎", st: "確定" },
    { day: "11/6（木）", time: "10:00", cls: "和食教室", name: "見本 四季", st: "確定" },
  ];
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- 管理画面 ----------
  if ($("#rows")) {
    // ?demo=1 のときは、お客さんの画面で入った見本の予約を 1 件足して見せる（撮影用。保存はしない）
    const demo = new URLSearchParams(location.search).has("demo") ? [{ day: "11/8（土）", time: "13:30", cls: "パン教室", name: "見本 花子" }] : [];
    const mine = [...demo, ...load()];
    const all = [...mine.map((r) => ({ ...r, st: "新規" })), ...SEED];
    let filter = "all";
    const draw = () => {
      $("#rows").innerHTML = all
        .filter((r) => filter === "all" || r.cls === filter)
        .map((r) => `<tr class="${r.st === "新規" ? "new" : ""}"><td>${esc(r.day)}</td><td>${esc(r.time)}</td><td>${esc(r.cls)}</td><td>${esc(r.name)}</td><td><span class="tag ${r.st === "新規" ? "new" : ""}">${esc(r.st)}</span></td></tr>`)
        .join("");
    };
    $("#k-week").textContent = `${all.length}件`;
    $("#k-new").textContent = `${mine.length}件`;
    $$(".filters button").forEach((b) =>
      b.addEventListener("click", () => {
        filter = b.dataset.f;
        $$(".filters button").forEach((x) => x.classList.toggle("on", x === b));
        draw();
      }),
    );
    draw();
    return;
  }

  // ---------- お客さんの画面 ----------
  const state = { cls: null, price: null, day: null, time: null };
  const show = (id, step) => {
    $$(".view").forEach((v) => (v.hidden = v.id !== id));
    $$(".steps span").forEach((s) => s.classList.toggle("on", Number(s.dataset.step) <= step));
    window.scrollTo(0, 0);
  };
  $$(".cls").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".cls").forEach((x) => x.classList.toggle("sel", x === b));
      state.cls = b.dataset.class;
      state.price = b.dataset.price;
      $("#to-date").disabled = false;
    }),
  );
  const DAYS = [["11/7", "金"], ["11/8", "土"], ["11/9", "日"], ["11/11", "火"], ["11/12", "水"], ["11/13", "木"]];
  $("#days").innerHTML = DAYS.map(([d, w]) => `<button class="day" data-day="${d}（${w}）"><b>${d}</b><small>${w}曜日</small></button>`).join("");
  const ready = () => ($("#to-confirm").disabled = !(state.day && state.time));
  $$(".day").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".day").forEach((x) => x.classList.toggle("sel", x === b));
      state.day = b.dataset.day;
      ready();
    }),
  );
  $$(".time").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".time").forEach((x) => x.classList.toggle("sel", x === b));
      state.time = b.textContent;
      ready();
    }),
  );
  $("#to-date").addEventListener("click", () => {
    $("#date-lead").textContent = `${state.cls}・${state.price}`;
    show("v-date", 2);
  });
  $("#to-confirm").addEventListener("click", () => {
    $("#summary").innerHTML = `${esc(state.cls)}<br />${esc(state.day)} ${esc(state.time)}<br />${esc(state.price)}`;
    show("v-confirm", 3);
  });
  $("#name").addEventListener("input", (e) => ($("#submit").disabled = !e.target.value.trim()));
  $("#submit").addEventListener("click", () => {
    const name = $("#name").value.trim();
    const list = load();
    list.unshift({ day: state.day, time: state.time, cls: state.cls, name });
    localStorage.setItem(KEY, JSON.stringify(list));
    $("#done-text").textContent = `${state.day} ${state.time}　${state.cls}`;
    $("#code").textContent = `予約番号 Y-${String(100 + list.length)}`;
    show("v-done", 3);
  });
})();
