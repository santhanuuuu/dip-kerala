import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { fetchDistrictRanking, fetchDailyHistory, type DistrictRanking, type DailyHistory } from '../lib/api';

const MUTED = '#4a5e62';
const CARD = { background: '#ffffff', border: '1px solid rgba(18,38,43,0.09)', borderRadius: 2, boxShadow: '0 1px 6px rgba(18,38,43,0.05)' } as const;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#ffffff', border: '1px solid rgba(31,111,100,0.3)', borderRadius: 3, padding: '10px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, boxShadow: '0 4px 12px rgba(18,38,43,0.1)' }}>
      <div style={{ color: MUTED, marginBottom: 6, letterSpacing: '0.04em' }}>{label}</div>
      {payload.map((entry: any) => (
        <div key={entry.name} style={{ color: entry.color, marginBottom: 2 }}>
          {entry.name}: <span style={{ color: '#12262B' }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [ranking, setRanking] = useState<DistrictRanking[]>([]);
  const [rankingNote, setRankingNote] = useState('');
  const [rankingLoading, setRankingLoading] = useState(true);
  const [history, setHistory] = useState<DailyHistory[]>([]);
  const [totalAllTime, setTotalAllTime] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    fetchDistrictRanking()
      .then((d) => { setRanking(d.results); setRankingNote(d.note); })
      .finally(() => setRankingLoading(false));
    fetchDailyHistory()
      .then((d) => { setHistory(d.results); setTotalAllTime(d.totalAllTime); })
      .finally(() => setHistoryLoading(false));
  }, []);

  const peakDay = history.reduce((max, d) => (d.totalQueries > (max?.totalQueries ?? -1) ? d : max), null as DailyHistory | null);
  const avgCritical = history.length ? (history.reduce((s, d) => s + d.criticalCount, 0) / history.length).toFixed(1) : '0';

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>HISTORICAL ANALYTICS — DIP/KL</div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Risk Intelligence Dashboard</h1>
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0 }}>
            Real usage history from this deployment · live district risk sampling
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Queries (all time)', value: String(totalAllTime), sub: 'real count', color: '#1F6F64' },
            { label: 'Peak Day (last 7d)', value: peakDay ? String(peakDay.totalQueries) : '--', sub: peakDay?.date || 'no data yet', color: '#1F6F64' },
            { label: 'Avg. Critical/Day', value: avgCritical, sub: 'last 7 days', color: '#B54A2A' },
            { label: 'Districts Sampled', value: String(ranking.length), sub: 'of 14 total', color: '#7C9A3C' },
          ].map(card => (
            <div key={card.label} style={{ ...CARD, padding: '16px 18px', borderTop: `2px solid ${card.color}` }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' as const }}>{card.label}</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 26, fontWeight: 600, color: card.color, lineHeight: 1, marginBottom: 4 }}>{card.value}</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.06em' }}>{card.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ ...CARD, padding: '20px 24px' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 20 }}>RISK ALERT TREND — 7 DAYS (REAL)</div>
            {!historyLoading && history.length === 0 ? (
              <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, textAlign: 'center', padding: '40px 0' }}>
                No queries recorded yet on this deployment. This chart populates as real users search places.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={history} barGap={2}>
                  <XAxis dataKey="date" tick={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fill: MUTED }} axisLine={{ stroke: 'rgba(18,38,43,0.1)' }} tickLine={false} />
                  <YAxis tick={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(18,38,43,0.03)' }} />
                  <Bar dataKey="criticalCount" name="Critical" fill="#B54A2A" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="highRiskCount" name="High" fill="#D99A2B" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ ...CARD, padding: '20px 24px' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 20 }}>QUERY VOLUME — 7 DAYS (REAL)</div>
            {!historyLoading && history.length === 0 ? (
              <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, textAlign: 'center', padding: '40px 0' }}>
                No usage history yet.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history}>
                  <CartesianGrid stroke="rgba(18,38,43,0.06)" strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fill: MUTED }} axisLine={{ stroke: 'rgba(18,38,43,0.1)' }} tickLine={false} />
                  <YAxis tick={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fill: MUTED }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(31,111,100,0.3)' }} />
                  <Line type="monotone" dataKey="totalQueries" name="Queries" stroke="#1F6F64" strokeWidth={2} dot={{ fill: '#1F6F64', strokeWidth: 0, r: 3 }} activeDot={{ r: 5, fill: '#2a8f82' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div style={{ ...CARD, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em' }}>DISTRICT RISK RANKING — LIVE SAMPLE (REAL)</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['Flood', '#B54A2A'], ['Landslide', '#D99A2B'], ['Combined', '#1F6F64']].map(([label, color]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 2, background: color }} />
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.04em' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
          {rankingNote && <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11, color: MUTED, marginBottom: 16 }}>{rankingNote}</p>}

          {rankingLoading && <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Computing live district scores (this calls the real models for a sample of places per district)...</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranking.map((d, i) => {
              const level = d.combined >= 80 ? 'CRITICAL' : d.combined >= 60 ? 'HIGH' : d.combined >= 40 ? 'MODERATE' : 'LOW';
              const levelColor = d.combined >= 80 ? '#B54A2A' : d.combined >= 60 ? '#D99A2B' : d.combined >= 40 ? '#7C9A3C' : '#1F6F64';
              return (
                <div key={d.district} style={{ display: 'grid', gridTemplateColumns: '24px 130px 1fr 60px', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, textAlign: 'right' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: '#12262B' }}>{d.district}</span>
                  <div style={{ position: 'relative', height: 14 }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(18,38,43,0.05)', borderRadius: 1 }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, height: 6, width: `${d.floodRisk}%`, background: '#B54A2A', borderRadius: '1px 1px 0 0' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, height: 6, width: `${d.landslideRisk}%`, background: '#D99A2B', borderRadius: '0 0 1px 1px' }} />
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${d.combined}%`, width: 2, background: '#1F6F64', borderRadius: 1 }} />
                  </div>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: levelColor, letterSpacing: '0.08em', textAlign: 'right' }}>{level}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
