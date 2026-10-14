const fs = require('fs');
const files = fs.readdirSync('src').filter((f) => /\.jsx?$/.test(f) && f !== 'icons.js');
const lr = require('lucide-react');
const names = new Set(['Circle']);
const strict = new Set();
for (const f of files) {
  const s = fs.readFileSync('src/' + f, 'utf8');
  // I.Name must exist
  for (const m of s.matchAll(/\bI\.([A-Z][A-Za-z0-9]*)/g)) { names.add(m[1]); strict.add(m[1]); }
  // Icons named in data: icon: 'Name', or any quoted PascalCase word that is a lucide icon
  for (const m of s.matchAll(/icon: '([A-Z][A-Za-z0-9]+)'/g)) { names.add(m[1]); strict.add(m[1]); }
  for (const m of s.matchAll(/'([A-Z][A-Za-z0-9]+)'/g)) if (lr[m[1]] && /^[A-Z][a-z]+[A-Z0-9]/.test(m[1])) names.add(m[1]);
  for (const m of s.matchAll(/'([A-Z][a-z]+)'/g)) if (lr[m[1]] && lr[m[1]].render) names.add(m[1]);
}
const missing = [...strict].filter((n) => !lr[n]);
if (missing.length) { console.error('Missing icons:', missing.join(', ')); process.exit(1); }
const out = [...names].filter((n) => lr[n]).sort();
fs.writeFileSync('src/icons.js', `export { ${out.join(', ')} } from 'lucide-react';\n`);
console.log(out.length, 'icons');
