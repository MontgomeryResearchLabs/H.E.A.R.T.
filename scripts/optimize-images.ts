/**
 * optimize-images.ts — Build-Time Image Processing
 * ===================================================
 * Recursively scans `/src/assets/images/` for high-resolution source
 * images (JPG, PNG) and generates responsive variants using Sharp:
 *
 *   - **Formats**: WebP (primary), AVIF (progressive), JPG (fallback)
 *   - **Widths**:  400, 800, 1200, 1920 pixels
 *   - **Quality**: 85 for WebP/JPG, 80 for AVIF
 *
 * Output is written to `/dist/assets/images/` mirroring the source
 * directory structure. A manifest JSON file is generated for quick
 * lookup at build time.
 *
 * Usage
 * -----
 * ```bash
 * npm run optimize-images
 * ```
 *
 * Dependencies
 * ------------
 * - sharp (native image processing)
 * - Node.js ≥ 18 (for fs/promises, path, glob)
 */

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

/** Directory containing original high-res images */
const INPUT_DIR = path.resolve('src/assets/images');

/** Output directory for optimised variants */
const OUTPUT_DIR = path.resolve('dist/assets/images');

/** Responsive widths to generate (pixels) */
const WIDTHS = [400, 800, 1200, 1920] as const;

/** Quality settings per output format */
const QUALITY = {
  webp: 85,
  avif: 80,
  jpeg: 85,
} as const;

/** File extensions considered as source images */
const SOURCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ManifestEntry {
  /** Original source path relative to INPUT_DIR */
  original: string;
  /** Generated variants, keyed by "format-width" (e.g. "webp-800") */
  variants: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Main Logic                                                         */
/* ------------------------------------------------------------------ */

/**
 * Recursively finds all image files under the given directory.
 *
 * @param dir - The directory to scan
 * @returns An array of absolute file paths
 */
async function findImages(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    // Directory doesn't exist yet — that's fine
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findImages(fullPath)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Processes a single source image: generates responsive variants in
 * multiple formats and writes them to OUTPUT_DIR.
 *
 * @param srcPath  - Absolute path to the source image
 * @returns A ManifestEntry describing the generated variants
 */
async function processImage(srcPath: string): Promise<ManifestEntry> {
  const relativePath = path.relative(INPUT_DIR, srcPath);
  const parsedPath = path.parse(relativePath);
  const variants: Record<string, string> = {};

  // Read the source image once
  const image = sharp(srcPath);
  const metadata = await image.metadata();
  const sourceWidth = metadata.width ?? 1920;

  for (const width of WIDTHS) {
    // Skip generating a variant wider than the original
    if (width > sourceWidth) continue;

    // Resize once, then encode to each format
    const resized = sharp(srcPath).resize(width, undefined, {
      withoutEnlargement: true,
      fit: 'inside',
    });

    // ---- WebP ----
    const webpFileName = `${parsedPath.name}-${width}w.webp`;
    const webpOutPath = path.join(OUTPUT_DIR, parsedPath.dir, webpFileName);
    await fs.mkdir(path.dirname(webpOutPath), { recursive: true });
    await resized.clone().webp({ quality: QUALITY.webp }).toFile(webpOutPath);
    variants[`webp-${width}`] = path.relative(OUTPUT_DIR, webpOutPath);

    // ---- AVIF ----
    const avifFileName = `${parsedPath.name}-${width}w.avif`;
    const avifOutPath = path.join(OUTPUT_DIR, parsedPath.dir, avifFileName);
    await resized.clone().avif({ quality: QUALITY.avif }).toFile(avifOutPath);
    variants[`avif-${width}`] = path.relative(OUTPUT_DIR, avifOutPath);

    // ---- JPEG fallback ----
    const jpegFileName = `${parsedPath.name}-${width}w.jpg`;
    const jpegOutPath = path.join(OUTPUT_DIR, parsedPath.dir, jpegFileName);
    await resized.clone().jpeg({ quality: QUALITY.jpeg, progressive: true }).toFile(jpegOutPath);
    variants[`jpeg-${width}`] = path.relative(OUTPUT_DIR, jpegOutPath);
  }

  return { original: relativePath, variants };
}

/**
 * Entry point: find all images, process them, and write the manifest.
 */
async function main(): Promise<void> {
  console.log('🖼️  Scanning for images in', INPUT_DIR);
  const images = await findImages(INPUT_DIR);

  if (images.length === 0) {
    console.log('   No images found. Add images to /src/assets/images/ and re-run.');
    return;
  }

  console.log(`   Found ${images.length} image(s). Processing…\n`);

  const manifest: ManifestEntry[] = [];

  for (const imgPath of images) {
    const relative = path.relative(INPUT_DIR, imgPath);
    process.stdout.write(`   ⏳ ${relative}…`);

    try {
      const entry = await processImage(imgPath);
      manifest.push(entry);
      const variantCount = Object.keys(entry.variants).length;
      console.log(` ✅ (${variantCount} variants)`);
    } catch (err) {
      console.log(` ❌ Error: ${(err as Error).message}`);
    }
  }

  // Write manifest JSON for build-time lookup
  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📄 Manifest written to ${manifestPath}`);
  console.log(`✨ Done! Processed ${manifest.length} image(s).`);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
