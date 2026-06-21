import { FormEvent, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AlertTriangle, CloudRain, MapPinned, Navigation, ThermometerSun, Wind } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildRouteWeather, describeWeather, labelPlace, searchLocations, type GeocodeResult } from './weather';

const DEFAULT_FROM = 'Denver, CO';
const DEFAULT_TO = 'Moab, UT';

type AppSearch = {
  from?: string;
  to?: string;
  departAt?: string;
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
  const hasRequestedLocation = useRef(false);

  const submittedRoute = search.from && search.to ? { from: search.from, to: search.to, departAt: search.departAt ?? departAt } : null;
  const routeWeatherQuery = useQuery({
    queryKey: ['route-weather', submittedRoute],
    queryFn: () => {
      if (!submittedRoute) throw new Error('Route search is missing.');
      return buildRouteWeather(submittedRoute.from, submittedRoute.to, parseDateTimeLocal(submittedRoute.departAt));
    },
    enabled: submittedRoute !== null,
  });
  const routeWeather = routeWeatherQuery.data ?? null;
  const error = routeWeatherQuery.error instanceof Error ? routeWeatherQuery.error.message : '';

  useEffect(() => {
    if (hasRequestedLocation.current || !navigator.geolocation) return;
    hasRequestedLocation.current = true;

    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      const label = `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
      setFrom((current) => (current === DEFAULT_FROM ? label : current));
    });
  }, []);

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
    const interval = window.setInterval(updateDepartAt, 30_000);

    return () => window.clearInterval(interval);
  }, [hasChangedDepartAt]);

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

  const chartData = routeWeather?.points.map((point) => ({
    name: point.label,
    eta: formatTime(point.eta),
    temp: Math.round(point.temperature),
    feels: Math.round(point.apparentTemperature),
    high: Math.round(point.segmentHigh),
    low: Math.round(point.segmentLow),
    precip: point.precipitationProbability,
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
            <LocationInput id="from-location" value={from} onChange={setFrom} placeholder="Denver, CO" />
          </label>
          <label>
            Destination
            <LocationInput id="to-location" value={to} onChange={setTo} placeholder="Moab, UT" />
          </label>
          <label>
            Departure
            <input
              type="datetime-local"
              value={departAt}
              onChange={(event) => {
                setHasChangedDepartAt(true);
                setDepartAt(event.target.value);
              }}
              required
            />
          </label>
          <button disabled={routeWeatherQuery.isFetching}>{routeWeatherQuery.isFetching ? 'Planning route...' : 'Show route weather'}</button>
          <p className="source-note">Uses Open-Meteo forecasts and the public OSRM demo router.</p>
        </form>
      </section>

      {error ? (
        <div className="error" role="alert">
          <AlertTriangle size={18} /> {error}
        </div>
      ) : null}

      {routeWeather && chartData ? (
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
            <div className="timeline">
              {routeWeather.points.map((point) => (
                <div className="stop" key={`${point.lat}-${point.lon}-${point.label}`}>
                  <div className="stop-pin"><MapPinned size={18} /></div>
                  <div>
                    <strong>{point.label}</strong>
                    <span>{formatTime(point.eta)} · {describeWeather(point.weatherCode)}</span>
                  </div>
                  <div className="stop-weather">
                    <b>{Math.round(point.temperature)} F</b>
                    <span>{point.precipitationProbability}% rain</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <section className="charts">
            <article className="panel">
              <h2>Temperature by ETA</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ left: -12, right: 12, top: 18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#25324a" />
                  <XAxis dataKey="eta" stroke="#8ea0bd" />
                  <YAxis stroke="#8ea0bd" />
                  <Tooltip contentStyle={{ background: '#101827', border: '1px solid #2c3b57' }} />
                  <Legend />
                  <Line type="monotone" dataKey="temp" name="Temp F" stroke="#ffb86b" strokeWidth={3} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="feels" name="Feels F" stroke="#ff6b8a" strokeWidth={2} />
                  <Line type="monotone" dataKey="high" name="Segment high" stroke="#ffd166" strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="low" name="Segment low" stroke="#6bdcff" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </article>

            <article className="panel">
              <h2>Precipitation risk</h2>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ left: -12, right: 12, top: 18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="precip" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#67e8f9" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#67e8f9" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#25324a" />
                  <XAxis dataKey="eta" stroke="#8ea0bd" />
                  <YAxis stroke="#8ea0bd" domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#101827', border: '1px solid #2c3b57' }} />
                  <Area type="monotone" dataKey="precip" name="Precip chance %" stroke="#67e8f9" fill="url(#precip)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </article>
          </section>
        </section>
      ) : null}
    </main>
  );
}

function LocationInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (value: string) => void; placeholder: string }) {
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
      searchLocations(value, controller.signal)
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={`${id}-suggestions`}
        aria-expanded={showSuggestions}
        role="combobox"
        required
      />
      {showSuggestions ? (
        <div className="location-suggestions" id={`${id}-suggestions`} role="listbox">
          {isLoading ? <div className="location-status">Searching...</div> : null}
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

function min(data: Array<Record<string, number | string>>, key: string) {
  return Math.min(...data.map((item) => Number(item[key])));
}

function max(data: Array<Record<string, number | string>>, key: string) {
  return Math.max(...data.map((item) => Number(item[key])));
}

function stringSearchParam(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
