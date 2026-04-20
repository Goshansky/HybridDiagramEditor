import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import {
  getUserStats,
  getVersionActivity,
  type ActivityPeriod,
  type UserStatsResponse,
  type VersionActivityResponse,
} from '../services/userApi';

type Derived = {
  total: number;
  avg: number;
  max: number;
  peakValue: number;
  peakLabel: string;
  heatCells: Array<{ key: string; count: number; label: string; monthLabel?: string }>;
  trendPoints: Array<{ label: string; value: number; fullLabel: string }>;
  weekdayBars: Array<{ label: string; value: number }>;
};

export const UserStats: React.FC = () => {
  const [period, setPeriod] = useState<ActivityPeriod>('day');
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [activity, setActivity] = useState<VersionActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const [statsData, activityData] = await Promise.all([getUserStats(), getVersionActivity(period)]);
        if (!mounted) return;
        setStats(statsData);
        setActivity(activityData);
      } catch (e) {
        if (!mounted) return;
        const message = axios.isAxiosError(e)
          ? (e.response?.data?.detail ?? 'Не удалось загрузить статистику')
          : 'Не удалось загрузить статистику';
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [period]);

  const derived = useMemo(() => (activity ? deriveForPeriod(activity, period) : null), [activity, period]);

  return (
    <section
      style={{
        marginBottom: 14,
        borderTop: '1px solid var(--border-soft)',
        paddingTop: 12,
      }}
    >
      <div style={{ display: 'inline-flex', gap: 18, marginBottom: 12 }}>
        {periodTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setPeriod(item.id)}
            style={{
              border: 0,
              borderBottom: period === item.id ? '2px solid #00d1a7' : '2px solid transparent',
              background: 'transparent',
              color: period === item.id ? '#00d1a7' : 'var(--text-main)',
              opacity: period === item.id ? 1 : 0.78,
              padding: '6px 0',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 22,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? <div style={{ fontSize: 13, color: '#94a3b8' }}>Загрузка...</div> : null}
      {error ? <div style={{ fontSize: 13, color: '#ef4444' }}>{error}</div> : null}

      {!loading && !error && derived ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 16, marginBottom: 16 }}>
            <Metric title="Всего активности" value={String(derived.total)} />
            <Metric title="Средняя активность" value={String(derived.avg)} />
            <Metric title="Максимум за день" value={String(derived.max)} />
            <Metric title="Пик активности" value={String(derived.peakValue)} sub={derived.peakLabel} />
          </div>

          {period === 'year' ? (
            <YearHeatmap cells={derived.heatCells} />
          ) : (
            <LinearHeatmap cells={derived.heatCells} />
          )}

          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8' }}>
            <span>Меньше</span>
            {[0, 1, 2, 3, 4].map((lvl) => (
              <div
                key={lvl}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: heatColor(lvl / 4),
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              />
            ))}
            <span>Больше</span>
          </div>

          <div style={chartCardStyle}>
            <div style={chartTitleStyle}>Тренд активности</div>
            <TrendChart points={derived.trendPoints} />
          </div>

          {period !== 'year' ? (
            <div style={chartCardStyle}>
              <div style={chartTitleStyle}>Активность по дням недели</div>
              <WeekdayBars bars={derived.weekdayBars} />
            </div>
          ) : null}
        </>
      ) : null}

      {!loading && !error ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>Всего диаграмм: {stats?.totalDiagrams ?? '—'}</div>
      ) : null}
    </section>
  );
};

const chartCardStyle: React.CSSProperties = {
  marginTop: 16,
  border: '1px solid var(--border-soft)',
  borderRadius: 10,
  padding: 16,
  background: 'color-mix(in srgb, var(--surface) 92%, #0b1220 8%)',
};

const chartTitleStyle: React.CSSProperties = {
  marginBottom: 12,
  fontSize: 30,
  fontWeight: 700,
  color: 'var(--text-main)',
};

const Metric: React.FC<{ title: string; value: string; sub?: string }> = ({ title, value, sub }) => (
  <div>
    <div style={{ fontSize: 21, color: '#94a3b8', marginBottom: 4 }}>{title}</div>
    <div style={{ fontSize: 40, lineHeight: 1.15, fontWeight: 700, color: 'var(--text-main)' }}>{value}</div>
    {sub ? <div style={{ fontSize: 21, color: '#94a3b8', marginTop: 2 }}>{sub}</div> : null}
  </div>
);

const YearHeatmap: React.FC<{ cells: Array<{ key: string; count: number; label: string; monthLabel?: string }> }> = ({
  cells,
}) => {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const weekRows: Array<Array<{ key: string; count: number; label: string; monthLabel?: string }>> = [];
  for (let i = 0; i < cells.length; i += 7) weekRows.push(cells.slice(i, i + 7));

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gap: 6, gridTemplateRows: '20px auto' }}>
        <div style={{ display: 'flex', gap: 4, marginLeft: 22 }}>
          {weekRows.map((w) => (
            <div key={`m-${w[0]?.key ?? Math.random()}`} style={{ width: 12, fontSize: 11, color: '#94a3b8' }}>
              {w[0]?.monthLabel ?? ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: 4, width: 16, fontSize: 11, color: '#94a3b8' }}>
            <span>П</span>
            <span />
            <span>С</span>
            <span />
            <span>П</span>
            <span />
            <span />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {weekRows.map((week, idx) => (
              <div key={`w-${idx}`} style={{ display: 'grid', gridTemplateRows: 'repeat(7, 12px)', gap: 4 }}>
                {week.map((cell) => (
                  <Cell key={cell.key} count={cell.count} max={max} label={cell.label} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const LinearHeatmap: React.FC<{ cells: Array<{ key: string; count: number; label: string }> }> = ({ cells }) => {
  const max = Math.max(1, ...cells.map((c) => c.count));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {cells.map((cell) => (
        <Cell key={cell.key} count={cell.count} max={max} label={cell.label} />
      ))}
    </div>
  );
};

const Cell: React.FC<{ count: number; max: number; label: string }> = ({ count, max, label }) => (
  <div
    title={`${label}: ${count}`}
    style={{
      width: 12,
      height: 12,
      borderRadius: 3,
      border: '1px solid rgba(148, 163, 184, 0.25)',
      background: heatColor(max === 0 ? 0 : count / max),
    }}
  />
);

const TrendChart: React.FC<{ points: Array<{ label: string; value: number; fullLabel: string }> }> = ({ points }) => {
  const width = 900;
  const height = 250;
  const left = 46;
  const right = 20;
  const top = 10;
  const bottom = 28;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (width - left - right) / (points.length - 1) : 0;
  const stepY = (height - top - bottom) / maxValue;
  const yTicks = [0, Math.ceil(maxValue / 3), Math.ceil((2 * maxValue) / 3), maxValue];
  const polyline = points
    .map((p, i) => `${left + i * stepX},${height - bottom - p.value * stepY}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 250 }}>
      {yTicks.map((tick) => {
        const y = height - bottom - tick * stepY;
        return (
          <g key={`tick-${tick}`}>
            <line x1={left} y1={y} x2={width - right} y2={y} stroke="rgba(148, 163, 184, 0.28)" strokeDasharray="2 4" />
            <text x={left - 8} y={y + 4} fontSize="11" textAnchor="end" fill="#94a3b8">
              {tick}
            </text>
          </g>
        );
      })}
      <polyline points={polyline} fill="none" stroke="#00d1a7" strokeWidth="2.5" />
      {points.map((p, i) => {
        const x = left + i * stepX;
        const y = height - bottom - p.value * stepY;
        return <circle key={`dot-${p.fullLabel}`} cx={x} cy={y} r={4} fill="#00d1a7" opacity={0.95} />;
      })}
      {points.map((p, i) => {
        const x = left + i * stepX;
        if (i % Math.max(1, Math.floor(points.length / 8)) !== 0 && i !== points.length - 1) return null;
        return (
          <text key={`x-${p.fullLabel}`} x={x} y={height - 6} textAnchor="middle" fontSize="11" fill="#94a3b8">
            {p.label}
          </text>
        );
      })}
    </svg>
  );
};

const WeekdayBars: React.FC<{ bars: Array<{ label: string; value: number }> }> = ({ bars }) => {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 18, alignItems: 'end', minHeight: 180 }}>
      {bars.map((bar) => {
        const h = Math.max(2, Math.round((bar.value / max) * 96));
        return (
          <div key={bar.label} style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 34,
                height: h,
                margin: '0 auto',
                borderRadius: 3,
                background: 'linear-gradient(180deg, #42d957 0%, #2dbf49 100%)',
              }}
            />
            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 14 }}>{bar.label}</div>
            <div style={{ marginTop: 4, color: 'var(--text-main)', fontSize: 14, fontWeight: 700 }}>{bar.value}</div>
          </div>
        );
      })}
    </div>
  );
};

const periodTabs: Array<{ id: ActivityPeriod; label: string }> = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
];

function deriveForPeriod(activity: VersionActivityResponse, period: ActivityPeriod): Derived {
  const dayBuckets = buildDayBuckets(activity);
  let heatCells: Array<{ key: string; count: number; label: string; monthLabel?: string }> = [];
  let trendPoints: Array<{ label: string; value: number; fullLabel: string }> = [];

  if (period === 'year') {
    heatCells = dayBuckets.map((d, idx) => ({
      ...d,
      monthLabel: idx === 0 || d.key.slice(5, 7) !== dayBuckets[idx - 1].key.slice(5, 7) ? monthShort(d.key) : '',
    }));
    trendPoints = aggregateByMonth(dayBuckets);
  } else if (period === 'month') {
    heatCells = dayBuckets;
    trendPoints = dayBuckets.map((d) => ({
      label: new Date(d.key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''),
      value: d.count,
      fullLabel: d.key,
    }));
  } else if (period === 'week') {
    heatCells = dayBuckets;
    trendPoints = dayBuckets.map((d) => ({
      label: weekdayShortRu(d.key),
      value: d.count,
      fullLabel: d.key,
    }));
  } else {
    const byHour = new Map<number, number>();
    activity.items.forEach((i) => {
      const parsed = parseHourBucket(i.bucket);
      if (!parsed) return;
      byHour.set(parsed.hour, (byHour.get(parsed.hour) ?? 0) + i.count);
    });
    const todayKey = activity.endDate;
    const hourBuckets = Array.from({ length: 24 }, (_, h) => ({
      key: `${todayKey}T${String(h).padStart(2, '0')}:00:00`,
      count: byHour.get(h) ?? 0,
      label: `${String(h).padStart(2, '0')}:00`,
    }));
    heatCells = hourBuckets;
    trendPoints = hourBuckets.map((h) => ({
      label: h.label.slice(0, 2),
      value: h.count,
      fullLabel: h.label,
    }));
  }

  const values = heatCells.map((c) => c.count);
  const total = values.reduce((acc, v) => acc + v, 0);
  const avg = Math.round(total / Math.max(1, values.length));
  const max = values.length ? Math.max(...values) : 0;
  const peakIndex = values.findIndex((v) => v === max);
  const peakValue = max;
  const peakLabel = peakIndex >= 0 ? heatCells[peakIndex].label : '—';
  const weekdayBars = buildWeekdayBars(dayBuckets);

  return { total, avg, max, peakValue, peakLabel, heatCells, trendPoints, weekdayBars };
}

function buildDayBuckets(activity: VersionActivityResponse): Array<{ key: string; count: number; label: string }> {
  const start = new Date(activity.startDate);
  const end = new Date(activity.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const map = new Map(
    activity.items.map((i) => {
      const key = i.bucket.includes('T') ? i.bucket.slice(0, 10) : i.bucket;
      return [key, i.count];
    }),
  );
  const out: Array<{ key: string; count: number; label: string }> = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({
      key,
      count: map.get(key) ?? 0,
      label: prettyDateLabel(key),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function parseHourBucket(bucket: string): { hour: number; key: string } | null {
  const dt = new Date(bucket.includes('T') ? `${bucket}:00Z` : bucket);
  if (Number.isNaN(dt.getTime())) return null;
  return { hour: dt.getUTCHours(), key: dt.toISOString().slice(0, 13) };
}

function buildWeekdayBars(days: Array<{ key: string; count: number }>): Array<{ label: string; value: number }> {
  const order = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const sums = new Map(order.map((d) => [d, 0]));
  days.forEach((d) => {
    const wd = weekdayShortRu(d.key);
    sums.set(wd, (sums.get(wd) ?? 0) + d.count);
  });
  return order.map((label) => ({ label, value: sums.get(label) ?? 0 }));
}

function aggregateByMonth(days: Array<{ key: string; count: number }>): Array<{ label: string; value: number; fullLabel: string }> {
  const grouped = new Map<string, number>();
  days.forEach((d) => {
    const k = d.key.slice(0, 7);
    grouped.set(k, (grouped.get(k) ?? 0) + d.count);
  });
  return [...grouped.entries()].map(([k, value]) => {
    const dt = new Date(`${k}-01`);
    return {
      label: dt.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''),
      value,
      fullLabel: k,
    };
  });
}

function prettyDateLabel(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function weekdayShortRu(iso: string): string {
  const dt = new Date(iso);
  const s = dt.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthShort(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
}

function heatColor(norm: number): string {
  if (norm <= 0) return 'rgba(148, 163, 184, 0.22)';
  if (norm < 0.25) return '#0f8f4b';
  if (norm < 0.5) return '#17a857';
  if (norm < 0.75) return '#23c561';
  return '#42d957';
}
