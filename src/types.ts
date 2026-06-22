export type Coordinate = {
  lat: number;
  lon: number;
};

export type RoutePoint = Coordinate & {
  label: string;
  distanceMiles: number;
  eta: Date;
  durationMinutes: number;
};

export type WeatherPoint = RoutePoint & {
  temperature: number;
  apparentTemperature: number;
  precipitationProbability: number;
  precipitation: number;
  cloudCover: number;
  isDay: boolean;
  shortwaveRadiation: number;
  sunExposure: number;
  windSpeed: number;
  weatherCode: number;
  segmentHigh: number;
  segmentLow: number;
};

export type RouteWeather = {
  fromLabel: string;
  toLabel: string;
  totalMiles: number;
  totalMinutes: number;
  points: WeatherPoint[];
};
