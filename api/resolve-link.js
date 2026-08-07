// /api/resolve-link?url=<pasted Google Maps link>
// Follows the link (including short maps.app.goo.gl links) and pulls the
// place name from the resolved page. No Google API key involved — this
// just reads the page the way a browser would.
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
        // A real mobile browser UA + English language header avoids Google
        // serving a stripped-down/consent page that breaks name extraction.
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    const finalUrl = r.url || url;
    const html = await r.text();

    // Primary source: the page <title>, which Google Maps sets to a clean
    // business name (e.g. "Corner 21 · Google Maps" or just "Corner 21").
    // This is far more reliable than parsing the URL, which sometimes
    // contains the full formatted address instead of the business name.
    let name = null;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      name = titleMatch[1]
        .replace(/\s*[-·]\s*Google Maps\s*$/i, '')
        .trim();
      if (!name) name = null;
    }

    // Fallback 1: /maps/place/NAME/ segment in the resolved URL.
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
      return res.status(404).json({ error: 'Could not find a name in that link.' });
    }

    res.status(200).json({ name, mapsUri: finalUrl });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === 'AbortError' ? 'Link took too long to load.' : 'Could not read that link.';
    res.status(500).json({ error: msg });
  }
}
