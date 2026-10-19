/* Optional PNG export: npm install --no-save sharp; node scripts/render-diagrams.cjs */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const dir = path.join(__dirname, '..', 'assets', 'diagrams');
(async () => {
  const names = (await fs.readdir(dir)).filter(x => x.endsWith('.svg'));
  if (names.length !== 8) throw new Error(`Expected 8 SVG diagrams, got ${names.length}`);
  for (const name of names) {
    await sharp(path.join(dir, name), { density: 144 })
      .png().toFile(path.join(dir, name.replace(/\.svg$/, '.png')));
  }
  console.log(`Rendered ${names.length} PNG previews.`);
})().catch(e => { console.error(e); process.exit(1); });
