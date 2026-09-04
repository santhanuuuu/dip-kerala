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
  const [placesReady, setPlacesReady] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  useEffect(() => {
    fetchAllPlaces()
      .then((places) => {
        setAllPlaces(places);
        setDistrictNames([...new Set(places.map((p) => p.district))].sort());
        setPlacesReady(true);
      })
      .catch((e) => setLoadError(e.message));
    fetchRealAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, []);

  const handleSearch = () => {
    if (!placesReady) return; // Guards against searching before the place list has loaded --
    // the backend can take 30-60s to wake up on a cold start (free tier), and without this
    // guard a search fired during that window silently filters an empty array and shows
    // "not found" even for places that genuinely exist.
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
    setShowSuggestions(false);
  };

  // Live suggestions -- recomputed on every keystroke while placesReady, ranked so
  // names that START WITH the query float above names that merely CONTAIN it
  // (e.g. typing "pira" should put "Piravom" above "Kizhakkambalam Pirathala").
  const suggestions = (() => {
    const q = query.trim().toLowerCase();
    if (!placesReady || q.length === 0) return [];
    const starts: Place[] = [];
    const contains: Place[] = [];
    for (const p of allPlaces) {
      const name = p.name.toLowerCase();
      if (name.startsWith(q)) starts.push(p);
      else if (name.includes(q)) contains.push(p);
      if (starts.length + contains.length >= 40) break; // cap the scan, we only show 8 anyway
    }
    return [...starts, ...contains].slice(0, 8);
  })();

  const selectSuggestion = (place: Place) => {
    setQuery(place.name);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    navigate('manifest', place.id);
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
        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto 48px' }}>
        <div style={{
          background: '#ffffff',
          border: '1px solid rgba(18, 38, 43, 0.15)',
          borderRadius: 4, padding: 4,
          display: 'flex', gap: 4,
          boxShadow: '0 2px 8px rgba(18,38,43,0.06)',
        }}>
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setShowSuggestions(true);
              setHighlightIndex(-1);
            }}
            onFocus={() => query.trim() && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={e => {
              if (showSuggestions && suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightIndex(i => Math.max(i - 1, 0));
                  return;
                }
                if (e.key === 'Enter' && highlightIndex >= 0) {
                  e.preventDefault();
                  selectSuggestion(suggestions[highlightIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  setShowSuggestions(false);
                  return;
                }
              }
              if (e.key === 'Enter') handleSearch();
            }}
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
            disabled={loading || !placesReady}
            style={{
              padding: '12px 24px',
              background: (loading || !placesReady) ? '#2a8f82' : '#1F6F64',
              border: 'none', borderRadius: 3,
              cursor: (loading || !placesReady) ? 'wait' : 'pointer',
              color: '#F2F4EF',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13,
              letterSpacing: '0.04em', transition: 'background 0.15s',
            }}
          >
            {loading ? '…' : !placesReady ? 'Loading…' : 'Query Risk'}
          </button>
        </div>

        {/* Live suggestions dropdown -- narrows as you type, like a search-engine autocomplete */}
        {showSuggestions && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#ffffff',
            border: '1px solid rgba(18, 38, 43, 0.15)',
            borderRadius: 4,
            boxShadow: '0 8px 24px rgba(18,38,43,0.12)',
            zIndex: 20, overflow: 'hidden',
          }}>
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                onMouseDown={e => e.preventDefault()} // keep input focus so onBlur doesn't fire first
                onClick={() => selectSuggestion(p)}
                onMouseEnter={() => setHighlightIndex(i)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', textAlign: 'left', border: 'none', cursor: 'pointer',
                  background: i === highlightIndex ? '#f5f7f3' : '#ffffff',
                  borderBottom: i < suggestions.length - 1 ? '1px solid rgba(18,38,43,0.06)' : 'none',
                }}
              >
                <span>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, color: '#12262B' }}>{p.name}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginLeft: 8 }}>{typeLabel[p.type]}</span>
                </span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED }}>{p.district}</span>
              </button>
            ))}
          </div>
        )}
        </div>

        {!placesReady && !loadError && (
          <div style={{ maxWidth: 900, margin: '12px auto 0', padding: '10px 16px', background: 'rgba(31,111,100,0.08)', border: '1px solid rgba(31,111,100,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#1F6F64', textAlign: 'center' }}>
            Loading place database — the backend can take up to a minute to wake up if it's been idle. Search will be enabled once it's ready.
          </div>
        )}

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
