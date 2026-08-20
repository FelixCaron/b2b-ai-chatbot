const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  await page.goto('http://localhost:5173/preview.html?domain=example.com&tenant_key=test-key', { waitUntil: 'networkidle0' });
  const botExists = await page.evaluate(() => {
    return !!document.getElementById('b2b-chatbot-host');
  });
  console.log('Bot exists in preview.html:', botExists);
  await browser.close();
})();
