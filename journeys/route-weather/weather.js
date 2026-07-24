/**
 * weather.js — Open-Meteo API calls for Route Weather
 * UK-only: uses the ukmo_seamless model.
 */

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const FORECAST_DAYS_LIMIT = 7;

/**
 * Convert degrees to an 8-point compass label.
 * @param {number} degrees
 * @returns {string}
 */
function getWindDirectionLabel(degrees) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((degrees % 360) + 360) % 360 / 45) % 8;
  return dirs[index];
}

/**
 * Map WMO weather interpretation code to a readable label.
 * @param {number} code
 * @returns {string}
 */
function getConditionLabel(code) {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code === 51 || code === 53 || code === 55) return 'Drizzle';
  if (code === 61 || code === 63 || code === 65) return 'Rain';
  if (code === 71 || code === 73 || code === 75) return 'Snow';
  if (code === 80 || code === 81 || code === 82) return 'Rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Unknown';
}

/**
 * Map WMO weather interpretation code to an emoji.
 * @param {number} code
 * @returns {string}
 */
function getConditionEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code === 51 || code === 53 || code === 55) return '🌦️';
  if (code === 61 || code === 63 || code === 65) return '🌧️';
  if (code === 71 || code === 73 || code === 75) return '🌨️';
  if (code === 80 || code === 81 || code === 82) return '🌦️';
  if (code === 85 || code === 86) return '🌨️';
  if (code === 95) return '⛈️';
  if (code === 96 || code === 99) return '⛈️';
  return '❓';
}

/**
 * Fetch weather for a single day at a given location.
 * @param {number} lat
 * @param {number} lon
 * @param {string} date  ISO date string e.g. "2026-08-10"
 * @returns {Promise<object>}
 */
async function fetchDayWeather(lat, lon, date) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'precipitation_sum',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'wind_direction_10m_dominant',
      'weathercode',
    ].join(','),
    wind_speed_unit: 'mph',
    precipitation_unit: 'mm',
    timezone: 'Europe/London',
    models: 'ukmo_seamless',
    start_date: date,
    end_date: date,
  });

  const response = await fetch(`${OPEN_METEO_BASE}?${params}`);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Open-Meteo error: ${data.reason || 'unknown'}`);
  }

  const d = data.daily;

  const windDirection = d.wind_direction_10m_dominant[0];

  return {
    tempMax: d.temperature_2m_max[0],
    tempMin: d.temperature_2m_min[0],
    rainProbability: d.precipitation_probability_max[0],
    precipitationMm: d.precipitation_sum[0],
    windSpeedMph: d.wind_speed_10m_max[0],
    windGustsMph: d.wind_gusts_10m_max[0],
    windDirection,
    windDirectionLabel: getWindDirectionLabel(windDirection),
    weatherCode: d.weathercode[0],
    conditionLabel: getConditionLabel(d.weathercode[0]),
    conditionEmoji: getConditionEmoji(d.weathercode[0]),
  };
}

/**
 * Fetch weather for all days, skipping those beyond the 7-day forecast window.
 * @param {object[]} days
 * @returns {Promise<object[]>}
 */
async function fetchAllDaysWeather(days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    days.map(async day => {
      const dayDate = new Date(day.date);
      const diffMs = dayDate - today;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays > FORECAST_DAYS_LIMIT) {
        return { ...day, weatherUnavailable: true };
      }

      try {
        const weather = await fetchDayWeather(day.midPoint.lat, day.midPoint.lon, day.date);
        return { ...day, ...weather };
      } catch (err) {
        console.warn(`Weather fetch failed for day ${day.dayNumber} (${day.date}):`, err.message);
        return { ...day, weatherUnavailable: true };
      }
    })
  );

  return results;
}
