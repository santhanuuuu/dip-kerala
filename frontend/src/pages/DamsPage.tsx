import { useState, useEffect, useMemo } from 'react';
import { fetchDams, type DamInfo } from '../lib/api';

const MUTED = '#4a5e62';

// Green = safe, amber = watch, red = danger -- based on % of Full Reservoir Level currently
// filled. General convention, not a KSEB-published per-dam standard.
function statusColor(pct: number | null): string {
  if (pct === null) return MUTED;
  if (pct >= 90) return '#B54A2A';
  if (pct >= 75) return '#D99A2B';
  return '#1F6F64';
}
function statusLabel(pct: number | null): string {
  if (pct === null) return 'UNKNOWN';
  if (pct >= 90) return 'DANGER';
  if (pct >= 75) return 'WATCH';
  return 'SAFE';
}

function SpecRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, padding: '6px 0', borderBottom: '1px solid rgba(18,38,43,0.06)' }}>
      <span>{label}</span>
      <span style={{ color: '#12262B', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/** Slide-up detail panel for one dam -- opened by tapping its row in the compact list.
 * Deliberately a simple fixed overlay (no extra dependency) matching this app's existing
 * inline-style conventions. */
function DamDetail({ dam, onClose }: { dam: DamInfo; onClose: () => void }) {
  const color = dam.has_live_data ? statusColor(dam.storage_percentage) : MUTED;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(18,38,43,0.35)', zIndex: 1200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff', borderRadius: '8px 8px 0 0', width: '100%', maxWidth: 520,
          maxHeight: '85vh', overflowY: 'auto', padding: 24, boxShadow: '0 -8px 32px rgba(18,38,43,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: '#12262B' }}>{dam.name}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: MUTED, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 16 }}>
          {dam.has_live_data ? `● ${statusLabel(dam.storage_percentage)}` : 'NO LIVE DATA'}
        </div>

        {dam.has_live_data && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ height: 8, background: 'rgba(18,38,43,0.08)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(dam.storage_percentage ?? 0, 100)}%`, background: color }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED, marginTop: 6 }}>
              <span>{dam.storage_percentage !== null ? `${dam.storage_percentage.toFixed(1)}% full` : ''}</span>
              <span>{dam.current_level_m !== null ? `${dam.current_level_m} m` : ''}</span>
            </div>
          </div>
        )}

        <div>
          <SpecRow label="District" value={dam.district} />
          <SpecRow label="River" value={dam.river} />
          <SpecRow label="Owner" value={dam.owner} />
          <SpecRow label="Type" value={dam.dam_type} />
          <SpecRow label="Reservoir" value={dam.reservoir_name} />
          <SpecRow label="Capacity" value={dam.capacity_mcm ? `${dam.capacity_mcm} MCM` : null} />
          <SpecRow label="FRL" value={dam.frl_m ? `${dam.frl_m} m` : null} />
          <SpecRow label="Coordinates" value={dam.latitude && dam.longitude ? `${dam.latitude.toFixed(4)}, ${dam.longitude.toFixed(4)}` : null} />
        </div>

        {dam.has_live_data && dam.last_updated && (
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, marginTop: 12 }}>
            Updated {dam.last_updated}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DamsPage() {
  const [dams, setDams] = useState<DamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>('ALL');
  const [liveOnly, setLiveOnly] = useState(false);
  const [selected, setSelected] = useState<DamInfo | null>(null);

  useEffect(() => {
    fetchDams()
      .then((d) => {
        setDams(d.results || []);
        setNote(d.note || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const districts = useMemo(() => Array.from(new Set(dams.map((d) => d.district))).sort(), [dams]);

  // Dams currently in DANGER float to the top regardless of alphabetical/district order --
  // the whole point of "should show as red when it needs to" is that it's the first thing
  // you see, not something you have to scroll to find.
  const filtered = useMemo(() => {
    return dams
      .filter((d) => (districtFilter === 'ALL' || d.district === districtFilter) && (!liveOnly || d.has_live_data))
      .sort((a, b) => {
        const aPct = a.has_live_data ? (a.storage_percentage ?? -1) : -2;
        const bPct = b.has_live_data ? (b.storage_percentage ?? -1) : -2;
        return bPct - aPct;
      });
  }, [dams, districtFilter, liveOnly]);

  const liveCount = dams.filter((d) => d.has_live_data).length;
  const dangerCount = dams.filter((d) => d.has_live_data && (d.storage_percentage ?? 0) >= 90).length;

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
          DAM WATER LEVELS
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Kerala Dams
        </h1>
        {!loading && dams.length > 0 && (
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: '0 0 20px' }}>
            {liveCount} of {dams.length} have live data
            {dangerCount > 0 && <span style={{ color: '#B54A2A', fontWeight: 600 }}> · {dangerCount} in DANGER range</span>}
            . Tap a dam for full details.
          </p>
        )}

        {loading && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading…</div>}

        {!loading && dams.length === 0 && (
          <div style={{ padding: '32px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B', marginBottom: 8 }}>
              No dams in the database yet
            </div>
            <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0 }}>
              Restart the backend once to trigger the automatic seed, or run <code style={{ background: 'rgba(18,38,43,0.06)', padding: '1px 6px', borderRadius: 2 }}>python db/seed_dams.py</code> manually.
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

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 16, alignItems: 'center' }}>
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

            {/* Compact list -- one short row per dam, name + district + a colored status dot.
                Tap opens the full spec sheet instead of always showing it inline, which is
                what was making the page enormous with ~69 dams all expanded at once. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filtered.map((d, i) => {
                const color = d.has_live_data ? statusColor(d.storage_percentage) : 'rgba(18,38,43,0.2)';
                return (
                  <button
                    key={i}
                    onClick={() => setSelected(d)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '12px 16px', background: '#ffffff',
                      border: '1px solid rgba(18,38,43,0.08)', borderLeft: `4px solid ${color}`,
                      borderRadius: 2,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, color: '#12262B', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.name}
                        </div>
                        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED }}>{d.district}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {d.has_live_data ? (
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color, fontWeight: 700 }}>
                          {d.storage_percentage !== null ? `${d.storage_percentage.toFixed(0)}%` : statusLabel(null)}
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>NO DATA</span>
                      )}
                      <span style={{ color: MUTED, fontSize: 12 }}>›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {selected && <DamDetail dam={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}