import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Mirrors apps/admin/vite.config.js's local API dev proxy, scoped to this
// app's own api/ directory only (never falls back to the root /api — this
// app must never accidentally exercise the tenant-facing endpoints).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: "internal-admin-api-dev-plugin",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3100'}`);
            if (!urlObj.pathname.startsWith("/api/")) return next();

            const apiName = urlObj.pathname.replace("/api/", "").replace(/\.js$/, "");
            const targetPath = path.resolve(__dirname, "api", `${apiName}.js`);
            if (!fs.existsSync(targetPath)) return next();

            try {
              if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.body) {
                const buffers = [];
                for await (const chunk of req) buffers.push(chunk);
                const rawBody = Buffer.concat(buffers).toString('utf-8');
                req.rawBody = Buffer.concat(buffers);
                try { req.body = JSON.parse(rawBody); } catch { req.body = {}; }
              }
              res.status = function (statusCode) { res.statusCode = statusCode; return res; };
              res.json = function (data) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
              };
              const module = await server.ssrLoadModule(targetPath);
              const handler = module.default || module;
              await handler(req, res);
            } catch (err) {
              console.error(`[API Dev Error] Handler failed for ${apiName}:`, err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        }
      }
    ],
    server: { port: 3100 }
  };
});
