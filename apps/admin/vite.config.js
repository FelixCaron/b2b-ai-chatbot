import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

export default defineConfig(({ mode }) => {
  // Load environment variables from .env.local into process.env
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [
      react(),
      {
        name: "serverless-api-dev-plugin",
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
            
            if (urlObj.pathname.startsWith("/api/")) {
              const apiName = urlObj.pathname.replace("/api/", "").replace(/\.js$/, "");
              
              // Check in root /api or apps/admin/api
              const rootApiPath = path.resolve(__dirname, "../../api", `${apiName}.js`);
              const adminApiPath = path.resolve(__dirname, "api", `${apiName}.js`);
              
              const targetPath = fs.existsSync(rootApiPath) 
                ? rootApiPath 
                : (fs.existsSync(adminApiPath) ? adminApiPath : null);

              if (targetPath) {
                try {
                  // Buffer request body for POST/PUT/PATCH
                  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                    if (!req.body) {
                      const buffers = [];
                      for await (const chunk of req) {
                        buffers.push(chunk);
                      }
                      const rawBody = Buffer.concat(buffers).toString('utf-8');
                      req.rawBody = Buffer.concat(buffers);
                      try {
                        req.body = JSON.parse(rawBody);
                      } catch {
                        req.body = {};
                      }
                    }
                  }

                  // Add Vercel response helper methods if missing
                  res.status = function (statusCode) {
                    res.statusCode = statusCode;
                    return res;
                  };
                  res.json = function (data) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                    return res;
                  };

                  // Load and run API handler via Vite's SSR loader
                  const module = await server.ssrLoadModule(targetPath);
                  const handler = module.default || module;
                  await handler(req, res);
                  return;
                } catch (err) {
                  console.error(`[API Dev Error] Handler failed for ${apiName}:`, err);
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: err.message }));
                  return;
                }
              }
            }
            next();
          });
        }
      }
    ],
    server: {
      port: 3000
    }
  };
});
