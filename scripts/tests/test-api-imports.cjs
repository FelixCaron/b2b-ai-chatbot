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

// Every serverless functions directory in the monorepo — root /api (admin +
// widget's shared API) and each standalone app's own api/ (see
// apps/internal-admin, deployed as its own Vercel project).
const API_ROOTS = ['./api', './apps/internal-admin/api'];

async function testImports() {
  const apiFiles = API_ROOTS.flatMap((root) => (fs.existsSync(root) ? walk(root) : []));
  let passed = 0;
  let failed = 0;
  for (const file of apiFiles) {
    try {
      const normalizedPath = '../../' + file.replace(/\\/g, '/');
      await import(normalizedPath);
      console.log('PASS:', normalizedPath);
      passed++;
    } catch (err) {
      console.error('FAIL:', file, err.message);
      failed++;
    }
  }
  console.log(`\nImport Test Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

testImports();
