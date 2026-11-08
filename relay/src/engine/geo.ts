// APPROXIMATE city centroids (decimal degrees) for straight-line travel distance.
// Not travel time, not road distance. Good enough to tell "inside 60 miles" from "Truro".

export const UK_CITY_TABLE: Record<string, { lat: number; lon: number }> = {
  London: { lat: 51.5074, lon: -0.1278 },
  'Greater London': { lat: 51.5074, lon: -0.1278 },
  Hampstead: { lat: 51.556, lon: -0.178 },
  Sutton: { lat: 51.3618, lon: -0.1945 },
  Northwood: { lat: 51.611, lon: -0.424 },
  Guildford: { lat: 51.2362, lon: -0.5704 },
  Maidstone: { lat: 51.272, lon: 0.529 },
  Canterbury: { lat: 51.2802, lon: 1.0789 },
  Oxford: { lat: 51.752, lon: -1.2577 },
  Cambridge: { lat: 52.2053, lon: 0.1218 },
  Birmingham: { lat: 52.4862, lon: -1.8904 },
  Leicester: { lat: 52.6369, lon: -1.1398 },
  Nottingham: { lat: 52.9548, lon: -1.1581 },
  'Stoke-on-Trent': { lat: 53.0027, lon: -2.1794 },
  Manchester: { lat: 53.4808, lon: -2.2426 },
  Liverpool: { lat: 53.4084, lon: -2.9916 },
  Blackpool: { lat: 53.8175, lon: -3.0357 },
  Hull: { lat: 53.7676, lon: -0.3274 },
  Bristol: { lat: 51.4545, lon: -2.5879 },
  Cardiff: { lat: 51.4816, lon: -3.1791 },
  Torquay: { lat: 50.4619, lon: -3.5253 },
  Truro: { lat: 50.2632, lon: -5.051 },
  Inverness: { lat: 57.4778, lon: -4.2247 },
  Leeds: { lat: 53.8008, lon: -1.5491 },
  Brighton: { lat: 50.8225, lon: -0.1372 },
  Reading: { lat: 51.4543, lon: -0.9781 },
};

export function cityCoords(city: string): { lat: number; lon: number } | null {
  return UK_CITY_TABLE[city] ?? null;
}

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function milesFromCity(city: string, site: { lat: number; lon: number }): number | null {
  const c = cityCoords(city);
  return c ? Math.round(milesBetween(c, site) * 10) / 10 : null;
}
