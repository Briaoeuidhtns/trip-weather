import type { Coordinate, RoutePoint, RouteWeather, WeatherPoint } from './types';

export type GeocodeResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
};

type OsrmRoute = {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
};

type ForecastResponse = {
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    precipitation: number[];
    cloud_cover: number[];
    is_day: number[];
    shortwave_radiation: number[];
    wind_speed_10m: number[];
    weather_code: number[];
  };
};

const METERS_PER_MILE = 1609.344;
const MAX_FORECAST_POINTS = 25;

export function labelPlace(place: GeocodeResult) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ name: trimmed, count: '5', language: 'en', format: 'json' });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });

  if (!response.ok) {
    throw new Error(`Could not search locations for ${query}.`);
  }

  const data = (await response.json()) as { results?: GeocodeResult[] };
  return data.results ?? [];
}

export async function buildRouteWeather(from: string, to: string, departAt: Date): Promise<RouteWeather> {
  const [origin, destination] = await Promise.all([geocode(from), geocode(to)]);
  const route = await fetchRoute(toCoordinate(origin), toCoordinate(destination));
  const routePoints = sampleRoute(route, departAt);
  const forecasts = await Promise.all(routePoints.map((point) => fetchForecast(point)));

  const points = routePoints.map((point, index) => mergeWeather(point, forecasts[index], routePoints[index - 1]?.eta ?? point.eta));

  return {
    fromLabel: labelPlace(origin),
    toLabel: labelPlace(destination),
    totalMiles: route.distance / METERS_PER_MILE,
    totalMinutes: route.duration / 60,
    points,
  };
}

function toCoordinate(place: GeocodeResult): Coordinate {
  return { lat: place.latitude, lon: place.longitude };
}

async function geocode(query: string): Promise<GeocodeResult> {
  const coordinate = parseCoordinateQuery(query);
  if (coordinate) {
    return {
      id: 0,
      name: query.startsWith('Current location') ? 'Current location' : `${coordinate.lat.toFixed(4)}, ${coordinate.lon.toFixed(4)}`,
      latitude: coordinate.lat,
      longitude: coordinate.lon,
    };
  }

  const searchTerms = [query, query.split(',')[0]?.trim()].filter((term, index, terms) => term && terms.indexOf(term) === index);

  for (const searchTerm of searchTerms) {
    const result = await geocodeTerm(searchTerm);
    if (result) return result;
  }

  throw new Error(`No location found for "${query}".`);
}

function parseCoordinateQuery(query: string): Coordinate | null {
  const match = query.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  return { lat, lon };
}

async function geocodeTerm(query: string): Promise<GeocodeResult | null> {
  const results = await searchLocations(query);
  return results[0] ?? null;
}

async function fetchRoute(origin: Coordinate, destination: Coordinate): Promise<OsrmRoute> {
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const params = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'false' });
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?${params}`);

  if (!response.ok) {
    throw new Error('Routing service failed. Try more specific city names.');
  }

  const data = (await response.json()) as { routes?: OsrmRoute[] };
  const route = data.routes?.[0];
  if (!route) {
    throw new Error('No driving route found between those locations.');
  }

  return route;
}

function sampleRoute(route: OsrmRoute, departAt: Date): RoutePoint[] {
  const coordinates = route.geometry.coordinates;
  const segmentLengths = coordinates.slice(1).map((coord, index) => distanceMeters(coordinates[index], coord));
  const totalGeometryDistance = segmentLengths.reduce((sum, value) => sum + value, 0);
  const sampleCount = Math.min(MAX_FORECAST_POINTS, Math.max(4, Math.ceil(route.duration / 1200) + 1));

  return Array.from({ length: sampleCount }, (_, index) => {
    const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const targetDistance = totalGeometryDistance * ratio;
    const coordinate = coordinateAtDistance(coordinates, segmentLengths, targetDistance);
    const bearingStart = coordinateAtDistance(coordinates, segmentLengths, Math.max(0, targetDistance - 400));
    const bearingEnd = coordinateAtDistance(coordinates, segmentLengths, Math.min(totalGeometryDistance, targetDistance + 400));
    const durationMinutes = (route.duration / 60) * ratio;

    return {
      lat: coordinate[1],
      lon: coordinate[0],
      label: index === 0 ? 'Start' : index === sampleCount - 1 ? 'Arrival' : `Mile ${Math.round((route.distance / METERS_PER_MILE) * ratio)}`,
      distanceMiles: (route.distance / METERS_PER_MILE) * ratio,
      eta: new Date(departAt.getTime() + durationMinutes * 60_000),
      durationMinutes,
      bearing: bearingDegrees(bearingStart, bearingEnd),
    };
  });
}

function bearingDegrees(a: [number, number], b: [number, number]) {
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function coordinateAtDistance(coordinates: [number, number][], segmentLengths: number[], targetDistance: number) {
  let distanceSoFar = 0;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (distanceSoFar + segmentLength >= targetDistance) {
      const ratio = segmentLength === 0 ? 0 : (targetDistance - distanceSoFar) / segmentLength;
      const start = coordinates[index];
      const end = coordinates[index + 1];
      return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio] as [number, number];
    }

    distanceSoFar += segmentLength;
  }

  return coordinates[coordinates.length - 1];
}

function distanceMeters(a: [number, number], b: [number, number]) {
  const radius = 6_371_000;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

async function fetchForecast(point: RoutePoint): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    latitude: point.lat.toFixed(4),
    longitude: point.lon.toFixed(4),
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,cloud_cover,is_day,shortwave_radiation,wind_speed_10m,weather_code',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '7',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) {
    throw new Error('Weather service failed for one route segment.');
  }

  return (await response.json()) as ForecastResponse;
}

function mergeWeather(point: RoutePoint, forecast: ForecastResponse, segmentStart: Date): WeatherPoint {
  const hourIndex = closestIndex(forecast.hourly.time, point.eta);
  const [segmentLow, segmentHigh] = temperatureRange(forecast, segmentStart, point.eta, hourIndex);
  const sun = solarPosition(point.lat, point.lon, point.eta);
  const sunExposure = forecast.hourly.is_day[hourIndex] === 1 ? forecast.hourly.shortwave_radiation[hourIndex] : 0;
  const sunDirection = relativeSunDirection(point.bearing, sun.azimuth);

  return {
    ...point,
    temperature: forecast.hourly.temperature_2m[hourIndex],
    apparentTemperature: forecast.hourly.apparent_temperature[hourIndex],
    precipitationProbability: forecast.hourly.precipitation_probability[hourIndex],
    precipitation: forecast.hourly.precipitation[hourIndex],
    cloudCover: forecast.hourly.cloud_cover[hourIndex],
    isDay: forecast.hourly.is_day[hourIndex] === 1,
    shortwaveRadiation: forecast.hourly.shortwave_radiation[hourIndex],
    sunExposure,
    sunAzimuth: sun.azimuth,
    sunElevation: sun.elevation,
    sunDirection,
    glareRisk: glareRisk(point.bearing, sun.azimuth, sun.elevation, sunExposure),
    windSpeed: forecast.hourly.wind_speed_10m[hourIndex],
    weatherCode: forecast.hourly.weather_code[hourIndex],
    segmentHigh,
    segmentLow,
  };
}

function solarPosition(lat: number, lon: number, date: Date) {
  const dayOfYear = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000);
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (minutes / 60 - 12) / 24);
  const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const trueSolarTime = modulo(minutes + equationOfTime + 4 * lon, 1440);
  const hourAngle = toRadians(trueSolarTime / 4 - 180);
  const latitude = toRadians(lat);
  const zenith = Math.acos(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle));
  const azimuth = normalizeDegrees((Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)) * 180) / Math.PI + 180);

  return { azimuth, elevation: 90 - (zenith * 180) / Math.PI };
}

function relativeSunDirection(bearing: number, sunAzimuth: number) {
  const relative = signedAngleDifference(sunAzimuth, bearing);
  const absolute = Math.abs(relative);

  if (absolute <= 45) return 'Ahead';
  if (absolute >= 135) return 'Behind';
  return relative < 0 ? 'Driver side' : 'Passenger side';
}

function glareRisk(bearing: number, sunAzimuth: number, sunElevation: number, sunExposure: number) {
  if (sunElevation <= 0 || sunExposure <= 0) return 0;

  const forwardAngle = Math.abs(signedAngleDifference(sunAzimuth, bearing));
  const facingSunFactor = forwardAngle > 60 ? 0 : (60 - forwardAngle) / 60;
  const lowSunFactor = sunElevation <= 10 ? 1 : Math.max(0, (35 - sunElevation) / 25);
  const exposureFactor = Math.min(1, sunExposure / 800);

  return Math.round(100 * facingSunFactor * lowSunFactor * exposureFactor);
}

function signedAngleDifference(a: number, b: number) {
  return modulo(a - b + 180, 360) - 180;
}

function normalizeDegrees(value: number) {
  return modulo(value, 360);
}

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function temperatureRange(forecast: ForecastResponse, start: Date, end: Date, fallbackIndex: number): [number, number] {
  const startTime = Math.min(start.getTime(), end.getTime());
  const endTime = Math.max(start.getTime(), end.getTime());
  const temperatures = forecast.hourly.temperature_2m.filter((_, index) => {
    const time = new Date(forecast.hourly.time[index]).getTime();
    return time >= startTime && time <= endTime;
  });
  const values = temperatures.length > 0 ? temperatures : [forecast.hourly.temperature_2m[fallbackIndex]];

  return [Math.min(...values), Math.max(...values)];
}

function closestIndex(times: string[], target: Date) {
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const delta = Math.abs(new Date(time).getTime() - target.getTime());
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function describeWeather(code: number) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Clouds';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storms';
  return 'Mixed';
}
