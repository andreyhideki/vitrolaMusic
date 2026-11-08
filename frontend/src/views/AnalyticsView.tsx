import { useEffect, useState } from 'react';
import { api, AnalyticsPeriod, AnalyticsResponse, errorMessage } from '../api';
import { fmtDuration, fmtTotalSeconds } from '../format';

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function fmtBucket(bucket: string, period: AnalyticsPeriod): string {
  if (period === 'day') {
    const [, m, d] = bucket.split('-');
    return d && m ? `${d}/${m}` : bucket;
  }
  if (period === 'week') {
    const match = bucket.match(/^(\d{4})-W(\d{2})$/);
    return match ? `S${Number(match[2])}/${match[1].slice(2)}` : bucket;
  }
  if (period === 'month') {
    const [y, m] = bucket.split('-');
    const name = MONTHS[Number(m) - 1];
    return name && y ? `${name}/${y.slice(2)}` : bucket;
  }
  return bucket;
}

type TimelinePoint = { bucket: string; plays: number; seconds: number; skipped: number };

function BarChart({
  data,
  valueKey,
  period,
}: {
  data: TimelinePoint[];
  valueKey: 'plays' | 'seconds';
  period: AnalyticsPeriod;
}) {
  if (data.length === 0) return <p className="muted">Nenhum dado para o período.</p>;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const labelStep = data.length > 16 ? Math.ceil(data.length / 12) : 1;
  const fmtValue = (v: number) => (valueKey === 'seconds' ? fmtTotalSeconds(v) : String(v));
  return (
    <div className="chart-scroll">
      <div className="chart">
        {data.map((d, i) => {
          const value = d[valueKey];
          const pct = (value / max) * 100;
          const showLabel = i % labelStep === 0 || i === data.length - 1;
          return (
            <div key={d.bucket} className="chart-col" title={`${d.bucket}: ${fmtValue(value)}`}>
              <div className="chart-bar-area">
                <div className="chart-value">{value > 0 ? fmtValue(value) : ''}</div>
                <div className="chart-bar" style={{ height: `${pct}%` }} />
              </div>
              <div className="chart-label">{showLabel ? fmtBucket(d.bucket, period) : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingList({
  title,
  items,
  valueKey,
  label,
}: {
  title: string;
  items: { name: string | null; sub?: string | null; plays: number; seconds: number }[];
  valueKey: 'plays' | 'seconds';
  label: (item: { plays: number; seconds: number }) => string;
}) {
  const max = Math.max(...items.map((i) => i[valueKey]), 1);
  return (
    <div className="ranking">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">Nenhum dado.</p>
      ) : (
        <ol>
          {items.map((item, i) => {
            const value = item[valueKey];
            const pct = (value / max) * 100;
            return (
              <li key={i}>
                <div className="ranking-row">
                  <span className="ranking-num">{i + 1}</span>
                  <div className="ranking-info">
                    <div className="ranking-title">{item.name ?? 'Desconhecido'}</div>
                    {item.sub && <div className="muted">{item.sub}</div>}
                  </div>
                  <span className="ranking-value">{label(item)}</span>
                </div>
                <div className="ranking-bar-bg">
                  <div className="ranking-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function AnalyticsView() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api<AnalyticsResponse>(`/analytics?period=${period}`)
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [period]);

  return (
    <section>
      <h1>Estatísticas</h1>
      {error && <p className="error">{error}</p>}

      <div className="filter-bar">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            className={`badge ${period === p.value ? 'active' : ''}`}
            onClick={() => setPeriod(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {data && (
        <>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="stat-value">{data.totalPlays}</div>
              <div className="muted">plays</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{fmtTotalSeconds(data.totalSeconds)}</div>
              <div className="muted">de áudio</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{data.totalSkipped}</div>
              <div className="muted">pulos</div>
            </div>
          </div>

          <h2>Plays ao longo do tempo</h2>
          <BarChart data={data.timeline} valueKey="plays" period={period} />

          <h2>Tempo ouvido ao longo do tempo</h2>
          <BarChart data={data.timeline} valueKey="seconds" period={period} />

          <div className="rankings-grid">
            <RankingList
              title="Músicas"
              items={data.topTracks.map((t) => ({
                name: t.trackTitle,
                sub: t.artistName ?? undefined,
                plays: t.plays,
                seconds: t.seconds,
              }))}
              valueKey="plays"
              label={(item) => `${item.plays} · ${fmtTotalSeconds(item.seconds)}`}
            />
            <RankingList
              title="Artistas"
              items={data.topArtists.map((a) => ({
                name: a.name,
                plays: a.plays,
                seconds: a.seconds,
              }))}
              valueKey="plays"
              label={(item) => `${item.plays} · ${fmtTotalSeconds(item.seconds)}`}
            />
            <RankingList
              title="Álbuns"
              items={data.topAlbums.map((a) => ({
                name: a.albumTitle,
                sub: a.artistName ?? undefined,
                plays: a.plays,
                seconds: a.seconds,
              }))}
              valueKey="plays"
              label={(item) => `${item.plays} · ${fmtTotalSeconds(item.seconds)}`}
            />
            <RankingList
              title="Gêneros"
              items={data.topGenres.map((g) => ({
                name: g.name,
                plays: g.plays,
                seconds: g.seconds,
              }))}
              valueKey="plays"
              label={(item) => `${item.plays} · ${fmtTotalSeconds(item.seconds)}`}
            />
          </div>
        </>
      )}
    </section>
  );
}
