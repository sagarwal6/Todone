#!/usr/bin/env node
/**
 * Generate PNG icons from SVG for PWA
 * Run: npm run generate-icons
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '../public/icons/icon.svg');
const OUTPUT_DIR = path.join(__dirname, '../public/icons');

const SIZES = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

async function generateIcons() {
  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const { name, size } of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated ${name} (${size}x${size})`);
  }

  // Also copy apple-touch-icon to public root (some browsers look there)
  fs.copyFileSync(
    path.join(OUTPUT_DIR, 'apple-touch-icon.png'),
    path.join(__dirname, '../public/apple-touch-icon.png')
  );
  console.log('Copied apple-touch-icon.png to public root');

  console.log('\nDone! Icons generated successfully.');
}

generateIcons().catch(console.error);
