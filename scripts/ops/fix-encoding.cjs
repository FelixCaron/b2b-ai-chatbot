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
    } else if (file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('./apps/admin/src').concat(walk('./api'));

let totalFixed = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace common Windows-1252 / UTF-8 double-encoded strings
  content = content
    .replace(/ðŸŽ‰/g, '🎉')
    .replace(/ðŸš€/g, '🚀')
    .replace(/ðŸ”¥/g, '🔥')
    .replace(/ðŸ’¡/g, '💡')
    .replace(/ðŸ“Š/g, '📊')
    .replace(/ðŸ’¬/g, '💬')
    .replace(/ðŸ‘¤/g, '👤')
    .replace(/ðŸ”—/g, '🔗')
    .replace(/ðŸ“„/g, '📄')
    .replace(/ðŸ” /g, '🔍 ')
    .replace(/ðŸ”/g, '🔍')
    .replace(/ðŸ› ï¸/g, '🛠️')
    .replace(/ðŸ› /g, '🛠️')
    .replace(/âœ“/g, '✓')
    .replace(/âœ—/g, '✗')
    .replace(/âœ /g, '✓')
    .replace(/âš ï¸ /g, '⚠️ ')
    .replace(/âš ï¸/g, '⚠️')
    .replace(/âš /g, '⚠️')
    .replace(/â†’/g, '→')
    .replace(/â†/g, '←')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â€¦/g, '…')
    .replace(/â€œ/g, '“')
    .replace(/â€ /g, '”')
    .replace(/â€˜/g, '‘')
    .replace(/â€™/g, '’')
    .replace(/VÃ©rifiez/g, 'Vérifiez')
    .replace(/dÃ©marrer/g, 'démarrer')
    .replace(/envoyÃ©/g, 'envoyé')
    .replace(/sÃ©curiser/g, 'sécuriser')
    .replace(/Ã©/g, 'é')
    .replace(/Ã¨/g, 'è')
    .replace(/Ã /g, 'à')
    .replace(/Ã¢/g, 'â')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã®/g, 'î')
    .replace(/Ã´/g, 'ô')
    .replace(/Ã»/g, 'û')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã€/g, 'À');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Fixed encoding in:', file);
    totalFixed++;
  }
});

console.log('Total files fixed:', totalFixed);
