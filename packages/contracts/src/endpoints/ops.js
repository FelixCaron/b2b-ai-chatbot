// Scheduled maintenance.

// cron.cleanup (GET /api/cron/cleanup — sweep guest tenants and anonymous
// auth accounts abandoned for more than 24h) was removed 2026-09-08, along
// with its handler api/cron/cleanup.js: the project sits on Vercel's Hobby
// plan (12 Serverless Functions per deployment, hard cap) and was already at
// exactly 12/12 before this — a routine change elsewhere pushed it to 14 and
// broke every deployment. This was never wired to an actual Vercel Cron
// schedule (vercel.json carries no `crons` entry, and the project's own
// cron definitions are empty), so cutting it costs nothing running today —
// only the intended daily sweep, which stops guest workspaces and their
// abandoned auth accounts from accumulating.
//
// Restore both the handler and this contract (git history has the exact
// code — see api/cron/cleanup.js as of this commit's parent) once the
// project is off Hobby, or once accumulation is worth trading a function
// slot for again. Tracked in TODO.md.
//
// (api/chat/proxy.js, this cap's other casualty, does not need restoring —
// see chat.js's note on why.)

export default [];
