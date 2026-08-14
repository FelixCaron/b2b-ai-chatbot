import crawlSiteHandler from '../api/crawl-site.js';

async function testCrawlKeenHotteok() {
  console.log("=== TESTING API/CRAWL-SITE FOR KEEN-HOTTEOK ===");

  const urlsToTest = [
    "keen-hotteok-e04bd5.netlify.app",
    "https://keen-hotteok-e04bd5.netlify.app",
    "https://keen-hotteok-e04bd5.netlify.app/"
  ];

  for (const url of urlsToTest) {
    console.log(`\nTesting URL: "${url}"`);
    const dummyReq = {
      method: 'POST',
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ url })
    };

    const res = await crawlSiteHandler(dummyReq);
    const data = await res.json();

    console.log(`Crawl Response Status: ${res.status}`);
    console.log(`Discovered Count     : ${data.total_discovered}`);
    console.log(`Root URL returned    : ${data.root_url}`);
    console.log(`Discovered Pages     :`, data.pages);
  }
}

testCrawlKeenHotteok().catch(console.error);
