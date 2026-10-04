import { useState, useEffect, useMemo } from 'react';
import { fetchDams, type DamInfo, type DamRiskCategory } from '../lib/api';

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

/** KSEB/Irrigation feed timestamps come as "DD.MM.YYYY" (e.g. "03.10.2026") -- day first, NOT
 * the US month-first order. `new Date()` guesses month-first for an ambiguous string like
 * this, which silently produced wildly wrong "time ago" labels (a genuine ~2-month-old
 * reading was showing as "207d ago" because "01.08" got read as 8 Jan instead of 1 Aug).
 * Parsed explicitly here instead of trusting the Date constructor's guess. */
function parseFeedDate(s: string): number | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (m) {
    const [, dd, mm, yyyy] = m;
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = parseFeedDate(iso);
  if (t === null) return iso; // feed's raw string wasn't parseable -- show it as-is rather than "Invalid Date"
  const diffMs = Date.now() - t;
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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

/** Full-detail slide-up panel for one dam -- opened by tapping its tile. Deliberately a
 * simple fixed overlay (no extra dependency) matching this app's existing inline-style
 * conventions. Shows the "last updated" timestamp unconditionally, whether the reading is
 * live right now or a persisted last-known value. */
function DamDetail({ dam, onClose }: { dam: DamInfo; onClose: () => void }) {
  const hasAnyReading = dam.storage_percentage !== null;
  const color = hasAnyReading ? statusColor(dam.storage_percentage) : MUTED;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color, fontWeight: 700, letterSpacing: '0.06em' }}>
            {hasAnyReading ? `● ${statusLabel(dam.storage_percentage)}` : 'NO LIVE DATA'}
          </span>
          {hasAnyReading && !dam.is_live_today && (
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#8a6216', background: 'rgba(217,154,43,0.12)', padding: '2px 6px', borderRadius: 1, fontWeight: 600 }}>
              LAST KNOWN
            </span>
          )}
        </div>

        {hasAnyReading && (
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

        {/* Last-updated is shown for EVERY dam, live or not -- a dam with no reading at all
            (never had live telemetry) has nothing to show here, which is itself honest. */}
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, marginTop: 12 }}>
          {dam.last_updated
            ? `Details last updated ${timeAgo(dam.last_updated)}`
            : 'No live reading has ever been recorded for this dam.'}
        </div>

        {/* This is a real caveat about the GOVERNMENT source, not an error on our end --
            tiny check dams/regulators are confirmed (directly against KSEB's own feed) to
            report inconsistent percentages between polls, independent of anything we compute. */}
        {dam.is_small_capacity && (
          <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11, color: '#8a6216', background: 'rgba(217,154,43,0.1)', padding: '8px 10px', borderRadius: 2, marginTop: 10 }}>
            Small check dam/regulator ({dam.capacity_mcm} MCM capacity) -- KSEB's own readings for
            structures this size are known to swing inconsistently between updates. This isn't a
            fault in our data pipeline; it's relayed exactly as the government feed reports it.
          </div>
        )}
      </div>
    </div>
  );
}

const TABS: { key: DamRiskCategory; label: string }[] = [
  { key: 'high', label: 'High Risk' },
  { key: 'normal', label: 'Normal' },
  { key: 'no_live_data', label: 'No Live Data' },
];

/** One square tile in the grid -- name, status color, % (or a last-known/no-data badge), and
 * a last-updated stamp, always visible so staleness is never hidden. */
function DamTile({ dam, onOpen }: { dam: DamInfo; onOpen: () => void }) {
  const hasAnyReading = dam.storage_percentage !== null;
  const color = hasAnyReading ? statusColor(dam.storage_percentage) : 'rgba(18,38,43,0.25)';
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        aspectRatio: '1 / 1', width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: 14, background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)',
        borderTop: `4px solid ${color}`, borderRadius: 4,
      }}
    >
      <div>
        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, color: '#12262B', lineHeight: 1.25 }}>
          {dam.name}
        </div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, marginTop: 2 }}>{dam.district}</div>
      </div>

      <div>
        {hasAnyReading ? (
          <>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 20, color, fontWeight: 700, lineHeight: 1 }}>
              {dam.storage_percentage!.toFixed(0)}%
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, marginTop: 4 }}>
              {!dam.is_live_today && <span style={{ color: '#8a6216', fontWeight: 600 }}>LAST KNOWN · </span>}
              {dam.last_updated ? `Updated ${timeAgo(dam.last_updated)}` : ''}
            </div>
            {dam.is_small_capacity && (
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: '#8a6216', marginTop: 2 }}>
                ⚠ small dam, volatile reading
              </div>
            )}
          </>
        ) : (
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED }}>NO LIVE DATA</div>
        )}
      </div>
    </button>
  );
}

export default function DamsPage() {
  const [dams, setDams] = useState<DamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<DamRiskCategory>('high');
  const [selected, setSelected] = useState<DamInfo | null>(null);

  useEffect(() => {
    fetchDams()
      .then((d) => {
        setDams(d.results || []);
        setNote(d.note || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => ({
    high: dams.filter((d) => d.risk_category === 'high').length,
    normal: dams.filter((d) => d.risk_category === 'normal').length,
    no_live_data: dams.filter((d) => d.risk_category === 'no_live_data').length,
  }), [dams]);

  // Within a tab, dams closest to DANGER still float to the top -- the point of color-coding
  // is that the most urgent one is the first thing you see, not something to scroll for.
  const tabDams = useMemo(() => {
    return dams
      .filter((d) => d.risk_category === tab)
      .sort((a, b) => (b.storage_percentage ?? -1) - (a.storage_percentage ?? -1));
  }, [dams, tab]);

  // Default to a tab that actually has something in it, the first time data loads.
  useEffect(() => {
    if (!loading && dams.length > 0 && counts.high === 0) {
      setTab(counts.normal > 0 ? 'normal' : 'no_live_data');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
          DAM WATER LEVELS
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          Kerala Dams
        </h1>

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
              <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: '0 0 20px' }}>
                {note}
              </p>
            )}

            {/* Filter tabs -- High Risk / Normal / No Live Data, each with a live count. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 20 }}>
              {TABS.map((t) => {
                const active = tab === t.key;
                const tabColor = t.key === 'high' ? '#B54A2A' : t.key === 'normal' ? '#1F6F64' : MUTED;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    style={{
                      padding: '10px 18px', borderRadius: 2, cursor: 'pointer',
                      fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 600,
                      background: active ? tabColor : '#ffffff',
                      color: active ? '#ffffff' : MUTED,
                      border: `1px solid ${active ? tabColor : 'rgba(18,38,43,0.2)'}`,
                    }}
                  >
                    {t.label.toUpperCase()} · {counts[t.key]}
                  </button>
                );
              })}
            </div>

            {tabDams.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>
                No dams in this category.
              </div>
            )}

            {/* Square tile grid -- tap any tile for full details. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {tabDams.map((d, i) => (
                <DamTile key={i} dam={d} onOpen={() => setSelected(d)} />
              ))}
            </div>
          </>
        )}
      </div>

      {selected && <DamDetail dam={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}