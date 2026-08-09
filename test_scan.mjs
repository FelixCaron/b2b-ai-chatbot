import handler from './api/start-scan.js';

async function test() {
  const req = {
    method: 'POST',
    json: async () => ({
      site_id: 'a87e50eb-bfba-40a2-bb17-74c10c14dddb', // Dummy UUID
      tenant_id: 'a4bcd686-a8b6-4977-bb0a-78919cf7b8c8', // Dummy UUID
      url: 'https://hvcs.ca'
    })
  };
  const res = await handler(req);
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
test();
