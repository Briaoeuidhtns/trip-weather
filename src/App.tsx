import { lazy, Suspense, type FormEvent, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle, CloudRain, LocateFixed, Navigation, RotateCcw, ThermometerSun, Wind } from 'lucide-react';
import type { GeocodeResult } from './weather';

const WeatherCharts = lazy(() => import('./WeatherCharts'));

const DEFAULT_FROM = 'Denver, CO';
const DEFAULT_TO = 'Moab, UT';

type AppSearch = {
  from?: string;
  to?: string;
  departAt?: string;
};

type SubmittedRoute = {
  from: string;
  to: string;
  departAt: string;
  autoDepartAt: boolean;
};

export type ChartPoint = {
  name: string;
  eta: string;
  temp: number;
  feels: number;
  high: number;
  low: number;
  precip: number;
  cloud: number;
  wind: number;
};

export function validateAppSearch(search: Record<string, unknown>): AppSearch {
  return {
    from: stringSearchParam(search.from),
    to: stringSearchParam(search.to),
    departAt: stringSearchParam(search.departAt),
  };
}

export default function App() {
  const search = useSearch({ from: '/' });
  const navigate = useNavigate({ from: '/' });
  const [from, setFrom] = useState(search.from ?? DEFAULT_FROM);
  const [to, setTo] = useState(search.to ?? DEFAULT_TO);
  const [departAt, setDepartAt] = useState(search.departAt ?? currentDateTimeLocal());
  const [hasChangedDepartAt, setHasChangedDepartAt] = useState(search.departAt !== undefined);
  const [locatingField, setLocatingField] = useState<'from' | 'to' | null>(null);

  const submittedRoute = search.from && search.to ? { from: search.from, to: search.to, departAt: search.departAt ?? departAt, autoDepartAt: search.departAt === undefined } : null;
  const routeWeatherKey = submittedRoute
    ? ['route-weather', submittedRoute.from, submittedRoute.to, submittedRoute.autoDepartAt ? 'auto' : submittedRoute.departAt]
    : ['route-weather'];
  const routeWeatherQuery = useQuery({
    queryKey: routeWeatherKey,
    queryFn: async () => {
      if (!submittedRoute) throw new Error('Route search is missing.');
      const { buildRouteWeather } = await import('./weather');
      return buildRouteWeather(submittedRoute.from, submittedRoute.to, parseDateTimeLocal(submittedRoute.departAt));
    },
    enabled: submittedRoute !== null,
    placeholderData: keepPreviousData,
  });
  const routeWeather = routeWeatherQuery.data ?? null;
  const error = routeWeatherQuery.error instanceof Error ? routeWeatherQuery.error.message : '';
  const isAutoDepartAtRefresh = Boolean(submittedRoute?.autoDepartAt && routeWeather && routeWeatherQuery.isFetching && !routeWeatherQuery.isPlaceholderData);
  const isPlanningRoute = routeWeatherQuery.isFetching && !isAutoDepartAtRefresh;
  const showDashboardSkeleton = routeWeatherQuery.isPlaceholderData && routeWeatherQuery.isFetching;

  useEffect(() => {
    setFrom(search.from ?? DEFAULT_FROM);
    setTo(search.to ?? DEFAULT_TO);
    setDepartAt(search.departAt ?? currentDateTimeLocal());
    setHasChangedDepartAt(search.departAt !== undefined);
  }, [search.departAt, search.from, search.to]);

  useEffect(() => {
    if (hasChangedDepartAt) return;

    const updateDepartAt = () => setDepartAt(currentDateTimeLocal());
    updateDepartAt();
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      updateDepartAt();
      interval = window.setInterval(updateDepartAt, 60_000);
    }, msUntilNextMinute());

    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [hasChangedDepartAt]);

  useEffect(() => {
    if (!submittedRoute?.autoDepartAt || routeWeatherQuery.data === undefined) return;

    void routeWeatherQuery.refetch();
  }, [submittedRoute?.autoDepartAt, submittedRoute?.departAt]);

  function submit(event: FormEvent) {
    event.preventDefault();

    void navigate({
      search: {
        from: from.trim(),
        to: to.trim(),
        departAt: hasChangedDepartAt ? departAt : undefined,
      },
    });
  }

  function useCurrentLocation(field: 'from' | 'to') {
    if (!canUseGeolocation()) return;

    setLocatingField(field);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const label = `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
        if (field === 'from') setFrom(label);
        else setTo(label);
        setLocatingField(null);
      },
      () => setLocatingField(null),
    );
  }

  const chartData = routeWeather?.points.map((point) => ({
    name: point.label,
    eta: formatTime(point.eta),
    temp: Math.round(point.temperature),
    feels: Math.round(point.apparentTemperature),
    high: Math.round(point.segmentHigh),
    low: Math.round(point.segmentLow),
    precip: point.precipitationProbability,
    cloud: point.cloudCover,
    wind: Math.round(point.windSpeed),
  }));

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Drive-time forecast planner</p>
          <h1>Weather that meets you where you will actually be.</h1>
          <p className="hero-copy">
            Enter a start, destination, and departure time. The app samples your route, estimates your arrival time at each
            segment, and pulls the matching hourly forecast instead of showing static city weather.
          </p>
        </div>

        <form className="route-card" onSubmit={submit}>
          <label>
            Start
            <LocationInput
              id="from-location"
              value={from}
              onChange={setFrom}
              placeholder="Denver, CO"
              onUseCurrentLocation={() => useCurrentLocation('from')}
              isLocating={locatingField === 'from'}
            />
          </label>
          <label>
            Destination
            <LocationInput
              id="to-location"
              value={to}
              onChange={setTo}
              placeholder="Moab, UT"
              onUseCurrentLocation={() => useCurrentLocation('to')}
              isLocating={locatingField === 'to'}
            />
          </label>
          <label>
            Departure
            <div className="date-field">
              <input
                aria-label="Departure"
                type="datetime-local"
                value={departAt}
                onChange={(event) => {
                  setHasChangedDepartAt(true);
                  setDepartAt(event.target.value);
                }}
                onFocus={(event) => event.currentTarget.select()}
                required
              />
              <button
                aria-label="Reset departure time to now"
                className="date-reset"
                onClick={() => {
                  setHasChangedDepartAt(false);
                  setDepartAt(currentDateTimeLocal());
                }}
                title="Reset to now"
                type="button"
              >
                <RotateCcw size={15} aria-hidden="true" />
              </button>
            </div>
          </label>
          <button disabled={isPlanningRoute}>{isPlanningRoute ? 'Planning route...' : 'Show route weather'}</button>
          <p className="source-note">Uses Open-Meteo forecasts and the public OSRM demo router.</p>
        </form>
      </section>

      {error ? (
        <div className="error" role="alert">
          <AlertTriangle size={18} /> {error}
        </div>
      ) : null}

      {showDashboardSkeleton ? <DashboardSkeleton /> : null}

      {!showDashboardSkeleton && routeWeather && chartData ? (
        <section className="dashboard">
          <div className="summary-grid">
            <Metric icon={<Navigation />} label="Route" value={`${Math.round(routeWeather.totalMiles)} mi`} detail={`${formatDuration(routeWeather.totalMinutes)} total`} />
            <Metric icon={<ThermometerSun />} label="Temperature range" value={`${min(chartData, 'low')} - ${max(chartData, 'high')} F`} detail="Segment lows and highs along route" />
            <Metric icon={<CloudRain />} label="Peak precip chance" value={`${max(chartData, 'precip')}%`} detail="At estimated segment arrival" />
            <Metric icon={<Wind />} label="Peak wind" value={`${max(chartData, 'wind')} mph`} detail="Hourly wind near route points" />
          </div>

          <article className="panel route-overview">
            <div>
              <p className="eyebrow">Route</p>
              <h2>{routeWeather.fromLabel} to {routeWeather.toLabel}</h2>
            </div>
            <div className="route-table-wrap">
              <table className="route-table">
                <thead>
                  <tr>
                    <th scope="col">Stop</th>
                    <th scope="col">ETA</th>
                    <th scope="col">Forecast</th>
                    <th scope="col">Temp</th>
                    <th scope="col">Rain</th>
                  </tr>
                </thead>
                <tbody>
                  {routeWeather.points.map((point) => (
                    <tr key={`${point.lat}-${point.lon}-${point.label}`}>
                      <th scope="row">{point.label}</th>
                      <td>{formatTime(point.eta)}</td>
                      <td>{describeWeather(point.weatherCode)}</td>
                      <td>{Math.round(point.temperature)} F</td>
                      <td>{point.precipitationProbability}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <Suspense fallback={<ChartSkeleton />}>
            <WeatherCharts data={chartData} />
          </Suspense>
        </section>
      ) : null}
    </main>
  );
}

function ChartSkeleton() {
  return (
    <section className="charts" aria-label="Loading charts" aria-busy="true">
      {Array.from({ length: 3 }, (_, index) => (
        <article className="panel skeleton-chart" key={index}>
          <span className="skeleton-line skeleton-heading" />
          <div className="skeleton-graph" aria-hidden="true" />
        </article>
      ))}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <section className="dashboard dashboard-skeleton" aria-label="Loading route weather" aria-busy="true">
      <div className="summary-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="metric skeleton-card" key={index}>
            <span className="skeleton-line skeleton-icon" />
            <span className="skeleton-line skeleton-label" />
            <span className="skeleton-line skeleton-value" />
            <span className="skeleton-line skeleton-detail" />
          </article>
        ))}
      </div>

      <article className="panel route-overview skeleton-panel">
        <div>
          <span className="skeleton-line skeleton-label" />
          <span className="skeleton-line skeleton-heading" />
        </div>
        <div className="route-table-wrap skeleton-table" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-line" />
              <span className="skeleton-line" />
              <span className="skeleton-line" />
              <span className="skeleton-line" />
            </div>
          ))}
        </div>
      </article>

      <section className="charts">
        {Array.from({ length: 3 }, (_, index) => (
          <article className="panel skeleton-chart" key={index}>
            <span className="skeleton-line skeleton-heading" />
            <div className="skeleton-graph" aria-hidden="true" />
          </article>
        ))}
      </section>
    </section>
  );
}

function LocationInput({
  id,
  value,
  onChange,
  placeholder,
  onUseCurrentLocation,
  isLocating = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onUseCurrentLocation?: () => void;
  isLocating?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isFocused || value.trim().length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isActive = true;
    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      import('./weather')
        .then(({ searchLocations }) => searchLocations(value, controller.signal))
        .then((results) => {
          if (isActive) setSuggestions(results);
        })
        .catch((caught) => {
          if (isActive && !(caught instanceof DOMException && caught.name === 'AbortError')) {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (isActive) setIsLoading(false);
        });
    }, 250);

    return () => {
      isActive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isFocused, value]);

  const showSuggestions = isFocused && (isLoading || suggestions.length > 0);

  return (
    <div className="location-field">
      <input
        id={id}
        className={onUseCurrentLocation ? 'location-input-with-action' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          setIsFocused(true);
          event.currentTarget.select();
        }}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={`${id}-suggestions`}
        aria-expanded={showSuggestions}
        role="combobox"
        required
      />
      {onUseCurrentLocation ? (
        <button
          aria-label="Use current location"
          className="location-current"
          disabled={isLocating || !canUseGeolocation()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onUseCurrentLocation}
          title="Use current location"
          type="button"
        >
          <LocateFixed size={15} aria-hidden="true" />
        </button>
      ) : null}
      {showSuggestions ? (
        <div className="location-suggestions" id={`${id}-suggestions`} role="listbox">
          {isLoading ? <div className={`location-status${suggestions.length > 0 ? ' location-status-floating' : ''}`}>Searching...</div> : null}
          {suggestions.map((place) => {
            const label = labelPlace(place);
            return (
              <button
                className="location-suggestion"
                key={place.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(label);
                  setIsFocused(false);
                }}
                role="option"
                type="button"
              >
                <span>{place.name}</span>
                <small>{[place.admin1, place.country].filter(Boolean).join(', ')}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(date);
}

function currentDateTimeLocal() {
  return formatDateTimeLocal(new Date());
}

function msUntilNextMinute() {
  const now = new Date();
  return 60_000 - now.getSeconds() * 1000 - now.getMilliseconds();
}

function formatDateTimeLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocal(value: string) {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

function labelPlace(place: GeocodeResult) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

function canUseGeolocation() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

function describeWeather(code: number) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Clouds';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storms';
  return 'Mixed';
}

function min(data: Array<Record<string, number | string>>, key: string) {
  return Math.min(...data.map((item) => Number(item[key])));
}

function max(data: Array<Record<string, number | string>>, key: string) {
  return Math.max(...data.map((item) => Number(item[key])));
}

function stringSearchParam(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
