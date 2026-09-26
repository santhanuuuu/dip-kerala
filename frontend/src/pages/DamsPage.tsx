import { useState, useEffect, useMemo } from 'react';
import { fetchDams, type DamInfo } from '../lib/api';

const MUTED = '#4a5e62';

function alertColor(pct: number | null): string {
  if (pct === null) return MUTED;
  if (pct >= 90) return '#B54A2A';
  if (pct >= 75) return '#D99A2B';
  return '#1F6F64';
}

export default function DamsPage() {
  const [dams, setDams] = useState<DamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [liveOnly, setLiveOnly] = useState(false);

  useEffect(() => {
    fetchDams()
      .then((d) => {
        setDams(d.results || []);
        setNote(d.note || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const districts = useMemo(() => Array.from(new Set(dams.map((d) => d.district))).sort(), [dams]);
  const filtered = dams.filter(
    (d) => (districtFilter === 'ALL' || d.district === districtFilter) && (!liveOnly || d.has_live_data)
  );
  const liveCount = dams.filter((d) => d.has_live_data).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
          DAM WATER LEVELS
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Kerala Dams
        </h1>
        {!loading && (
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: '0 0 20px' }}>
            {liveCount} of {dams.length} dams have live water-level data today.
          </p>
        )}

        {note && (
          <div style={{ padding: '10px 16px', marginBottom: 20, background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: '#8a6216' }}>
            {note}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 20, alignItems: 'center' }}>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 2, border: '1px solid rgba(18,38,43,0.2)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#12262B', background: '#ffffff' }}
          >
            <option value="ALL">All Districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button
            onClick={() => setLiveOnly((v) => !v)}
            style={{
              padding: '8px 16px', borderRadius: 2, cursor: 'pointer',
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 600,
              background: liveOnly ? '#1F6F64' : '#ffffff',
              color: liveOnly ? '#F2F4EF' : MUTED,
              border: `1px solid ${liveOnly ? '#1F6F64' : 'rgba(18,38,43,0.2)'}`,
            }}
          >
            ● Live data only
          </button>
        </div>

        {loading && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading…</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.map((d, i) => (
            <div key={i} style={{ padding: 16, background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderLeft: `3px solid ${d.has_live_data ? alertColor(d.storage_percentage) : 'rgba(18,38,43,0.15)'}`, borderRadius: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 15, color: '#12262B' }}>{d.name}</div>
                {d.has_live_data ? (
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#1F6F64', letterSpacing: '0.06em' }}>● LIVE</span>
                ) : (
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.06em' }}>NO LIVE DATA</span>
                )}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginTop: 2 }}>
                {d.district}{d.river ? ` · ${d.river}` : ''}
              </div>

              {d.has_live_data ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED }}>
                    <span>STORAGE</span>
                    <span style={{ color: alertColor(d.storage_percentage), fontWeight: 600 }}>
                      {d.storage_percentage !== null ? `${d.storage_percentage.toFixed(1)}%` : '--'}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(18,38,43,0.08)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(d.storage_percentage ?? 0, 100)}%`, background: alertColor(d.storage_percentage) }} />
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: '#12262B', marginTop: 8 }}>
                    Level: {d.current_level_m ?? '--'} m{d.frl_m ? ` (FRL ${d.frl_m} m)` : ''}
                  </div>
                  {d.last_updated && (
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, marginTop: 4 }}>
                      Updated {d.last_updated}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED, marginTop: 12 }}>
                  {d.capacity_mcm ? `Capacity: ${d.capacity_mcm} MCM` : 'No public live telemetry for this dam.'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}