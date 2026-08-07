// /api/photo?name=<places photo resource name>
// Streams the actual photo bytes from Google so the API key never reaches the browser.
export default async function handler(req, res) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const { name } = req.query;

  if (!apiKey) return res.status(500).send('GOOGLE_PLACES_API_KEY is not set on the server.');
  if (!name) return res.status(400).send('Missing photo name.');

  try {
    const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=500&key=${apiKey}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).send('Failed to fetch photo.');

    const contentType = r.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(buffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
}

