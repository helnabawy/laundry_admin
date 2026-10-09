export interface LatLng {
  latitude: number;
  longitude: number;
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

// Most specific first: a link's place pin (!3d…!4d…) beats its viewport (@…).
const PATTERNS = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(String.raw`[?&](?:q|query|ll|destination)=${NUM}\s*(?:,|%2C)\s*${NUM}`, "i"),
  new RegExp(String.raw`@${NUM},${NUM}`),
  new RegExp(String.raw`^\s*${NUM}\s*[,\s]\s*${NUM}\s*$`),
];

export function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/**
 * Reads a map pin from what staff paste: "25.07, 55.13" or a Google Maps /
 * OpenStreetMap link that carries coordinates. Null when there are none —
 * short links (maps.app.goo.gl) hide them until opened.
 */
export function parseLatLng(input: string): LatLng | null {
  const text = input.trim();
  if (!text) return null;
  for (const re of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const latitude = Number(m[1]);
    const longitude = Number(m[2]);
    if (isValidLatLng(latitude, longitude)) return { latitude, longitude };
  }
  return null;
}

export function formatLatLng({ latitude, longitude }: LatLng) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

export function mapsUrl({ latitude, longitude }: LatLng) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** An OpenStreetMap embed centred on the pin — no API key needed. */
export function mapEmbedUrl({ latitude, longitude }: LatLng, span = 0.006) {
  const bbox = [longitude - span, latitude - span / 2, longitude + span, latitude + span / 2].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
}
