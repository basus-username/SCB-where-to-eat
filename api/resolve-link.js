// /api/resolve-link?url=<pasted link>
// Follows the link (including short/redirect links) and pulls a name from
// the resolved page. No API key involved — this just reads the page the
// way a browser would.
//
// Known limitation: Instagram, XHS/小红书, TikTok and similar apps render
// their real content client-side via JS. The raw server HTML for those
// only ever contains a generic app-shell title (e.g. "Instagram", "小红书"),
// never the actual post/place name — there's no free/no-signup way around
// this without their paid developer APIs. So instead of silently filling
// in that generic string, we detect it and report a clean failure so the
// caller can prompt for manual entry.
const GENERIC_TITLES = [
  'instagram', 'xhs', '小红书', 'rednote', 'tiktok', 'facebook', 'twitter',
  'x', 'threads', 'youtube', 'whatsapp', 'telegram', 'snapchat'
];

function isGenericAppShell(name){
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return GENERIC_TITLES.some(g => n === g || n === g + ' ');
}

function extractMetaContent(html, property){
  // Matches <meta property="og:title" content="..."> in either attribute order.
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i');
  const re3 = new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re4 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i');
  const m = html.match(re1) || html.match(re2) || html.match(re3) || html.match(re4);
  return m ? m[1].trim() : null;
}

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Missing url.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // A real mobile browser UA + English language header avoids some
        // sites serving a stripped-down/consent page that breaks extraction.
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    const finalUrl = r.url || url;
    const html = await r.text();

    // Try several sources in order of reliability. og:title and
    // twitter:title are often populated even on JS-heavy sites for link
    // previews, so they're tried before falling back to the raw <title>.
    let name = extractMetaContent(html, 'og:title');
    if (!name) name = extractMetaContent(html, 'twitter:title');

    if (!name) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        name = titleMatch[1]
          .replace(/\s*[-·|]\s*Google Maps\s*$/i, '')
          .trim();
      }
    }

    // Clean up common site-name suffixes some og:title/title values include.
    if (name) {
      name = name.replace(/\s*[-·|]\s*(Google Maps|Instagram|Facebook)\s*$/i, '').trim();
    }

    // If what we got is just the app's own generic shell name, treat that
    // as a failed extraction rather than filling in something misleading.
    if (isGenericAppShell(name)) {
      name = null;
    }

    // Fallback 1: /maps/place/NAME/ segment in the resolved URL (Maps links).
    if (!name) {
      const placeMatch = finalUrl.match(/\/maps\/place\/([^/@]+)/);
      if (placeMatch) {
        name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).split(',')[0].trim();
      }
    }

    // Fallback 2: a ?q= or &query= search parameter.
    if (!name) {
      const qMatch = finalUrl.match(/[?&](?:q|query)=([^&]+)/);
      if (qMatch) {
        name = decodeURIComponent(qMatch[1].replace(/\+/g, ' ')).split(',')[0].trim();
      }
    }

    if (!name) {
      return res.status(404).json({ error: 'Could not find a name in that link — type it in below.' });
    }

    res.status(200).json({ name, resolvedUrl: finalUrl });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError' ? 'Link took too long to load.' : 'Could not read that link.';
    res.status(500).json({ error: msg });
  }
}
