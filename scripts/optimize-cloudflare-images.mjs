// Build-only optimization for the public Cloudflare site.
// Keeps source SVG files and clickable original artwork unchanged. Only IMG src
// attributes pointing to data-URI-heavy SVGs are switched to WebP renditions.
import sharp from 'sharp';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const dist = resolve(import.meta.dirname, '..', 'dist-cloudflare');
const imageDir = join(dist, 'assets/img/placeholders');
if (!existsSync(imageDir)) throw new Error('Missing Cloudflare output image directory');
const published = new Map();
for (const name of readdirSync(imageDir)) {
  if (!name.endsWith('.svg')) continue;
  const input = join(imageDir, name);
  const originalSize = statSync(input).size;
  if (originalSize < 400_000) continue;
  const source = readFileSync(input, 'utf8');
  // Do not rasterize ordinary vector artwork: those remain crisp SVG.
  if (!source.includes('data:image/') || !source.includes(';base64,')) continue;
  const fileName = name.replace(/\.svg$/, '.webp');
  const output = join(imageDir, fileName);
  // Preserve the image composition, dimensions and embedded photos.
  // Quality 90 and effort 5 favor fidelity while removing PNG-in-SVG overhead.
  await sharp(input, { limitInputPixels: 55_000_000 })
    .webp({ quality: 90, effort: 5 })
    .toFile(output);
  const optimizedSize = statSync(output).size;
  if (optimizedSize >= originalSize) throw new Error('WebP image not smaller than SVG: ' + name);
  published.set('/assets/img/placeholders/' + name, {
    destination: '/assets/img/placeholders/' + fileName,
    before: originalSize,
    after: optimizedSize
  });
}
if (!published.size) throw new Error('No oversized embedded-raster SVGs optimized; inspect deployment inputs');
let replacements = 0, pages = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (extname(entry.name) !== '.html') continue;
    const source = readFileSync(file,'utf8');
    const destination = source.replace(/<img\b[^>]*>/gi, tag => tag.replace(
      /(\bsrc\s*=\s*["'])([^"']+?\.svg)(\?[^"']*)?(["'])/i,
      (full, prefix, url, query = '', quote) => {
        let image;
        try { image = new URL(url, 'https://petruandines.com/' + file.slice(dist.length + 1).replace(/\\/g,'/')); }
        catch { return full; }
        const optimized = published.get(image.pathname);
        if (!optimized) return full;
        replacements++;
        return prefix + url.replace(/\.svg$/, '.webp') + (query || '') + quote;
      }
    ));
    if (source !== destination) { writeFileSync(file,destination); pages++; }
  }
}
walk(dist);
if (replacements === 0) throw new Error('No public img tags reference optimized illustrations');
for(const x of published.values())if(!existsSync(join(dist,x.destination.slice(1))))throw Error('Missing optimized file '+x.destination);
const bytesBefore=[...published.values()].reduce((sum,i)=>sum+i.before,0);
const bytesAfter=[...published.values()].reduce((sum,i)=>sum+i.after,0);
console.log('Public images optimized:',published.size,'images in',pages,'pages;',replacements,'image elements; total referenced art bytes',bytesBefore,'->',bytesAfter);
