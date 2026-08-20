const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'dist', 'build']);
const patterns = [
  { label: 'Supabase service-role JWT', value: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/ },
  { label: 'Jina API key', value: /jina_[a-zA-Z0-9_-]{20,}/ },
];
const violations = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(filePath);
      continue;
    }

    if (!/\.(?:c?js|mjs|jsx|ts|tsx|json|md|sql)$/i.test(entry.name)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of patterns) {
      if (pattern.value.test(content)) violations.push(`${path.relative(root, filePath)}: ${pattern.label}`);
    }
  }
}

visit(root);

if (violations.length) {
  console.error('Committed secrets detected:\n' + violations.join('\n'));
  process.exit(1);
}

console.log('No committed credential patterns detected.');
