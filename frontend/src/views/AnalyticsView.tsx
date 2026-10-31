import { useEffect, useState } from 'react';
import { api, AnalyticsPeriod, AnalyticsResponse, errorMessage } from '../api';
import { fmtDuration, fmtTotalSeconds } from '../format';

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
];

function BarChart({ data, valueKey }: { data: { bucket: string; plays: number; seconds: number; skipped: number }[]; valueKey: 'plays' | 'seconds' }) {
  if (data.length === 0) return <p className="muted">Nenhum dado para o período.</p>;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div className="chart">
      {data.map((d) => {
        const value = d[valueKey];
        const pct = (value / max) * 100;
        return (
          <div key={d.bucket} className="chart-bar-wrap" title={`${d.bucket}: ${value} plays`}>
            <div className="chart-bar" style={{ height: `${pct}%` }} />
            <div className="chart-label">{d.bucket}</div>
          </div>
        );
      })}
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
          <BarChart data={data.timeline} valueKey="plays" />

          <h2>Tempo ouvido ao longo do tempo</h2>
          <BarChart data={data.timeline} valueKey="seconds" />

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
