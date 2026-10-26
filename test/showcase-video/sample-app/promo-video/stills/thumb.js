// showcase-video サムネイル（OGP 版 1200x630）の配置の検査。<head> で読み込む（3 つの型で共通。案件ごとに書き換えない）。
//   window.__thumbLayout(): render.ts が撮影の前に呼ぶ。不合格なら書き出さない。
//   見ること: 端末（data-device）が枠の中に収まる／文字（data-slot）が枠の中で端末に重ならない／
//            PC の画面の寄せが画像の内側／画面の中の .keep（隠してはいけない範囲）が別の端末に隠れていない
(function () {
  var W = 1200;
  var H = 630;

  function stageBox() {
    var stage = document.querySelector(".stage");
    var r = stage.getBoundingClientRect();
    return { r: r, k: r.width / W };
  }
  function toStage(rect, sb) {
    return { x: (rect.left - sb.r.left) / sb.k, y: (rect.top - sb.r.top) / sb.k, w: rect.width / sb.k, h: rect.height / sb.k };
  }
  // 要素とその子孫の外形（台座のはみ出しも含む）。overflow で切り抜く要素はその外形だけを数える
  function extent(el, sb) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (function walk(n) {
      if (n.classList.contains("keep") || n.hasAttribute("data-decor")) return;
      var r = n.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        var b = toStage(r, sb);
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
      }
      var ov = getComputedStyle(n).overflow;
      if (ov.indexOf("hidden") >= 0 || ov.indexOf("clip") >= 0) return;
      Array.prototype.forEach.call(n.children, walk);
    })(el);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // 文字の実際の外形（ブロックの幅ではなく字面）
  function textExtent(el, sb) {
    var range = document.createRange();
    range.selectNodeContents(el);
    return toStage(range.getBoundingClientRect(), sb);
  }
  function r1(b) { return [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)]; }
  function inside(b, box, tol) {
    return b.x >= box.left - tol && b.y >= box.top - tol && b.x + b.w <= box.right + tol && b.y + b.h <= box.bottom + tol;
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }
  function label(el) {
    if (!el) return "(なし)";
    var s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    if (typeof el.className === "string" && el.className) s += "." + el.className.trim().split(/\s+/).join(".");
    var dev = el.closest("[data-device]");
    return dev ? s + "（" + dev.getAttribute("data-device") + " の中）" : s;
  }

  window.__thumbLayout = function () {
    var sb = stageBox();
    var issues = [];
    var TOL = 0.5;
    var FRAME = { left: 0, top: 0, right: W, bottom: H };
    var devices = Array.prototype.slice.call(document.querySelectorAll("[data-device]"));
    var slots = Array.prototype.slice.call(document.querySelectorAll("[data-slot]"));
    var devBoxes = devices.map(function (d) { return { name: d.getAttribute("data-device"), box: extent(d, sb) }; });
    var slotBoxes = slots.map(function (s) { return { name: s.getAttribute("data-slot"), box: textExtent(s, sb) }; });
    if (devices.length === 0) issues.push("端末（data-device）が 1 つもありません");
    if (slots.length === 0) issues.push("文字（data-slot）が 1 つもありません");

    devBoxes.forEach(function (d) {
      if (!inside(d.box, FRAME, TOL)) issues.push("端末 " + d.name + " が枠からはみ出しています " + JSON.stringify(r1(d.box)) + "（台座まで枠の中に収める）");
    });
    slotBoxes.forEach(function (s) {
      if (!inside(s.box, FRAME, TOL)) issues.push("文字 " + s.name + " が枠からはみ出しています " + JSON.stringify(r1(s.box)));
      devBoxes.forEach(function (d) {
        if (overlap(s.box, d.box)) issues.push("文字 " + s.name + " が端末 " + d.name + " に重なっています（文字を短くするか、端末を右へ）");
      });
    });

    document.querySelectorAll(".laptop .pc-screen").forEach(function (scr) {
      var img = scr.querySelector(".pc-scale > img");
      if (!img) return;
      var s = toStage(scr.getBoundingClientRect(), sb);
      var m = toStage(img.getBoundingClientRect(), sb);
      if (m.x > s.x + TOL || m.y > s.y + TOL || m.x + m.w < s.x + s.w - TOL || m.y + m.h < s.y + s.h - TOL) {
        issues.push("PC の画面の寄せが画像の外に出ています（--view-x + --view-w ≦ 1280・--view-y + --view-w x 0.6248 ≦ 800 にする）");
      }
      Array.prototype.forEach.call(scr.querySelectorAll(".keep"), function (k) {
        var b = toStage(k.getBoundingClientRect(), sb);
        if (!inside(b, { left: s.x, top: s.y, right: s.x + s.w, bottom: s.y + s.h }, TOL)) {
          issues.push("PC の画面の .keep " + JSON.stringify(r1(b)) + " が見えている範囲からはみ出しています（.keep を見えている所だけにするか、寄せる範囲を動かす）");
        }
      });
    });

    // 画面の中身（.keep）が、別の端末に隠れていないか。3px 間隔で一番手前の要素を調べる
    var keeps = Array.prototype.slice.call(document.querySelectorAll(".keep"));
    if (keeps.length === 0) issues.push("隠してはいけない範囲（.keep）が 1 つもありません（画面の大事な文字・数字を .keep で囲む）");
    document.documentElement.classList.add("thumb-hit");
    var keepReport = [];
    try {
      keeps.forEach(function (k, i) {
        var dev = k.closest("[data-device]");
        var name = (dev ? dev.getAttribute("data-device") : "?") + " の .keep[" + i + "]";
        if (!dev) {
          issues.push(name + " が端末の外に置かれています");
          return;
        }
        var r = k.getBoundingClientRect();
        var hidden = 0, total = 0, by = {};
        for (var y = r.top + 1; y < r.bottom; y += 3) {
          for (var x = r.left + 1; x < r.right; x += 3) {
            total++;
            var top = document.elementFromPoint(x, y);
            if (!top || !dev.contains(top)) {
              hidden++;
              var l = label(top);
              by[l] = (by[l] || 0) + 1;
            }
          }
        }
        keepReport.push({ name: name, box: r1(toStage(r, sb)), samples: total, hidden: hidden });
        if (total === 0) issues.push(name + " の大きさが 0 です");
        if (hidden > 0) issues.push(name + " " + JSON.stringify(r1(toStage(r, sb))) + " が隠れています（" + hidden + "/" + total + " 点。手前にあるもの: " + Object.keys(by).map(function (key) { return key + " " + by[key]; }).join(" / ") + "）");
      });
    } finally {
      document.documentElement.classList.remove("thumb-hit");
    }
    return {
      stage: [W, H],
      devices: devBoxes.map(function (d) { return { name: d.name, box: r1(d.box) }; }),
      slots: slotBoxes.map(function (s) { return { name: s.name, box: r1(s.box) }; }),
      keeps: keepReport,
      issues: issues,
      pass: issues.length === 0,
    };
  };
})();
