// apps/logafi is a separate Vercel project with no build step, so the E2E run
// serves the directory itself (playwright.config.js starts a second webServer
// on this port). Kept here rather than in either file so the config and the
// spec cannot drift apart.
export const LOGAFI_PORT = 5174;
export const LOGAFI_URL = `http://127.0.0.1:${LOGAFI_PORT}`;
