/**
 * Gera os assets de marca usados pela aplicação a partir dos PNGs originais
 * enviados pelo cliente (Refs/), que vêm em canvas 2160x2160 com fundo branco
 * chapado e uma leve vinheta nas bordas.
 *
 * O script remove o fundo (near-white -> alpha 0), recorta o bounding box real
 * do conteúdo e exporta versões otimizadas em public/brand:
 *
 *   horn-logo.png      lockup vertical completo (símbolo + wordmark)
 *   horn-mark.png      apenas o símbolo
 *   horn-wordmark.png  apenas a palavra HORN
 *   horn-icon.png      símbolo em canvas quadrado, base dos favicons
 *
 * Uso: node scripts/prepare-brand-assets.mjs
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_DIR = path.join(ROOT, "Refs");
const OUT_DIR = path.join(ROOT, "public", "brand");

/**
 * Distância do branco (0-255) abaixo da qual o pixel é fundo. Precisa ficar
 * acima de ~29 porque os arquivos originais têm uma vinheta suave cobrindo
 * todo o canvas — com um limiar menor o recorte não acontece.
 */
const BG_THRESHOLD = 30;
/** Fim da rampa de antialiasing: acima disso o pixel é 100% opaco. */
const EDGE_THRESHOLD = 52;
/** Margem transparente mantida ao redor do conteúdo, em pixels do original. */
const TRIM_PADDING = 6;

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Lê o PNG original, transforma o fundo branco em transparência e devolve os
 * pixels crus junto com o retângulo ocupado pelo conteúdo.
 */
async function loadWithAlpha(inputFile) {
  const { data, info } = await sharp(path.join(SRC_DIR, inputFile))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  /** Quantidade de pixels visíveis por linha — usado para separar o wordmark. */
  const rowInk = new Uint32Array(height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * channels;
      const distanceFromWhite = 255 - Math.min(data[i], data[i + 1], data[i + 2]);

      let alpha;
      if (distanceFromWhite <= BG_THRESHOLD) {
        alpha = 0;
      } else if (distanceFromWhite >= EDGE_THRESHOLD) {
        alpha = 255;
      } else {
        const t = (distanceFromWhite - BG_THRESHOLD) / (EDGE_THRESHOLD - BG_THRESHOLD);
        alpha = Math.round(t * 255);
      }

      data[i + 3] = alpha;

      if (alpha > 8) {
        rowInk[y] += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    throw new Error(`Nenhum conteúdo encontrado em ${inputFile}`);
  }

  return { data, width, height, channels, rowInk, box: { minX, minY, maxX, maxY } };
}

/** Recorta um retângulo (com padding) dos pixels crus e devolve um sharp. */
function crop({ data, width, height, channels }, { minX, minY, maxX, maxY }) {
  const left = Math.max(0, minX - TRIM_PADDING);
  const top = Math.max(0, minY - TRIM_PADDING);

  return sharp(data, { raw: { width, height, channels } }).extract({
    left,
    top,
    width: Math.min(width - left, maxX - minX + 1 + TRIM_PADDING * 2),
    height: Math.min(height - top, maxY - minY + 1 + TRIM_PADDING * 2),
  });
}

/**
 * Encontra a maior faixa de linhas vazias dentro do conteúdo. No lockup ela
 * corresponde ao respiro entre o símbolo e a palavra HORN.
 */
function findHorizontalGap(rowInk, { minY, maxY }) {
  let best = null;
  let runStart = -1;

  for (let y = minY; y <= maxY + 1; y += 1) {
    const empty = y <= maxY && rowInk[y] === 0;

    if (empty && runStart === -1) {
      runStart = y;
    } else if (!empty && runStart !== -1) {
      const run = { start: runStart, end: y - 1, length: y - runStart };
      if (!best || run.length > best.length) best = run;
      runStart = -1;
    }
  }

  return best;
}

async function emit(image, outputFile, resize) {
  const outputPath = path.join(OUT_DIR, outputFile);
  const info = await image
    .resize({ ...resize, fit: "contain", background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  console.log(
    `${outputFile.padEnd(20)} ${`${info.width}x${info.height}`.padEnd(10)} ${(info.size / 1024).toFixed(1)} kB`,
  );
}

await mkdir(OUT_DIR, { recursive: true });

const lockup = await loadWithAlpha("logo_horn_com_texto.png");
const symbol = await loadWithAlpha("logo_horn.png");

const gap = findHorizontalGap(lockup.rowInk, lockup.box);
if (!gap) {
  throw new Error("Não foi possível separar o wordmark do símbolo no lockup.");
}

// Lockup vertical completo — tela de login.
await emit(crop(lockup, lockup.box), "horn-logo.png", { height: 320 });

// Apenas o símbolo — sidebar recolhida e header mobile.
await emit(crop(symbol, symbol.box), "horn-mark.png", { height: 128 });

// Apenas a palavra HORN, extraída abaixo do respiro do lockup.
await emit(
  crop(lockup, { ...lockup.box, minY: gap.end + 1 }),
  "horn-wordmark.png",
  { height: 64 },
);

// Ícone quadrado do app — Next gera os favicons a partir de src/app/icon.png.
await emit(crop(symbol, symbol.box), "horn-icon.png", {
  width: 448,
  height: 448,
  position: "centre",
});
