// scripts/generate-links.js
// node scripts/generate-links.js --dir=./public --out=./public/links.json --baseUrl=/
// No depende de librerías externas.

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opts = {};
argv.forEach((a, i) => {
  if (a.startsWith('--')) {
    const key = a.replace(/^--/, '');
    const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[i+1] : true;
    opts[key] = val;
  }
});

const root = path.resolve(opts.dir || '.');
const out = opts.out ? path.resolve(opts.out) : path.resolve('links.json');
const baseUrl = (opts.baseUrl || '/').replace(/\/+$/, ''); // no trailing slash
const extAllow = (opts.ext || '.html,.htm,.md,.pdf').split(',').map(s=>s.trim().toLowerCase());

const items = [];

function walk(dir){
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for(const f of files){
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = path.extname(f.name).toLowerCase();
    if (!extAllow.includes(ext)) continue;
    let rel = path.relative(root, full).replace(/\\/g, '/');
    // create URL: baseUrl + '/' + rel
    let url = baseUrl === '' ? '/' + rel : baseUrl + '/' + rel;
    if (!url.startsWith('/')) url = '/' + url;
    // try to get title
    let title = f.name;
    try {
      const txt = fs.readFileSync(full, 'utf8');
      if (ext === '.html' || ext === '.htm') {
        const m = txt.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (m) title = m[1].trim();
      } else if (ext === '.md') {
        // frontmatter title
        const fm = txt.match(/^\s*---[\s\S]*?title:\s*["']?(.+?)["']?\s*[\r\n]/i);
        if (fm) title = fm[1].trim();
        else {
          // first H1
          const h1 = txt.match(/^\s*#\s+(.+)$/m);
          if (h1) title = h1[1].trim();
        }
      }
    } catch(e) {
      // ignore read errors
    }
    const stat = fs.statSync(full);
    items.push({
      title,
      url,
      desc: '',
      tags: [],
      date: stat.mtime.toISOString().slice(0,10)
    });
  }
}

walk(root);

// sort by date desc
items.sort((a,b) => (b.date || '').localeCompare(a.date || ''));

fs.writeFileSync(out, JSON.stringify(items, null, 2), 'utf8');
console.log(`Wrote ${out} (${items.length} items).`);
