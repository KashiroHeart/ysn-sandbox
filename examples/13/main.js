/* カラーピッカーの DOM に触らない部分（C）：HEX / RGB / HSV の変換、合成の変換表（適用と逆算）、
   画像からの頻出色抽出とスポイトの平均、保存値の正規化。 */
const C = (() => {
  /** パレットに保持できる色の上限。 */
  const MAX_PALETTE = 64;
  /** パレットの色に付ける名前の長さの上限（code point）。 */
  const MAX_NAME_LEN = 40;
  /** スポイトのサンプル範囲（一辺の画素数）。 */
  const SAMPLE_SIZES = [1, 3, 5];
  /** 合成モード。 */
  const BLEND_MODES = ["screen", "overlay"];
  /** 頻出色抽出の既定の色数。 */
  const FREQUENT_COUNT = 8;
  /** 量子化の段階数（各チャンネル 4 bit）。 */
  const QUANT_BITS = 4;
  /** 統合する RGB 距離。この距離未満の色は同じ色として数える。 */
  const MERGE_DISTANCE = 48;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const to255 = (x) => Math.round(clamp01(x) * 255);

  /** "#rrggbb" / "#rgb"（# 無し・前後空白も可）を {r,g,b} にする。通らなければ null。 */
  const parseHex = function (s) {
    if (typeof s !== "string") return null;
    const m = /^\s*#?([0-9a-f]{3}|[0-9a-f]{6})\s*$/i.exec(s);
    if (!m) return null;
    let hex = m[1];
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  /** 読めない HEX のうち、桁が足りないだけ（入力途中）ではなく打ち間違いと言えるもの。 */
  const hexMistyped = function (s) {
    if (parseHex(s)) return false;
    const digits = String(s).replace(/[#\s]/g, "");
    return /[^0-9a-f]/i.test(digits) || digits.length > 6 || /#.*#/.test(s);
  };

  /** {r,g,b} を小文字の "#rrggbb" にする。範囲外は 0..255 に収める。 */
  const toHex = function (c) {
    const h = (v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + h(c.r) + h(c.g) + h(c.b);
  };

  /** RGB（0..255）→ HSV（h: 0..360、s / v: 0..100）。小数のまま返す。 */
  const rgbToHsv = function (c) {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    return { h, s: s * 100, v: max * 100 };
  };

  /** HSV（h: 0..360、s / v: 0..100）→ RGB（整数 0..255）。 */
  const hsvToRgb = function (c) {
    const h = (((c.h % 360) + 360) % 360) / 60;
    const s = clamp01(c.s / 100), v = clamp01(c.v / 100);
    const i = Math.floor(h), f = h - i;
    const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    const [r, g, b] = [
      [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
    ][i % 6];
    return { r: to255(r), g: to255(g), b: to255(b) };
  };

  const modeFn = {
    screen: (b, l) => 1 - (1 - b) * (1 - l),
    overlay: (b, l) => (b < 0.5 ? 2 * b * l : 1 - 2 * (1 - b) * (1 - l)),
  };

  const assertMode = function (mode) {
    if (!modeFn[mode]) throw new Error("unknown blend mode: " + mode);
  };

  /** 1 チャンネルぶんの逆算：層 l（0..1）を不透明度 a で乗せて t（0..1）になる下地 b（0..1）を返す。
      解けないときは unreachable を立てる（b は 0..1 に収めた近似）。 */
  const solveBase = function (mode, l, t, a) {
    const tol = a > 0 ? 0.5 / 255 / a : 0;
    const finish = (b) => ({ b: clamp01(b), unreachable: b < -tol || b > 1 + tol });
    if (a === 0) return { b: t, unreachable: false };
    if (mode === "screen") {
      /* t = b(1 - a·l) + a·l */
      const d = 1 - a * l;
      if (d <= 1e-9) return { b: t, unreachable: Math.abs(t - 1) > 1e-6 };
      return finish((t - a * l) / d);
    }
    /* overlay は b < 0.5 と b >= 0.5 の両枝を解き、自分の枝に収まる方を採る。 */
    const d1 = 1 - a + 2 * a * l;
    const d2 = 1 + a - 2 * a * l;
    const b1 = d1 > 1e-9 ? t / d1 : null;
    const b2 = d2 > 1e-9 ? (t - a * (2 * l - 1)) / d2 : null;
    if (b1 !== null && b1 < 0.5) return finish(b1);
    if (b2 !== null && b2 >= 0.5) return finish(b2);
    if (b1 === null) return { b: Math.min(t, 0.5), unreachable: Math.abs(t) > 1e-6 && t < 0.5 - 1e-6 && b2 === null };
    if (b2 === null) return { b: Math.max(t, 0.5), unreachable: Math.abs(t - 1) > 1e-6 && t >= 0.5 && b1 === null };
    return finish(b1 < 0.5 ? b1 : b2);
  };

  /** 画像にかけるためのチャンネル別の変換表。direction は "apply"（画像を下地にして合成）か "undo"（乗せた層を外す）。
      返り値は { tables: [r, g, b]（Uint8ClampedArray(256)）, unreachable: [r, g, b]（Uint8Array(256)） }。 */
  const blendTables = function (mode, layer, opacity, direction) {
    assertMode(mode);
    const a = clamp01(opacity / 100);
    const f = modeFn[mode];
    const tables = [], unreachable = [];
    for (const l255 of [layer.r, layer.g, layer.b]) {
      const l = l255 / 255;
      const t = new Uint8ClampedArray(256);
      const u = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        const x = v / 255;
        if (direction === "undo") {
          const r = solveBase(mode, l, x, a);
          t[v] = to255(r.b);
          u[v] = r.unreachable ? 1 : 0;
        } else {
          t[v] = to255(x * (1 - a) + f(x, l) * a);
        }
      }
      tables.push(t);
      unreachable.push(u);
    }
    return { tables, unreachable };
  };

  /** RGBA の画素列に blendTables の表を引いて新しい画素列を返す。アルファはそのまま。
      返り値は { data, unreachable: 到達不能だった画素の数 }。 */
  const applyTables = function (data, tables, unreachable) {
    const out = new Uint8ClampedArray(data.length);
    const [tr, tg, tb] = tables;
    const [ur, ug, ub] = unreachable;
    let bad = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      out[i] = tr[r]; out[i + 1] = tg[g]; out[i + 2] = tb[b]; out[i + 3] = data[i + 3];
      if (ur[r] | ug[g] | ub[b]) bad++;
    }
    return { data: out, unreachable: bad };
  };

  /** RGBA の画素列から頻出色を上位 n 件、{hex, ratio}（ratio は 0..1）で返す。
      4 bit 量子化のヒストグラムを多い順に見て、採用済みの色と近いビンはそこへ統合する。アルファ 0 の画素は数えない。 */
  const frequentColors = function (data, width, height, n = FREQUENT_COUNT) {
    const shift = 8 - QUANT_BITS;
    const bins = new Map();
    let total = 0;
    const len = Math.min(data.length, width * height * 4);
    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> shift) << (QUANT_BITS * 2)) | ((g >> shift) << QUANT_BITS) | (b >> shift);
      let bin = bins.get(key);
      if (!bin) {
        bin = { count: 0, r: 0, g: 0, b: 0 };
        bins.set(key, bin);
      }
      bin.count++;
      bin.r += r; bin.g += g; bin.b += b;
      total++;
    }
    if (total === 0) return [];

    const sorted = Array.from(bins.values()).sort((x, y) => y.count - x.count);
    const picked = [];
    const mean = (p) => ({ r: p.r / p.count, g: p.g / p.count, b: p.b / p.count });
    const dist = (p, q) => Math.hypot(p.r - q.r, p.g - q.g, p.b - q.b);
    for (const bin of sorted) {
      const m = mean(bin);
      let near = null;
      let nearD = Infinity;
      for (const p of picked) {
        const d = dist(m, mean(p));
        if (d < MERGE_DISTANCE && d < nearD) {
          near = p;
          nearD = d;
        }
      }
      if (near) {
        near.count += bin.count;
        near.r += bin.r; near.g += bin.g; near.b += bin.b;
      } else {
        picked.push({ count: bin.count, r: bin.r, g: bin.g, b: bin.b });
      }
    }
    picked.sort((x, y) => y.count - x.count);
    return picked.slice(0, n).map((p) => ({ hex: toHex(mean(p)), ratio: p.count / total }));
  };

  /** (x, y) を中心とした size × size の画素の RGB 平均。範囲は画像の中にクリップし、アルファは見ない。 */
  const averageColor = function (data, width, height, x, y, size) {
    const half = Math.floor(size / 2);
    const x0 = Math.max(0, x - half), x1 = Math.min(width - 1, x + half);
    const y0 = Math.max(0, y - half), y1 = Math.min(height - 1, y + half);
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const i = (yy * width + xx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
        n++;
      }
    }
    if (n === 0) return null;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  };

  /** 名前を MAX_NAME_LEN 文字（code point）で切る。入力中に使うので空白は落とさない。 */
  const clipName = function (name) {
    if (typeof name !== "string") return "";
    return Array.from(name).slice(0, MAX_NAME_LEN).join("");
  };

  /** 色の名前を正規化する。文字列でなければ空、前後の空白を落として MAX_NAME_LEN 文字で切る。 */
  const normalizeName = function (name) {
    if (typeof name !== "string") return "";
    return clipName(name.trim());
  };

  /** 保存されていたパレットを [{hex, name}] にする。各要素は "#rrggbb"（旧形式）か {hex, name}。
      hex の重複は先勝ち、MAX_PALETTE 件まで。 */
  const normalizePalette = function (raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const v of raw) {
      const src = typeof v === "string" ? { hex: v, name: "" } : v;
      if (!src || typeof src !== "object") continue;
      const c = parseHex(src.hex);
      if (!c) continue;
      const hex = toHex(c);
      if (out.some((p) => p.hex === hex)) continue;
      out.push({ hex, name: normalizeName(src.name) });
      if (out.length >= MAX_PALETTE) break;
    }
    return out;
  };

  return { MAX_PALETTE, MAX_NAME_LEN, SAMPLE_SIZES, BLEND_MODES, FREQUENT_COUNT, parseHex, hexMistyped, toHex, rgbToHsv, hsvToRgb, blendTables, applyTables, frequentColors, averageColor, clipName, normalizeName, normalizePalette };
})();

/* パレット / 画像の PNG 化とダウンロード、クリップボード。 */
const IO = (() => {
  const PAD = 24;
  const ROW = 48;
  const SWATCH = 36;
  const GAP = 16;
  const MIN_WIDTH = 360;
  const SCALE = 2;

  const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/png");
  });

  /** palette（[{hex, name}]）を縦一列（スウォッチ・HEX・名前）の PNG にする。色とフォントは theme で受け取る。 */
  const paletteToBlob = async function (palette, theme) {
    const hexFont = `15px ${theme.fontMono}`;
    const nameFont = `14px ${theme.fontSans}`;
    if (document.fonts && document.fonts.load) {
      try {
        await Promise.all([document.fonts.load(hexFont), document.fonts.load(nameFont)]);
      } catch (e) {
        /* 読めなくても代替フォントで描く。 */
      }
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = hexFont;
    const hexWidth = Math.max(0, ...palette.map((p) => ctx.measureText(p.hex).width));
    ctx.font = nameFont;
    const nameWidth = Math.max(0, ...palette.map((p) => (p.name ? ctx.measureText(p.name).width : 0)));
    const width = Math.ceil(Math.max(MIN_WIDTH, PAD * 2 + SWATCH + GAP + hexWidth + (nameWidth > 0 ? GAP + nameWidth : 0)));
    const height = PAD * 2 + ROW * Math.max(1, palette.length);

    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "middle";
    palette.forEach((p, i) => {
      const top = PAD + ROW * i + (ROW - SWATCH) / 2;
      const mid = PAD + ROW * i + ROW / 2;
      ctx.fillStyle = p.hex;
      ctx.fillRect(PAD, top, SWATCH, SWATCH);
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD + 0.5, top + 0.5, SWATCH - 1, SWATCH - 1);
      const x = PAD + SWATCH + GAP;
      ctx.fillStyle = theme.text;
      ctx.font = hexFont;
      ctx.fillText(p.hex, x, mid);
      if (p.name) {
        ctx.font = nameFont;
        ctx.fillText(p.name, x + hexWidth + GAP, mid);
      }
    });
    return canvasToBlob(canvas);
  };

  /** 保存するファイル名（<prefix>-YYYYMMDD-HHMMSS.png）。 */
  const timestampName = function (prefix, date = new Date()) {
    const n = (v) => String(v).padStart(2, "0");
    return `${prefix}-${date.getFullYear()}${n(date.getMonth() + 1)}${n(date.getDate())}-${n(date.getHours())}${n(date.getMinutes())}${n(date.getSeconds())}.png`;
  };

  /** Blob をファイルとしてダウンロードさせる。blob: URL は <a download> で落とすだけで <img> には入れない。 */
  const downloadBlob = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const copyText = (text) => navigator.clipboard.writeText(text);

  return { canvasToBlob, paletteToBlob, timestampName, downloadBlob, copyText };
})();

/* アイコン（JS が組み立てる DOM で使う分）。24px グリッド・線 2px・stroke は currentColor（CSS）。 */
const ICONS = {
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
};
const icon = (name) => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";

/* 以下、DOM 配線。
   画像の読み込みと canvas、スポイト、頻出色、現在色と HSV スライダー、パレット（localStorage）、画像への合成。 */
const STORE_KEY = "yoshinamoe.colorpicker.v1";
/** 元画像を保持する canvas の最長辺。これより大きい画像は縮小してから画素を読む。 */
const MAX_SIDE = 4096;
/** 頻出色を数える縮小画像の最長辺。 */
const THUMB_SIDE = 128;
/** 「クリア」の確認が戻るまでの時間。 */
const CLEAR_CONFIRM_MS = 3000;
/** 吹き出しを出しておく時間。 */
const POP_MS = 2000;
const HEX_ERROR = "HEX は 3 桁か 6 桁の 16 進数で入れてください。";

const store = {
  load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {
      return null;
    }
  },
  save(v) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(v));
    } catch (e) {
      /* 保存できなくても画面は動かす（プライベートモード等）。 */
    }
  },
};

(function () {
  const $ = (id) => document.getElementById(id);
  const el = {};
  for (const id of [
    "cp_info", "cp_image_save", "cp_remove", "cp_frame", "cp_canvas", "cp_drop", "cp_file",
    "cp_loupe", "cp_loupe_sw", "cp_loupe_hex", "cp_warn", "cp_warn_text", "cp_frequent",
    "cp_swatch", "cp_hex", "cp_copy", "cp_hold", "cp_rgb", "cp_hsv_text", "cp_h", "cp_s", "cp_v",
    "cp_palette_copy", "cp_palette_save", "cp_palette_clear", "cp_palette_empty", "cp_palette",
    "cp_blend_state", "cp_blend_mini", "cp_blend_summary", "cp_image_blend", "cp_opacity",
    "cp_layer_sw", "cp_layer_hex", "cp_layer_take",
  ]) el[id] = $(id);

  // ================================= 状態

  const saved = store.load();
  const gray = { r: 128, g: 128, b: 128 };
  const state = {
    image: null, /* ImageData（元画像。最長辺 MAX_SIDE まで） */
    view: null, /* 表示している ImageData。合成を画像にかけていなければ image と同じ参照 */
    frequent: [],
    sample: 1,
    current: { ...gray },
    hsv: C.rgbToHsv(gray),
    palette: C.normalizePalette(saved && saved.palette),
    blend: { on: false, direction: "apply", mode: "screen", opacity: 100, layer: { ...gray } },
  };

  const save = () => store.save({ palette: state.palette });
  const hasColor = (hex) => state.palette.some((p) => p.hex === hex);

  // ================================= 吹き出し

  /* ボタン・入力欄の .cp-anchor に結果やエラーを 2 秒だけ出す。 */
  const pop = function (target, text, err) {
    const anchor = target.closest(".cp-anchor");
    if (!anchor) return;
    let node = anchor.querySelector(".cp-pop.is-flash");
    if (!node) {
      node = document.createElement("span");
      node.className = "cp-pop is-flash";
      anchor.append(node);
    }
    node.classList.toggle("is-err", !!err);
    node.setAttribute("role", err ? "alert" : "status");
    node.innerHTML = err ? icon("error") : "";
    node.append(text);
    clearTimeout(node._timer);
    node._timer = setTimeout(() => node.remove(), POP_MS);
  };

  /* HEX 欄の検証。読めなければ枠を赤くし、打ち間違いのときだけ文言を出す。 */
  const markHex = function (input, value) {
    const ok = !!C.parseHex(value);
    input.classList.toggle("is-invalid", !ok);
    const anchor = input.closest(".cp-anchor");
    let node = anchor.querySelector(".cp-pop.is-hex");
    if (!ok && C.hexMistyped(value)) {
      if (!node) {
        node = document.createElement("span");
        node.className = "cp-pop is-err at-start is-hex";
        node.setAttribute("role", "alert");
        node.innerHTML = icon("error");
        node.append(HEX_ERROR);
        anchor.append(node);
      }
    } else if (node) {
      node.remove();
    }
  };
  const unmarkHex = function (input) {
    input.classList.remove("is-invalid");
    const node = input.closest(".cp-anchor").querySelector(".cp-pop.is-hex");
    if (node) node.remove();
  };

  // ================================= 描画

  const renderCurrent = function () {
    const hex = C.toHex(state.current);
    el.cp_swatch.style.background = hex;
    if (document.activeElement !== el.cp_hex) el.cp_hex.value = hex;
    el.cp_rgb.textContent = `rgb(${state.current.r}, ${state.current.g}, ${state.current.b})`;
    el.cp_hsv_text.textContent = `hsv(${Math.round(state.hsv.h)}°, ${Math.round(state.hsv.s)}%, ${Math.round(state.hsv.v)}%)`;
    for (const [input, key] of [[el.cp_h, "h"], [el.cp_s, "s"], [el.cp_v, "v"]]) {
      const v = Math.round(state.hsv[key]);
      input.value = String(v);
      input.nextElementSibling.textContent = key === "h" ? v + "°" : v + "%";
    }
    /* H の溝は今の S・V での色相の帯、S・V はそれぞれの端の色。 */
    const at = (h, s, v) => C.toHex(C.hsvToRgb({ h, s, v }));
    const { h, s, v } = state.hsv;
    el.cp_h.style.background = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((x) => at(x, s, v)).join(", ")})`;
    el.cp_s.style.background = `linear-gradient(to right, ${at(h, 0, v)}, ${at(h, 100, v)})`;
    el.cp_v.style.background = `linear-gradient(to right, ${at(h, s, 0)}, ${at(h, s, 100)})`;
    const held = hasColor(hex);
    el.cp_hold.disabled = held;
    el.cp_hold.querySelector(".btn__text").textContent = held ? "追加済み" : "パレットに追加";
  };

  const setCurrentRgb = function (c) {
    if (!c) return;
    state.current = { r: c.r, g: c.g, b: c.b };
    state.hsv = C.rgbToHsv(state.current);
    renderCurrent();
  };

  const setCurrentHsv = function (hsv) {
    state.hsv = hsv;
    state.current = C.hsvToRgb(hsv);
    renderCurrent();
  };

  const renderPalette = function () {
    el.cp_palette.replaceChildren();
    for (const entry of state.palette) {
      const hex = entry.hex;
      const li = document.createElement("li");
      li.className = "cp-prow";

      const sw = document.createElement("button");
      sw.type = "button";
      sw.className = "cp-chip-sw tip";
      sw.dataset.tip = "現在色にする";
      sw.dataset.align = "start";
      sw.style.background = hex;
      sw.setAttribute("aria-label", hex + " を現在色にする");
      sw.addEventListener("click", () => setCurrentRgb(C.parseHex(hex)));

      const label = document.createElement("span");
      label.className = "cp-prow-hex";
      label.textContent = hex;

      const name = document.createElement("input");
      name.type = "text";
      name.className = "in cp-name";
      name.maxLength = C.MAX_NAME_LEN;
      name.spellcheck = false;
      name.autocomplete = "off";
      name.value = entry.name;
      name.setAttribute("aria-label", hex + " の名前");
      /* 打ったらすぐ保存する。再描画するとフォーカスが外れるのでしない。 */
      name.addEventListener("input", () => {
        entry.name = C.clipName(name.value);
        save();
      });
      name.addEventListener("blur", () => {
        entry.name = C.normalizeName(entry.name);
        name.value = entry.name;
        save();
      });

      const x = document.createElement("button");
      x.type = "button";
      x.className = "btn icon tip";
      x.dataset.tip = "削除";
      x.dataset.align = "end";
      x.innerHTML = icon("trash");
      x.setAttribute("aria-label", hex + " を削除");
      x.addEventListener("click", () => {
        state.palette = state.palette.filter((p) => p.hex !== hex);
        save();
        renderPalette();
        renderCurrent();
      });

      li.append(sw, label, name, x);
      el.cp_palette.append(li);
    }
    const empty = state.palette.length === 0;
    el.cp_palette_empty.hidden = !empty;
    el.cp_palette_copy.disabled = empty;
    el.cp_palette_save.disabled = empty;
    el.cp_palette_clear.disabled = empty;
  };

  const renderFrequent = function () {
    el.cp_frequent.replaceChildren();
    const n = state.frequent.length;
    el.cp_frequent.classList.toggle("is-empty", n === 0);
    state.frequent.forEach((f, i) => {
      const pct = (f.ratio * 100).toFixed(f.ratio < 0.1 ? 1 : 0) + "%";
      const seg = document.createElement("button");
      seg.type = "button";
      seg.className = "cp-freq-seg tip";
      seg.dataset.tip = f.hex + " / " + pct;
      if (n > 1 && i === 0) seg.dataset.align = "start";
      if (n > 1 && i === n - 1) seg.dataset.align = "end";
      seg.style.flex = `${Math.max(1, Math.round(f.ratio * 1000))} 1 0px`;
      seg.style.background = f.hex;
      seg.setAttribute("aria-label", `${f.hex}（${pct}）を現在色にする`);
      seg.addEventListener("click", () => setCurrentRgb(C.parseHex(f.hex)));
      el.cp_frequent.append(seg);
    });
  };

  const renderBlend = function () {
    const b = state.blend;
    const hex = C.toHex(b.layer);
    el.cp_layer_sw.style.background = hex;
    el.cp_blend_mini.style.background = hex;
    if (document.activeElement !== el.cp_layer_hex) el.cp_layer_hex.value = hex;
    el.cp_opacity.value = String(b.opacity);
    el.cp_opacity.nextElementSibling.textContent = b.opacity + "%";
    el.cp_blend_summary.textContent = (b.mode === "overlay" ? "オーバーレイ" : "スクリーン") + " " + b.opacity + "%";
    const on = b.on && !!state.image;
    el.cp_blend_state.hidden = !on;
    el.cp_blend_state.textContent = b.direction === "undo" ? "逆算中" : "適用中";
    el.cp_image_blend.checked = on;
    el.cp_image_blend.disabled = !state.image;
    if (on) scheduleRenderImage();
  };

  /* 合成の設定を画像に反映して描き直す。表示用の view を決め、canvas・頻出色・警告を更新する。
     スポイトと頻出色は view（見えている方）から取る。 */
  const renderImage = function () {
    if (!state.image) return;
    const { width, height } = state.image;
    const b = state.blend;
    let bad = 0;
    if (b.on) {
      const t = C.blendTables(b.mode, b.layer, b.opacity, b.direction);
      const r = C.applyTables(state.image.data, t.tables, t.unreachable);
      state.view = new ImageData(r.data, width, height);
      bad = r.unreachable;
    } else {
      state.view = state.image;
    }
    el.cp_canvas.width = width;
    el.cp_canvas.height = height;
    el.cp_canvas.getContext("2d").putImageData(state.view, 0, 0);
    const [tw, th] = fit(width, height, THUMB_SIDE);
    state.frequent = C.frequentColors(rasterize(el.cp_canvas, tw, th).data, tw, th);
    renderFrequent();
    el.cp_warn.hidden = bad === 0;
    el.cp_warn_text.textContent = bad > 0 ? `逆算できない画素が ${bad.toLocaleString()} 個あり、近い色で表示しています。` : "";
  };

  /* 大きい画像でスライダーを動かすと 1 回が数十 ms かかるので、1 フレームに 1 回にまとめる。 */
  let imageRenderQueued = false;
  const scheduleRenderImage = function () {
    if (imageRenderQueued) return;
    imageRenderQueued = true;
    requestAnimationFrame(() => {
      imageRenderQueued = false;
      renderImage();
    });
  };

  // ================================= 画像

  const readViaDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const decode = async function (file) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file);
      } catch (e) {
        /* 対応していない形式などは data: URL 経由で試す。 */
      }
    }
    return readViaDataURL(file);
  };

  /** 画像を w×h に描いて ImageData を返す。 */
  const rasterize = function (src, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };

  const fit = function (w, h, side) {
    const scale = Math.min(1, side / Math.max(w, h));
    return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
  };

  const setInfo = function (text, err) {
    el.cp_info.textContent = text;
    el.cp_info.classList.toggle("is-err", !!err);
  };

  const setImageUi = function (has) {
    el.cp_canvas.hidden = !has;
    el.cp_drop.hidden = has;
    el.cp_frame.classList.toggle("is-empty", !has);
    el.cp_image_save.disabled = !has;
    el.cp_remove.disabled = !has;
  };

  const loadImage = async function (file) {
    if (!file || !/^image\//.test(file.type)) {
      setInfo("画像ファイルではありません。", true);
      return;
    }
    setInfo("読み込み中…");
    let src;
    try {
      src = await decode(file);
    } catch (e) {
      setInfo("この画像は読み込めませんでした。", true);
      return;
    }
    const srcW = src.naturalWidth || src.width, srcH = src.naturalHeight || src.height;
    const [w, h] = fit(srcW, srcH, MAX_SIDE);
    state.image = rasterize(src, w, h);
    if (src.close) src.close();
    setImageUi(true);
    setInfo(`${srcW} × ${srcH}`);
    renderImage();
    renderBlend();
  };

  /** 画像を外して添付領域を元に戻す。パレットや現在色は触らない。 */
  const removeImage = function () {
    state.image = null;
    state.view = null;
    state.frequent = [];
    state.blend.on = false;
    el.cp_canvas.width = 0; /* 画素を手放す */
    el.cp_canvas.height = 0;
    el.cp_warn.hidden = true;
    setImageUi(false);
    setInfo("");
    showHover(null);
    renderFrequent();
    renderBlend();
  };
  el.cp_remove.addEventListener("click", removeImage);

  el.cp_file.addEventListener("change", () => {
    if (el.cp_file.files[0]) loadImage(el.cp_file.files[0]);
    el.cp_file.value = "";
  });

  for (const ev of ["dragenter", "dragover"]) {
    el.cp_frame.addEventListener(ev, (e) => {
      e.preventDefault();
      el.cp_frame.classList.add("is-over");
    });
  }
  el.cp_frame.addEventListener("dragleave", (e) => {
    if (!el.cp_frame.contains(e.relatedTarget)) el.cp_frame.classList.remove("is-over");
  });
  el.cp_frame.addEventListener("drop", (e) => {
    e.preventDefault();
    el.cp_frame.classList.remove("is-over");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImage(file);
  });

  document.addEventListener("paste", (e) => {
    if (!e.clipboardData) return;
    for (const item of e.clipboardData.items) {
      if (/^image\//.test(item.type)) {
        e.preventDefault();
        loadImage(item.getAsFile());
        return;
      }
    }
  });

  el.cp_image_save.addEventListener("click", async () => {
    if (!state.image) return;
    try {
      IO.downloadBlob(await IO.canvasToBlob(el.cp_canvas), IO.timestampName(state.blend.on ? "composite" : "image"));
    } catch (e) {
      pop(el.cp_image_save, "画像を作れませんでした。", true);
    }
  });

  // ================================= スポイト

  /** ポインタの位置を元画像の画素座標に直す。画像の外なら null。 */
  const pixelAt = function (e) {
    const rect = el.cp_canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.floor((e.clientX - rect.left) * el.cp_canvas.width / rect.width);
    const y = Math.floor((e.clientY - rect.top) * el.cp_canvas.height / rect.height);
    if (x < 0 || y < 0 || x >= el.cp_canvas.width || y >= el.cp_canvas.height) return null;
    return { x, y };
  };

  const sampleAt = function (e) {
    if (!state.view) return null;
    const p = pixelAt(e);
    if (!p) return null;
    return C.averageColor(state.view.data, state.view.width, state.view.height, p.x, p.y, state.sample);
  };

  /* 枠の左上に、ポインタの下の色を出す（位置はポインタに追従させない）。 */
  const showHover = function (c) {
    el.cp_loupe.hidden = !c;
    if (!c) return;
    const hex = C.toHex(c);
    el.cp_loupe_sw.style.background = hex;
    el.cp_loupe_hex.textContent = hex;
  };

  /* 押して離した位置の色を取る。押している間はプレビューだけ更新する。 */
  let pressing = false;
  el.cp_canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !state.image) return;
    e.preventDefault();
    pressing = true;
    el.cp_canvas.setPointerCapture(e.pointerId);
    showHover(sampleAt(e));
  });
  el.cp_canvas.addEventListener("pointermove", (e) => showHover(sampleAt(e)));
  el.cp_canvas.addEventListener("pointerup", (e) => {
    if (!pressing) return;
    pressing = false;
    setCurrentRgb(sampleAt(e));
  });
  el.cp_canvas.addEventListener("pointercancel", () => { pressing = false; });
  el.cp_canvas.addEventListener("pointerleave", () => { if (!pressing) showHover(null); });

  for (const radio of document.querySelectorAll("input[name=cp_sample]")) {
    radio.addEventListener("change", () => {
      const n = Number(radio.value);
      if (C.SAMPLE_SIZES.includes(n)) state.sample = n;
    });
  }

  // ================================= 現在色

  const copyText = async function (text, button) {
    try {
      await IO.copyText(text);
      pop(button, "コピーしました");
    } catch (e) {
      pop(button, "コピーできませんでした。ブラウザの権限を確かめてください。", true);
    }
  };

  const holdCurrent = function () {
    const hex = C.toHex(state.current);
    if (hasColor(hex)) return;
    if (state.palette.length >= C.MAX_PALETTE) {
      pop(el.cp_hold, `パレットは ${C.MAX_PALETTE} 色までです。`, true);
      return;
    }
    state.palette = [...state.palette, { hex, name: "" }];
    save();
    renderPalette();
    renderCurrent();
  };

  el.cp_hold.addEventListener("click", holdCurrent);
  el.cp_swatch.addEventListener("click", holdCurrent);
  el.cp_copy.addEventListener("click", () => copyText(C.toHex(state.current), el.cp_copy));

  el.cp_hex.addEventListener("input", () => {
    markHex(el.cp_hex, el.cp_hex.value);
    const c = C.parseHex(el.cp_hex.value);
    if (c) setCurrentRgb(c);
  });
  el.cp_hex.addEventListener("blur", () => {
    unmarkHex(el.cp_hex);
    el.cp_hex.value = C.toHex(state.current);
  });

  for (const [input, key] of [[el.cp_h, "h"], [el.cp_s, "s"], [el.cp_v, "v"]]) {
    input.addEventListener("input", () => setCurrentHsv({ ...state.hsv, [key]: Number(input.value) }));
  }

  // ================================= パレット

  el.cp_palette_copy.addEventListener("click", () => copyText(state.palette.map((p) => p.hex).join("\n"), el.cp_palette_copy));

  /* 画像で保存。色とフォントはページの CSS カスタムプロパティから取る（ライト / ダークに追従）。 */
  el.cp_palette_save.addEventListener("click", async () => {
    if (state.palette.length === 0) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (css.getPropertyValue(name) || "").trim() || fallback;
    try {
      const blob = await IO.paletteToBlob(state.palette, {
        bg: v("--bg", "#f7f7f8"),
        text: v("--text", "#17181c"),
        line: v("--border", "#e3e5e8"),
        fontSans: v("--font-sans", "sans-serif"),
        fontMono: v("--font-mono", "monospace"),
      });
      IO.downloadBlob(blob, IO.timestampName("palette"));
    } catch (e) {
      pop(el.cp_palette_save, "画像を作れませんでした。", true);
    }
  });

  let clearArmed = null;
  const clearText = el.cp_palette_clear.querySelector(".btn__text");
  el.cp_palette_clear.addEventListener("click", () => {
    if (clearArmed) {
      clearTimeout(clearArmed);
      clearArmed = null;
      clearText.textContent = "クリア";
      state.palette = [];
      save();
      renderPalette();
      renderCurrent();
      return;
    }
    clearText.textContent = "もう一度押すと消去";
    clearArmed = setTimeout(() => {
      clearArmed = null;
      clearText.textContent = "クリア";
    }, CLEAR_CONFIRM_MS);
  });

  // ================================= 合成

  el.cp_image_blend.addEventListener("change", () => {
    state.blend.on = el.cp_image_blend.checked && !!state.image;
    renderBlend();
    if (!state.blend.on) renderImage();
  });
  for (const radio of document.querySelectorAll("input[name=cp_direction]")) {
    radio.addEventListener("change", () => {
      state.blend.direction = radio.value === "undo" ? "undo" : "apply";
      renderBlend();
    });
  }
  for (const radio of document.querySelectorAll("input[name=cp_mode]")) {
    radio.addEventListener("change", () => {
      if (C.BLEND_MODES.includes(radio.value)) state.blend.mode = radio.value;
      renderBlend();
    });
  }
  el.cp_opacity.addEventListener("input", () => {
    state.blend.opacity = Math.min(100, Math.max(0, Number(el.cp_opacity.value) || 0));
    renderBlend();
  });
  el.cp_layer_sw.addEventListener("click", () => setCurrentRgb(state.blend.layer));
  el.cp_layer_take.addEventListener("click", () => {
    state.blend.layer = { ...state.current };
    renderBlend();
  });
  el.cp_layer_hex.addEventListener("input", () => {
    markHex(el.cp_layer_hex, el.cp_layer_hex.value);
    const c = C.parseHex(el.cp_layer_hex.value);
    if (c) {
      state.blend.layer = c;
      renderBlend();
    }
  });
  el.cp_layer_hex.addEventListener("blur", () => {
    unmarkHex(el.cp_layer_hex);
    el.cp_layer_hex.value = C.toHex(state.blend.layer);
  });

  // ================================= 初期描画

  renderCurrent();
  renderPalette();
  renderFrequent();
  renderBlend();
})();
