const fs = require('fs');
const files = fs.readdirSync('src').filter((f) => /\.jsx?$/.test(f) && f !== 'icons.js');
const names = new Set();
for (const f of files) {
  const s = fs.readFileSync('src/' + f, 'utf8');
  for (const m of s.matchAll(/\bI\.([A-Z][A-Za-z0-9]*)/g)) names.add(m[1]);
  for (const m of s.matchAll(/icon: '([A-Z][A-Za-z0-9]+)'/g)) names.add(m[1]);
}
const lr = require('lucide-react');
const missing = [...names].filter((n) => !lr[n]);
if (missing.length) { console.error('Missing icons:', missing.join(', ')); process.exit(1); }
fs.writeFileSync('src/icons.js', `export { ${[...names].sort().join(', ')} } from 'lucide-react';\n`);
console.log(names.size, 'icons');
