import QRCode from 'qrcode';
/** Calm two-colour building illustrations, used when an owner has not uploaded photos. */
const PALETTES = [
  ['#E8EAFD', '#C9CEF8', '#4F5BEA'], ['#E4F0F6', '#BFDCEA', '#2F7BA0'], ['#EEF0F5', '#D6DAE6', '#5B6280'],
  ['#F4EDE6', '#E3D2C0', '#9A6B43'], ['#E6F2EC', '#C3E1D1', '#2F7D5B'], ['#F1E9F6', '#DCC9EA', '#7A4FA0'],
  ['#F6EAEA', '#EBCACA', '#A04848'], ['#EAF0E4', '#CFDDBE', '#5B7A33'],
];
export function hostelArt(seed: number, floors = 3, cols = 5) {
  const [bg, mid, ink] = PALETTES[seed % PALETTES.length]!;
  const w = 400, h = 260, bw = 60 + cols * 34, bx = (w - bw) / 2, fh = 36, by = 222 - floors * fh;
  let win = '';
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const lit = ((seed * 7 + f * 3 + c * 5) % 5) === 0;
    win += `<rect x="${bx + 24 + c * 34}" y="${by + 10 + f * fh}" width="20" height="20" rx="4" fill="${ink}" opacity="${lit ? .55 : .16}"/>`;
  }
  return `<svg class="art-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Hostel illustration" width="100%" height="100%">
    <rect width="${w}" height="${h}" fill="${bg}"/>
    <rect x="0" y="222" width="${w}" height="38" fill="${mid}"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="${floors * fh + 4}" rx="6" fill="#FFFFFF"/>
    <rect x="${bx - 6}" y="${by - 10}" width="${bw + 12}" height="12" rx="4" fill="${ink}" opacity=".85"/>
    ${win}
    <rect x="${w / 2 - 13}" y="${222 - 28}" width="26" height="28" rx="4" fill="${ink}" opacity=".8"/>
  </svg>`;
}

/** A real, scannable QR code for `text`, as an SVG string. */
export function qrSvg(text: string) {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' }); const n = q.modules.size; const d = q.modules.data; const m = 2; let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) path += `M${x + m} ${y + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" width="100%" height="100%" role="img" aria-label="Gate QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#111321"/></svg>`;
}

/** Shrinks an uploaded photo to a 256px square so it stays small. */
export function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const m = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
    img.src = url;
  });
}

/** Shrinks a photo to fit inside `max` pixels, keeping its shape, so it fits in browser storage. */
export function fitImage(file: File, max = 1000, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
    img.src = url;
  });
}
