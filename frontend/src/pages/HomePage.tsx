import { useState, useEffect } from 'react';
import { riskColor, type Place } from '../data/mockData';
import { fetchAllPlaces, fetchRealAlerts } from '../lib/api';
import { type Page } from '../App';

interface HomePageProps {
  navigate: (page: Page, placeId?: number) => void;
}

const CARD = { background: '#ffffff', border: '1px solid rgba(18, 38, 43, 0.1)', borderRadius: 2 } as const;
const MUTED = '#4a5e62';

export default function HomePage({ navigate }: HomePageProps) {
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allPlaces, setAllPlaces] = useState<Place[]>([]);
  const [alerts, setAlerts] = useState<ReturnType<typeof fetchRealAlerts> extends Promise<infer T> ? T : never>([]);
  const [districtNames, setDistrictNames] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllPlaces()
      .then((places) => {
        setAllPlaces(places);
        setDistrictNames([...new Set(places.map((p) => p.district))].sort());
      })
      .catch((e) => setLoadError(e.message));
    fetchRealAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  const handleSearch = () => {
    if (!query.trim() && !district) return;
    setLoading(true);
    const filtered = allPlaces.filter((p) => {
      const nameMatch = !query.trim() || p.name.toLowerCase().includes(query.toLowerCase());
      const districtMatch = !district || p.district === district;
      return nameMatch && districtMatch;
    });
    setResults(filtered);
    setSearched(true);
    setLoading(false);
  };

  const typeLabel: Record<string, string> = {
    gram_panchayat: 'Gram Panchayat',
    municipality: 'Municipality',
    municipal_corporation: 'Municipal Corporation',
    city: 'City',
  };

  const criticalCount = alerts.filter(a => a.riskLevel === 'Critical').length;
  const highCount = alerts.filter(a => a.riskLevel === 'High').length;

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      {/* Hero */}
      <div style={{ padding: '64px 24px 48px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        {/* Status pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          padding: '5px 14px',
          border: '1px solid rgba(181, 74, 42, 0.35)',
          background: 'rgba(181, 74, 42, 0.06)',
          borderRadius: 2, marginBottom: 32,
          fontFamily: 'IBM Plex Mono, monospace', fontSize: 11,
          color: '#B54A2A', letterSpacing: '0.08em',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B54A2A', display: 'inline-block' }} className="animate-pulse-risk" />
          ACTIVE MONSOON SEASON · {criticalCount} CRITICAL · {highCount} HIGH ALERTS
          <span style={{ color: MUTED, marginLeft: 4 }}>{new Date().toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()}</span>
        </div>

        <h1 style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: 700, color: '#12262B',
          margin: '0 0 16px', lineHeight: 1.05, letterSpacing: '-0.02em',
        }}>
          Disaster Intelligence<br />
          <span style={{ color: '#1F6F64' }}>Platform</span> — Kerala
        </h1>

        <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 16, color: MUTED, margin: '0 0 40px', lineHeight: 1.6, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto' }}>
          Live flood and landslide risk assessment for Kerala.
          Search any panchayat, municipality, or city by name.
        </p>

        {/* Search box */}
        <div style={{
          background: '#ffffff',
          border: '1px solid rgba(18, 38, 43, 0.15)',
          borderRadius: 4, padding: 4,
          display: 'flex', gap: 4,
          maxWidth: 680, margin: '0 auto 48px',
          boxShadow: '0 2px 8px rgba(18,38,43,0.06)',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search panchayat, municipality, city…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              padding: '12px 16px',
              color: '#12262B',
              fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 15,
            }}
          />
          <select
            value={district}
            onChange={e => setDistrict(e.target.value)}
            style={{
              background: '#F2F4EF',
              border: '1px solid rgba(18, 38, 43, 0.1)',
              borderRadius: 3, padding: '0 12px',
              color: district ? '#12262B' : MUTED,
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 11,
              cursor: 'pointer', outline: 'none', letterSpacing: '0.04em',
            }}
          >
            <option value="">ALL DISTRICTS</option>
            {districtNames.map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: loading ? '#2a8f82' : '#1F6F64',
              border: 'none', borderRadius: 3,
              cursor: loading ? 'wait' : 'pointer',
              color: '#F2F4EF',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13,
              letterSpacing: '0.04em', transition: 'background 0.15s',
            }}
          >
            {loading ? '…' : 'Query Risk'}
          </button>
        </div>

        {loadError && (
          <div style={{ maxWidth: 900, margin: '12px auto 0', padding: '10px 16px', background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>
            Could not load the place list from the backend: {loadError}
            <br />Check that the backend is running at the URL set in VITE_API_URL, and that CORS/FRONTEND_URL match your frontend's actual port.
          </div>
        )}

      </div>

      {/* Results */}
      {searched && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(18,38,43,0.08)' }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, letterSpacing: '0.08em' }}>
              {results.length > 0 ? `${results.length} PLACES FOUND` : 'NO RESULTS'}
            </span>
            {results.length === 0 && (
              <button onClick={() => navigate('submit')} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#D99A2B', background: 'none', border: '1px solid rgba(217,154,43,0.4)', padding: '4px 10px', borderRadius: 2, cursor: 'pointer', letterSpacing: '0.06em' }}>
                + SUBMIT MISSING PLACE
              </button>
            )}
          </div>

          {results.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {results.map(place => {
                const alert = alerts.find(a => a.placeId === place.id);
                const risk = alert?.riskLevel;
                return (
                  <button
                    key={place.id}
                    onClick={() => navigate('manifest', place.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 16,
                      padding: '14px 18px',
                      background: '#ffffff',
                      border: '1px solid rgba(18,38,43,0.08)',
                      borderLeft: risk ? `3px solid ${riskColor[risk]}` : '3px solid transparent',
                      cursor: 'pointer', textAlign: 'left', borderRadius: 2,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f5f7f3')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
                  >
                    <div>
                      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 15, color: '#12262B' }}>{place.name}</div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.04em', marginTop: 2 }}>
                        {place.nameMalayalam} · {typeLabel[place.type]}
                      </div>
                    </div>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED }}>{place.district}</span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED }}>{place.lat.toFixed(4)}°N {place.lon.toFixed(4)}°E</span>
                    {risk ? (
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 600, color: riskColor[risk], background: `${riskColor[risk]}18`, border: `1px solid ${riskColor[risk]}44`, padding: '2px 8px', borderRadius: 2, letterSpacing: '0.08em' }}>
                        {risk.toUpperCase()}
                      </span>
                    ) : (
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#1F6F64' }}>QUERY →</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
              <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.2, color: '#12262B' }}>◈</div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B', marginBottom: 8 }}>Place not found in database</div>
              <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, color: MUTED, marginBottom: 20 }}>
                "{query}" is not in the LSGD database. You can submit it for review.
              </p>
              <button onClick={() => navigate('submit')} style={{ padding: '10px 24px', background: 'rgba(217,154,43,0.1)', border: '1px solid rgba(217,154,43,0.5)', borderRadius: 3, cursor: 'pointer', color: '#D99A2B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13 }}>
                Submit "{query}" for addition
              </button>
            </div>
          )}
        </div>
      )}

      {/* Active alerts preview */}
      {!searched && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 64px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, letterSpacing: '0.1em' }}>ACTIVE BULLETINS</span>
            <button onClick={() => navigate('alerts')} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#1F6F64', background: 'none', border: 'none', cursor: 'pointer' }}>VIEW ALL →</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {alerts.slice(0, 4).map(alert => (
              <div key={alert.id} style={{
                display: 'grid', gridTemplateColumns: '80px 1fr auto', gap: 16,
                padding: '12px 16px',
                background: '#ffffff',
                border: '1px solid rgba(18,38,43,0.07)',
                borderLeft: `3px solid ${riskColor[alert.riskLevel]}`,
                borderRadius: 2, alignItems: 'start',
              }}>
                <div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: riskColor[alert.riskLevel], fontWeight: 600, letterSpacing: '0.08em' }}>{alert.riskLevel.toUpperCase()}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.04em', marginTop: 2, textTransform: 'uppercase' }}>{alert.type}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: '#12262B', marginBottom: 4 }}>{alert.placeName} · {alert.district}</div>
                  <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{alert.message.slice(0, 120)}…</div>
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, whiteSpace: 'nowrap' }}>
                  {new Date(alert.issuedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
