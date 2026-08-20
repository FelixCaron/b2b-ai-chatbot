function cleanAndChunk(text, targetUrl = '', maxChunkLength = 800) {
  let cleanText = text
    .replace(/Nous respectons votre vie privÃ©e[\s\S]*?Enregistrer mes prÃ©fÃ©rences[^\n]*/gi, '')
    .replace(/Les cookies [\s\S]*?visiteurs uniques\./gi, '')
    .replace(/Cookieyes place ce tÃ©moin[\s\S]*?visiteurs uniques\./gi, '');

  const NOISE_PATTERNS = [
    /cookie/i, /cookieyes/i, /Duration\s+\d+/i, /_ga[t_]/i, /VISITOR_INFO/i,
    /yt-remote/i, /innertube/i, /localStorage/i, /sessionStorage/i, /\bGTM-/i,
    /Google Analytics/i, /Google Tag Manager/i, /Reject All/i, /Accept All/i,
    /Save My Preferences/i, /Powered by.*Cookie/i, /Privacy Policy/i, /Terms of Service/i,
    /Copyright/i, /Tous droits rÃ©servÃ©s/i, /Personnaliser Tout rejeter/i
  ];

  const rawParagraphs = cleanText.split(/\n{2,}|\n(?=#{1,3} )/);

  const cleanParagraphs = rawParagraphs
    .map(p => p.trim())
    .filter(p => {
      if (!p || p.length < 5) return false;
      if (NOISE_PATTERNS.some(pattern => pattern.test(p))) return false;
      const linkCount = (p.match(/\[.*?\]\(https?:\/\//g) || []).length;
      const wordCount = p.split(/\s+/).filter(w => w.length > 1).length;
      if (linkCount > 4 && wordCount < 30) return false;
      return true;
    });

  console.log(`[DEBUG] Raw Paragraphs Count   : ${rawParagraphs.length}`);
  console.log(`[DEBUG] Clean Paragraphs Count : ${cleanParagraphs.length}`);
  cleanParagraphs.forEach((cp, idx) => console.log(`  P${idx + 1} (${cp.length} chars): "${cp.substring(0, 100).replace(/\n+/g, ' ')}..."`));

  const chunks = [];
  let currentChunk = '';
  let overlapPrefix = '';

  for (const para of cleanParagraphs) {
    if (!currentChunk) {
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    } else if ((currentChunk + '\n\n' + para).length <= maxChunkLength) {
      currentChunk += '\n\n' + para;
    } else {
      if (currentChunk.split(/\s+/).length >= 8) {
        chunks.push(currentChunk.trim());
        const words = currentChunk.split(/\s+/);
        overlapPrefix = words.slice(-20).join(' ');
      }
      currentChunk = overlapPrefix ? `... ${overlapPrefix}\n\n${para}` : para;
    }
  }
  if (currentChunk && currentChunk.split(/\s+/).length >= 8) {
    chunks.push(currentChunk.trim());
  }

  const enrichedChunks = chunks.map(chunk => {
    return targetUrl ? `[Source URL: ${targetUrl}]\n${chunk}` : chunk;
  });

  return enrichedChunks;
}

async function testFetchKeenHotteok() {
  const url = "https://keen-hotteok-e04bd5.netlify.app/";
  console.log(`=== TESTING FETCH & JINA READER FOR ${url} ===\n`);

  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 
        'Accept': 'text/plain', 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log(`Jina Reader Status: ${jinaRes.status} ${jinaRes.statusText}`);
    const text = await jinaRes.text();
    console.log(`Jina Text Length: ${text.length} chars\n`);

    const chunks = cleanAndChunk(text, url, 800);
    console.log(`\n[RESULT] Produced Chunks Count: ${chunks.length}`);
    chunks.forEach((c, idx) => console.log(`Chunk ${idx + 1} (${c.length} chars):\n${c}\n---`));
  } catch (err) {
    console.error(`Jina Reader Error:`, err.message);
  }
}

testFetchKeenHotteok().catch(console.error);
