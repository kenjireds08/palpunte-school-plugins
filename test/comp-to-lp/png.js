/**
 * テスト用の最小 PNG デコーダ（8bit・インターレースなし・カラータイプ 0/2/3/4/6）。
 * mask.mjs の出力と golden（Pillow の出力）を画素単位で比べるために使う。配布物ではない。
 */
const fs = require('node:fs');
const zlib = require('node:zlib');

function decodePng(file) {
  const buf = fs.readFileSync(file);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  sig.forEach((b, i) => {
    if (buf[i] !== b) throw new Error(`PNG ではありません: ${file}`);
  });
  let pos = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0) throw new Error(`未対応の PNG です（bit depth ${depth} / interlace ${interlace}）: ${file}`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error(`未対応のカラータイプ ${ctype}: ${file}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`不明なフィルタ ${f}`);
      out[x] = v & 0xff;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al = 255;
    if (ctype === 6) [r, g, bl, al] = px.subarray(i * 4, i * 4 + 4);
    else if (ctype === 2) [r, g, bl] = px.subarray(i * 3, i * 3 + 3);
    else if (ctype === 0) r = g = bl = px[i];
    else if (ctype === 4) {
      r = g = bl = px[i * 2];
      al = px[i * 2 + 1];
    } else {
      const k = px[i];
      [r, g, bl] = palette.subarray(k * 3, k * 3 + 3);
      if (trns && k < trns.length) al = trns[k];
    }
    rgba.set([r, g, bl, al], i * 4);
  }
  return { w, h, rgba };
}

module.exports = { decodePng };
