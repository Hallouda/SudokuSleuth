// Generates the Google Play graphic assets from the app's own grid mark:
//   assets/play/icon-512.png        512x512, app icon (Play "App icon")
//   assets/play/feature-1024x500.png   feature graphic (24-bit, no alpha)
//
// Run: node scripts/gen-store-assets.js   (needs the `sharp` dep, already
// present via @capacitor/assets). Colours match assets/logo.svg / the
// in-game guess-feedback palette.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'assets', 'play');
fs.mkdirSync(OUT, { recursive: true });

const BG = '#121213';
const BLUE = '#5b8def';
const GREEN = '#4c8c4a';
const YELLOW = '#b8a13a';
const EMPTY = '#232326';
const EMPTY_STROKE = '#4a4a4e';

// A 3x3 grid mark filling `size` px, with the blue/green/yellow diagonal.
function gridMark(size, margin) {
  const area = size - margin * 2;
  const gap = Math.round(area * 0.047);
  const cell = (area - gap * 2) / 3;
  const r = Math.round(cell * 0.14);
  const pos = (i) => margin + i * (cell + gap);
  const diag = { '0,0': BLUE, '1,1': GREEN, '2,2': YELLOW };
  let rects = '';
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const fill = diag[`${row},${col}`];
      rects += fill
        ? `<rect x="${pos(col)}" y="${pos(row)}" width="${cell}" height="${cell}" rx="${r}" fill="${fill}"/>`
        : `<rect x="${pos(col)}" y="${pos(row)}" width="${cell}" height="${cell}" rx="${r}" fill="${EMPTY}" stroke="${EMPTY_STROKE}" stroke-width="${Math.max(2, Math.round(cell * 0.02))}"/>`;
    }
  }
  return rects;
}

async function icon() {
  const size = 512;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="${BG}"/>
    ${gridMark(size, 46)}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, 'icon-512.png'));
  console.log('assets/play/icon-512.png');
}

async function feature() {
  const w = 1024;
  const h = 500;
  const mark = 300;
  const markX = 132;
  const markY = (h - mark) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${BG}"/>
    <g transform="translate(${markX} ${markY})">${gridMark(mark, 0)}</g>
    <text x="520" y="222" font-family="Arial, Helvetica, sans-serif" font-size="90" font-weight="800" fill="#ffffff" letter-spacing="1.5">SUDOKU</text>
    <text x="520" y="318" font-family="Arial, Helvetica, sans-serif" font-size="90" font-weight="800" fill="#ffffff" letter-spacing="1.5">SLEUTH</text>
    <text x="523" y="378" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="400" fill="#9aa0a6">Guess the grid. Read the clues.</text>
  </svg>`;
  // Flatten + drop alpha: Play requires a 24-bit feature graphic.
  await sharp(Buffer.from(svg))
    .flatten({ background: BG })
    .removeAlpha()
    .png()
    .toFile(path.join(OUT, 'feature-1024x500.png'));
  console.log('assets/play/feature-1024x500.png');
}

(async () => {
  await icon();
  await feature();
})();
