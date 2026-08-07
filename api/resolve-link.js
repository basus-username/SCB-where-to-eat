// /api/resolve-link?url=<pasted Google Maps link>
// Follows the link (including short maps.app.goo.gl links) and pulls the
// place name out of the final URL. No Google API key involved — this just
// reads the redirect, the same way a browser would.
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Missing url.' });
  }

  try {
    // Follow redirects (maps.app.goo.gl short links redirect to the full URL)
    const r = await fetch(url, { redirect: 'follow' });
    const finalUrl = r.url || url;

    // Google Maps place URLs look like:
    // https://www.google.com/maps/place/Some+Restaurant+Name/@1.23,103.4,17z/...
    const match = finalUrl.match(/\/maps\/place\/([^/@]+)/);
    const name = match
      ? decodeURIComponent(match[1].replace(/\+/g, ' '))
      : null;

    res.status(200).json({ name, mapsUri: finalUrl });
  } catch (err) {
    res.status(500).json({ error: 'Could not read that link.' });
  }
}

