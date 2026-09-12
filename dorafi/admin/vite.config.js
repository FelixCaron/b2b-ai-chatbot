import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

export default defineConfig(({ mode, command }) => {
  // Load environment variables from .env.local into process.env
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  // A production build with no Supabase credentials does not fail — it
  // SUCCEEDS, and ships a bundle containing nothing but the "Configuration
  // required" screen. `supabaseConfigurationError` (src/lib/supabase.js) is a
  // constant once import.meta.env is inlined at build time, so the very first
  // branch of App.jsx wins and Rollup tree-shakes the entire product away
  // behind it: a 218 KB bundle where the real one is 665 KB. Nothing in the
  // output says so, and a deploy of it looks like a working release until a
  // customer opens it. Refuse to build instead.
  if (command === 'build') {
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(
      (name) => !process.env[name]?.trim()
    );
    if (missing.length > 0) {
      throw new Error(
        `Cannot build the admin app: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set.\n` +
        'Without them the build silently produces a bundle that only renders the ' +
        '"Configuration required" screen. Set them in .env.local for a local build, ' +
        'or in the deployment environment for a real one.'
      );
    }
  }

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
              
              // The functions live beside this config, in ./api — the same
              // directory Vercel turns into serverless functions for this
              // project. (They used to sit at the monorepo root, back when
              // this app deployed from there; there is only one place now.)
              const handlerPath = path.resolve(__dirname, "api", `${apiName}.js`);
              const targetPath = fs.existsSync(handlerPath) ? handlerPath : null;

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

                  // Vercel parses the query string for Node-style handlers;
                  // Vite doesn't, so req.query would be undefined here.
                  req.query = Object.fromEntries(urlObj.searchParams);

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

                  // Two function signatures live side by side in api/**: most
                  // routes are Edge handlers taking a Request and returning a
                  // Response (edgeRoute), while billing/webhook.js is a Node
                  // handler taking (req, res) (nodeRoute). Handing a Node
                  // request to an Edge handler is what made every /api/** call
                  // in dev fail with "req.headers.get is not a function".
                  // edgeRoute's wrapper declares one parameter, nodeRoute's
                  // two — which is the only distinction available here, and
                  // the one the two factories in api/_lib/http.js guarantee.
                  if (handler.length >= 2) {
                    await handler(req, res);
                    return;
                  }

                  const headers = new Headers();
                  for (const [key, value] of Object.entries(req.headers)) {
                    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
                    else if (value != null) headers.set(key, value);
                  }
                  const response = await handler(new Request(urlObj, {
                    method: req.method,
                    headers,
                    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.rawBody,
                  }));
                  res.statusCode = response.status;
                  response.headers.forEach((value, key) => res.setHeader(key, value));
                  if (response.body) {
                    // Piped rather than buffered so /api/chat's SSE stream
                    // arrives token by token in dev, as it does in production.
                    for await (const chunk of response.body) res.write(chunk);
                  }
                  res.end();
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
