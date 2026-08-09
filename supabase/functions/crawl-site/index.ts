import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "Missing required field: url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUrl = url.startsWith("http") ? url : `https://${url}`;
    const parsedTarget = new URL(targetUrl);
    const domainHost = parsedTarget.hostname;

    console.log(`Crawling site: ${targetUrl} (Domain: ${domainHost})`);

    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch URL ${targetUrl}. Status: ${res.status}`);
    }

    const html = await res.text();

    // Extract title tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rootTitle = titleMatch ? titleMatch[1].trim() : parsedTarget.hostname;

    // Extract all href links from HTML
    const hrefRegex = /href=["']([^"']+)["']/g;
    const discoveredUrls = new Set<string>();
    discoveredUrls.add(targetUrl);

    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const link = match[1];

      // Ignore anchor fragments, mailto, tel, javascript, media
      if (
        !link ||
        link.startsWith("#") ||
        link.startsWith("mailto:") ||
        link.startsWith("tel:") ||
        link.startsWith("javascript:") ||
        /\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js)$/i.test(link)
      ) {
        continue;
      }

      try {
        const resolved = new URL(link, targetUrl);
        // Only keep links belonging to the exact same hostname
        if (resolved.hostname === domainHost) {
          // Remove query params and hashes for clean URL representation
          resolved.hash = "";
          resolved.search = "";
          discoveredUrls.add(resolved.href);
        }
      } catch (_e) {
        // invalid URL string, skip
      }
    }

    const pages = Array.from(discoveredUrls).map((pageUrl) => {
      const u = new URL(pageUrl);
      const pathname = u.pathname === "/" ? "Page d'accueil" : u.pathname;
      return {
        url: pageUrl,
        path: u.pathname,
        title: pathname
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        root_url: targetUrl,
        root_title: rootTitle,
        total_discovered: pages.length,
        pages: pages
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Crawl site error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
