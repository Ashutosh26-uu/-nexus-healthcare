// Code 128 (subset B) encoder — printable ASCII 32–126, enough for sample IDs like "S-BD-261016-001".
// Written by hand so labels need no barcode library. Each pattern lists bar/space widths in modules,
// starting with a bar; every symbol is 11 modules wide, the stop symbol 13 (it carries the final bar).
export const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
export const START_B = 104;
export const STOP = 106;
export const QUIET = 10; // modules of white space each side, so scanners find the edges

// Symbol values: start B, one per character (ASCII − 32), mod-103 checksum, stop.
export function code128Values(text) {
  const s = String(text ?? '');
  if (!s.length) throw new Error('Nothing to encode');
  const data = [...s].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`Code 128-B can't encode "${ch}"`);
    return c - 32;
  });
  const check = data.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
  return [START_B, ...data, check, STOP];
}

// Bars as { x, w } in modules (spaces implied), plus the total width including quiet zones.
export function code128Bars(text) {
  const bars = [];
  let x = QUIET;
  for (const v of code128Values(text)) {
    [...PATTERNS[v]].forEach((d, i) => {
      const w = Number(d);
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    });
  }
  return { bars, width: x + QUIET };
}

// Inline SVG markup (viewBox in modules; stretch it to any print width). Numbers only — safe to inject.
export function code128Svg(text, { height = 40, title = '' } = {}) {
  const { bars, width } = code128Bars(text);
  const rects = bars.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="${height}"/>`).join('');
  const label = String(title).replace(/[^\w .:-]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barcode ${label}"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
