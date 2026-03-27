#!/usr/bin/env node
import { minify } from 'terser';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src-client');
const publicDir = join(__dirname, 'internal', 'static', 'public');

// app.js is split into multiple files, concatenated at build time
// Order matters — each file is a fragment of the same IIFE scope
const APP_PARTS = ['core.js', 'hud.js', 'ws.js', 'settings.js', 'ui.js'];

// Standalone files to process as-is
const STANDALONE = ['themes.js', 'analytics.js', 'tutorial.js', 'tutorial-getting-started.js', 'tutorial-panes.js'];

async function build() {
  console.log('Building minified JS...\n');

  // --- app.js: concatenate parts then minify ---
  const appParts = APP_PARTS.map(f => {
    const p = join(srcDir, f);
    return { name: f, source: readFileSync(p, 'utf8') };
  });

  const appSource = appParts.map(p => p.source).join('\n');
  const appOriginalSize = Buffer.byteLength(appSource);

  const appMinified = await minify({ 'app.js': appSource }, {
    compress: {
      dead_code: true,
      drop_console: false,
      passes: 2,
    },
    mangle: {
      toplevel: false, // ES module imports must not be mangled
    },
    format: {
      comments: false,
    },
    module: true,
  });

  if (appMinified.error) {
    console.error('  Terser error on app.js:', appMinified.error);
    process.exit(1);
  }

  const appFinal = appMinified.code;
  const appFinalSize = Buffer.byteLength(appFinal);
  writeFileSync(join(publicDir, 'app.min.js'), appFinal);

  const appRatio = ((1 - appFinalSize / appOriginalSize) * 100).toFixed(1);
  console.log(`  app.js (${APP_PARTS.length} parts) → app.min.js`);
  console.log(`    ${(appOriginalSize / 1024).toFixed(1)}K → ${(appFinalSize / 1024).toFixed(1)}K (${appRatio}% reduction)\n`);

  // --- Standalone files ---
  for (const file of STANDALONE) {
    const inputPath = join(srcDir, file);
    const outputPath = join(publicDir, file.replace('.js', '.min.js'));

    const source = readFileSync(inputPath, 'utf8');
    const originalSize = Buffer.byteLength(source);

    const minified = await minify(source, {
      compress: {
        dead_code: true,
        drop_console: false,
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    });

    if (minified.error) {
      console.error(`  Terser error on ${file}:`, minified.error);
      process.exit(1);
    }

    const finalCode = minified.code;
    const finalSize = Buffer.byteLength(finalCode);

    writeFileSync(outputPath, finalCode);

    const ratio = ((1 - finalSize / originalSize) * 100).toFixed(1);
    console.log(`  ${file} → ${file.replace('.js', '.min.js')}`);
    console.log(`    ${(originalSize / 1024).toFixed(1)}K → ${(finalSize / 1024).toFixed(1)}K (${ratio}% reduction)\n`);
  }

  console.log('Done.');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
