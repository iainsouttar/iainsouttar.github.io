/**
 * app.js — Main application logic for Route Weather
 */

let map = null;
let routeLayer = null;
let markerLayer = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
});

async function handleGenerate() {
  hideError();

  const gpxInput = document.getElementById('gpx-upload');
  const startDateInput = document.getElementById('start-date');
  const dailyDistanceInput = document.getElementById('daily-distance');

  if (!gpxInput.files || gpxInput.files.length === 0) {
    showError('Please upload a GPX file.');
    return;
  }

  if (!startDateInput.value) {
    showError('Please select a start date.');
    return;
  }

  const dailyKm = parseFloat(dailyDistanceInput.value);
  if (!dailyDistanceInput.value || isNaN(dailyKm) || dailyKm <= 0) {
    showError('Please enter a valid daily distance.');
    return;
  }

  const file = gpxInput.files[0];

  let fileText;
  try {
    fileText = await readFileAsText(file);
  } catch (err) {
    showError('Could not read the GPX file.');
    return;
  }

  let points;
  try {
    points = parseGPX(fileText);
  } catch (err) {
    showError(err.message);
    return;
  }

  const route = buildRouteWithDistance(points);
  let days = splitIntoDays(route, dailyKm);
  days = attachDates(days, startDateInput.value);

  const totalKm = route[route.length - 1].cumulativeKm;

  // Build a parallel set of days all pinned to the route start point
  const startPoint = { lat: route[0].lat, lon: route[0].lon };
  const startDays = days.map(day => ({ ...day, midPoint: startPoint }));

  // Show loading, hide previous results
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('results-section').classList.add('hidden');

  let daysWithWeather, startDaysWithWeather;
  try {
    [daysWithWeather, startDaysWithWeather] = await Promise.all([
      fetchAllDaysWeather(days),
      fetchAllDaysWeather(startDays),
    ]);
  } catch (err) {
    document.getElementById('loading').classList.add('hidden');
    showError('Failed to fetch weather data. Please try again.');
    return;
  }

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('results-section').classList.remove('hidden');

  try {
    renderRouteSummary(daysWithWeather, totalKm);
    renderMap(route, daysWithWeather);
    renderForecastTable(daysWithWeather, startDaysWithWeather);
  } catch (err) {
    showError(`Display error: ${err.message}`);
    console.error('Render error:', err);
  }
}

/**
 * Read a File object as text via FileReader.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsText(file);
  });
}

/**
 * Attach calendar dates to each day object.
 * @param {object[]} days
 * @param {string} startDateString  ISO date string
 * @returns {object[]}
 */
function attachDates(days, startDateString) {
  const start = new Date(startDateString);
  return days.map((day, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { ...day, date: d.toISOString().split('T')[0] };
  });
}

/**
 * Render the route summary block.
 * @param {object[]} days
 * @param {number} totalKm
 */
function renderRouteSummary(days, totalKm) {
  const avgKm = totalKm / days.length;
  const el = document.getElementById('route-summary');
  el.innerHTML = `
    <p><strong>Total distance:</strong> ${totalKm.toFixed(1)} km</p>
    <p><strong>Total days:</strong> ${days.length}</p>  `;
}

/**
 * Render the Leaflet map with the full route and day markers.
 * @param {object[]} route
 * @param {object[]} days
 */
function renderMap(route, days) {
  const mapEl = document.getElementById('map');

  // Remove existing map instance to allow re-runs
  if (map) {
    map.remove();
    map = null;
    routeLayer = null;
    markerLayer = null;
  }

  map = L.map(mapEl);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // Draw full route polyline
  const latlngs = route.map(pt => [pt.lat, pt.lon]);
  routeLayer = L.polyline(latlngs, { color: '#2563eb', weight: 3 }).addTo(map);

  // Add numbered markers at each day's end point
  markerLayer = L.layerGroup().addTo(map);
  days.forEach(day => {
    const icon = L.divIcon({
      className: 'rw-day-marker',
      html: `<span>${day.dayNumber}</span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([day.endPoint.lat, day.endPoint.lon], { icon })
      .bindPopup(`Day ${day.dayNumber} — ${day.date}`)
      .addTo(markerLayer);
  });

  map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
}

/**
 * Format a date string to e.g. "Mon 10 Aug".
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  const d = new Date(isoDate + 'T12:00:00'); // noon to avoid TZ shifts
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Build a strip of cards HTML.
 * @param {object[]} days
 * @returns {string}
 */
function buildStrip(days) {
  return days.map(day => {
    if (day.weatherUnavailable) {
      return `
        <div class="rw-card rw-card--unavailable">
          <div class="rw-card__day">Day ${day.dayNumber}</div>
          <div class="rw-card__date">${formatDate(day.date)}</div>
          <div class="rw-card__dist">${day.distanceKm.toFixed(1)} km</div>
          <div class="rw-card__emoji">🔮</div>
          <div class="rw-card__label">Not yet available</div>
        </div>`;
    }

    const rain = day.rainProbability != null ? `${day.rainProbability}%` : '—';
    const wind = day.windSpeedMph != null
      ? `${Math.round(day.windSpeedMph)} mph ${day.windDirectionLabel}`
      : '—';
    const gusts = day.windGustsMph != null ? `gusts ${Math.round(day.windGustsMph)}` : '';

    return `
      <div class="rw-card">
        <div class="rw-card__day">Day ${day.dayNumber}</div>
        <div class="rw-card__date">${formatDate(day.date)}</div>
        <div class="rw-card__dist">${day.distanceKm.toFixed(1)} km</div>
        <div class="rw-card__emoji">${day.conditionEmoji}</div>
        <div class="rw-card__label">${day.conditionLabel}</div>
        <div class="rw-card__temp">${day.tempMin}–${day.tempMax}°C</div>
        <div class="rw-card__row">🌧 ${rain}</div>
        <div class="rw-card__row">💨 ${wind}</div>
        ${gusts ? `<div class="rw-card__row rw-card__gusts">${gusts}</div>` : ''}
      </div>`;
  }).join('');
}

/**
 * Render two forecast strips: on-route and at-start comparison.
 * @param {object[]} days
 * @param {object[]} startDays
 */
function renderForecastTable(days, startDays) {
  const container = document.getElementById('forecast-table');
  container.innerHTML = `
    <div class="rw-strip-section">
      <h3 class="rw-strip-label">Route forecast</h3>
      <div class="rw-strip">${buildStrip(days)}</div>
    </div>
    <div class="rw-strip-section">
      <h3 class="rw-strip-label">Start only</h3>
      <div class="rw-strip">${buildStrip(startDays)}</div>
    </div>`;
}

/**
 * Show an error message.
 * @param {string} message
 */
function showError(message) {
  const el = document.getElementById('error-msg');
  el.textContent = message;
  el.classList.remove('hidden');
}

/**
 * Hide the error message.
 */
function hideError() {
  const el = document.getElementById('error-msg');
  el.classList.add('hidden');
}
