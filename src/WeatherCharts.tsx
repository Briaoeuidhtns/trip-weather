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
import type { ChartPoint } from './App';

type WeatherChartsProps = {
  data: ChartPoint[];
};

export default function WeatherCharts({ data }: WeatherChartsProps) {
  return (
    <section className="charts">
      <article className="panel">
        <h2>Temperature by ETA</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ left: -12, right: 12, top: 18, bottom: 0 }}>
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
          <AreaChart data={data} margin={{ left: -12, right: 12, top: 18, bottom: 0 }}>
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

      <article className="panel">
        <h2>Cloud cover</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ left: -12, right: 12, top: 18, bottom: 0 }}>
            <defs>
              <linearGradient id="cloud-cover" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#c4b5fd" stopOpacity={0.75} />
                <stop offset="95%" stopColor="#c4b5fd" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#25324a" />
            <XAxis dataKey="eta" stroke="#8ea0bd" />
            <YAxis stroke="#8ea0bd" domain={[0, 100]} />
            <Tooltip contentStyle={{ background: '#101827', border: '1px solid #2c3b57' }} />
            <Area type="monotone" dataKey="cloud" name="Cloud cover %" stroke="#c4b5fd" fill="url(#cloud-cover)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </article>

      <article className="panel">
        <h2>Sun exposure</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ left: -12, right: 12, top: 18, bottom: 0 }}>
            <defs>
              <linearGradient id="sun-exposure" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#facc15" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#facc15" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#25324a" />
            <XAxis dataKey="eta" stroke="#8ea0bd" />
            <YAxis stroke="#8ea0bd" />
            <Tooltip contentStyle={{ background: '#101827', border: '1px solid #2c3b57' }} />
            <Area type="monotone" dataKey="sun" name="Sun W/m2" stroke="#facc15" fill="url(#sun-exposure)" strokeWidth={3} />
          </AreaChart>
        </ResponsiveContainer>
      </article>
    </section>
  );
}
