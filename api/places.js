// /api/places?query=<restaurant name or maps link text>
// Proxies Google Places API (New) Text Search so the API key never reaches the browser.
export default async function handler(req, res) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const { query } = req.query;

  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY is not set on the server.' });
  }
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Missing query.' });
  }

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.googleMapsUri,places.photos,places.currentOpeningHours.openNow',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    if (!r.ok) {
      const errText = await r.text();
      return res.status(r.status).json({ error: `Places API error: ${errText}` });
    }

    const data = await r.json();
    const place = data.places?.[0];

    if (!place) {
      return res.status(404).json({ error: 'No matching place found.' });
    }

    res.status(200).json({
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      rating: place.rating ?? null,
      priceLevel: place.priceLevel || null,
      mapsUri: place.googleMapsUri || '',
      openNow: place.currentOpeningHours?.openNow ?? null,
      // Pass the raw photo resource name; the client fetches the actual image via /api/photo
      photoName: place.photos?.[0]?.name || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

