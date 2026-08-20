const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

const apiFiles = walk('./api');
apiFiles.forEach(file => {
  if (file.includes('api\\lib') || file.includes('api/lib')) return;
  let content = fs.readFileSync(file, 'utf8');
  const updated = content.replace(/['"]\.\.\/\.\.\/lib\//g, "'../lib/");
  if (updated !== content) {
    fs.writeFileSync(file, updated, 'utf8');
    console.log('Fixed imports in:', file);
  }
});
