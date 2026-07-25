const fs = require('node:fs');
const path = require('node:path');

// Windows tsc emits "sourceRoot":"" in .d.ts.map; Linux tsc omits it.
// Normalize so committed files match CI output.
const root = process.argv[2] || 'dist';
walk(root);
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith('.d.ts.map')) continue;
    let c = fs.readFileSync(full, 'utf8');
    const orig = c;
    c = c.replace(/,"sourceRoot":""/g, '');
    if (c !== orig) fs.writeFileSync(full, c);
  }
}
