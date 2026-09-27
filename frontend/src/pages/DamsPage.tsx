import { useState, useEffect, useMemo } from 'react';
import { fetchDams, type DamInfo } from '../lib/api';

const MUTED = '#4a5e62';

// Green = safe, amber = watch, red = danger -- based on % of Full Reservoir Level currently
// filled. Thresholds are a reasonable general convention for reservoir alert levels, not a
// KSEB-published standard specific to each dam -- shown as a general indicator, not an
// official warning.
function statusColor(pct: number | null): string {
  if (pct === null) return MUTED;
  if (pct >= 90) return '#B54A2A'; // red -- danger
  if (pct >= 75) return '#D99A2B'; // amber -- watch
  return '#1F6F64'; // green -- safe
}
function statusLabel(pct: number | null): string {
  if (pct === null) return 'UNKNOWN';
  if (pct >= 90) return 'DANGER';
  if (pct >= 75) return 'WATCH';
  return 'SAFE';
}
function statusBg(pct: number | null): string {
  if (pct === null) return 'rgba(18,38,43,0.03)';
  if (pct >= 90) return 'rgba(181,74,42,0.06)';
  if (pct >= 75) return 'rgba(217,154,43,0.06)';
  return 'rgba(31,111,100,0.05)';
}

function SpecRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED, padding: '3px 0' }}>
      <span>{label}</span>
      <span style={{ color: '#12262B', fontWeight: 500 }}>{value}</span>
    </div>
  );
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
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
          DAM WATER LEVELS
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Kerala Dams
        </h1>
        {!loading && dams.length > 0 && (
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: '0 0 20px' }}>
            {liveCount} of {dams.length} dams have live water-level data today.
          </p>
        )}

        {loading && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading…</div>}

        {/* Self-diagnosing empty state -- distinguishes "genuinely nothing in the database
            yet" (a setup step, not a bug) from "filtered down to nothing". */}
        {!loading && dams.length === 0 && (
          <div style={{ padding: '32px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B', marginBottom: 8 }}>
              No dams in the database yet
            </div>
            <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0 }}>
              This is a setup step, not a live-data issue -- run <code style={{ background: 'rgba(18,38,43,0.06)', padding: '1px 6px', borderRadius: 2 }}>python db/seed_dams.py</code> once
              against the production database to populate dam reference data.
            </p>
          </div>
        )}

        {!loading && dams.length > 0 && (
          <>
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

            {filtered.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>
                No dams match this filter.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {filtered.map((d, i) => {
                const color = d.has_live_data ? statusColor(d.storage_percentage) : MUTED;
                const bg = d.has_live_data ? statusBg(d.storage_percentage) : '#ffffff';
                return (
                  <div key={i} style={{ padding: 16, background: bg, border: `1px solid ${d.has_live_data ? color + '33' : 'rgba(18,38,43,0.08)'}`, borderLeft: `4px solid ${color}`, borderRadius: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 15, color: '#12262B' }}>{d.name}</div>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' as const }}>
                        {d.has_live_data ? `● ${statusLabel(d.storage_percentage)}` : 'NO LIVE DATA'}
                      </span>
                    </div>

                    {d.has_live_data && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ height: 5, background: 'rgba(18,38,43,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(d.storage_percentage ?? 0, 100)}%`, background: color }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, marginTop: 4 }}>
                          <span>{d.storage_percentage !== null ? `${d.storage_percentage.toFixed(1)}% full` : ''}</span>
                          <span>{d.current_level_m !== null ? `${d.current_level_m} m` : ''}</span>
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(18,38,43,0.08)' }}>
                      <SpecRow label="District" value={d.district} />
                      <SpecRow label="River" value={d.river} />
                      <SpecRow label="Owner" value={d.owner} />
                      <SpecRow label="Type" value={d.dam_type} />
                      <SpecRow label="Reservoir" value={d.reservoir_name} />
                      <SpecRow label="Capacity" value={d.capacity_mcm ? `${d.capacity_mcm} MCM` : null} />
                      <SpecRow label="FRL" value={d.frl_m ? `${d.frl_m} m` : null} />
                      <SpecRow label="Coordinates" value={d.latitude && d.longitude ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}` : null} />
                    </div>

                    {d.has_live_data && d.last_updated && (
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, marginTop: 8 }}>
                        Updated {d.last_updated}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}