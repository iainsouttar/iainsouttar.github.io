/**
 * gpx.js — GPX parsing and route geometry for Route Weather
 */

/**
 * Parse raw GPX file text into an array of track points.
 * All <trk>/<trkseg> elements are concatenated into a single route.
 * @param {string} fileText
 * @returns {{ lat: number, lon: number, ele: number }[]}
 */
function parseGPX(fileText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(fileText, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid GPX file');
  }

  const trkpts = Array.from(doc.querySelectorAll('trkpt'));
  if (trkpts.length === 0) {
    throw new Error('No track points found in GPX file');
  }

  return trkpts.map(pt => ({
    lat: parseFloat(pt.getAttribute('lat')),
    lon: parseFloat(pt.getAttribute('lon')),
    ele: pt.querySelector('ele') ? parseFloat(pt.querySelector('ele').textContent) : 0,
  }));
}

/**
 * Haversine formula — returns distance in km between two lat/lon points.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Enrich track points with cumulative distance.
 * @param {{ lat: number, lon: number, ele: number }[]} points
 * @returns {{ lat: number, lon: number, ele: number, cumulativeKm: number }[]}
 */
function buildRouteWithDistance(points) {
  let cumulative = 0;
  return points.map((pt, i) => {
    if (i > 0) {
      cumulative += haversineKm(points[i - 1].lat, points[i - 1].lon, pt.lat, pt.lon);
    }
    return { ...pt, cumulativeKm: cumulative };
  });
}

/**
 * Find a linearly interpolated lat/lon at a given cumulative km along the route.
 * @param {{ lat: number, lon: number, cumulativeKm: number }[]} routePoints
 * @param {number} targetKm
 * @returns {{ lat: number, lon: number }}
 */
function interpolatePoint(routePoints, targetKm) {
  for (let i = 1; i < routePoints.length; i++) {
    const prev = routePoints[i - 1];
    const curr = routePoints[i];
    if (curr.cumulativeKm >= targetKm) {
      const span = curr.cumulativeKm - prev.cumulativeKm;
      const t = span === 0 ? 0 : (targetKm - prev.cumulativeKm) / span;
      return {
        lat: prev.lat + t * (curr.lat - prev.lat),
        lon: prev.lon + t * (curr.lon - prev.lon),
      };
    }
  }
  // Past the end — return the last point
  const last = routePoints[routePoints.length - 1];
  return { lat: last.lat, lon: last.lon };
}

/**
 * Split route into daily stages.
 * @param {{ lat: number, lon: number, cumulativeKm: number }[]} route
 * @param {number} dailyKm
 * @returns {object[]}
 */
function splitIntoDays(route, dailyKm) {
  const totalKm = route[route.length - 1].cumulativeKm;
  const numDays = Math.ceil(totalKm / dailyKm);
  const days = [];

  for (let i = 1; i <= numDays; i++) {
    const startKm = (i - 1) * dailyKm;
    const endKm = Math.min(i * dailyKm, totalKm);

    const startPoint = i === 1
      ? { lat: route[0].lat, lon: route[0].lon }
      : interpolatePoint(route, startKm);
    const endPoint = interpolatePoint(route, endKm);

    const midPoint = {
      lat: (startPoint.lat + endPoint.lat) / 2,
      lon: (startPoint.lon + endPoint.lon) / 2,
    };

    days.push({
      dayNumber: i,
      startKm,
      endKm,
      distanceKm: endKm - startKm,
      startPoint,
      endPoint,
      midPoint,
      date: null,
    });
  }

  return days;
}
