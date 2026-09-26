import { useState, useEffect } from 'react';
import { fetchAllShelters, distanceKm, directionsUrl, type ShelterInfo } from '../lib/api';

const MUTED = '#4a5e62';

export default function SheltersPage() {
  const [shelters, setShelters] = useState<ShelterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  useEffect(() => {
    fetchAllShelters()
      .then((d) => {
        setShelters(d.results || []);
        setNote(d.note || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const findNearMe = () => {
    if (!navigator.geolocation) {
      setLocError('Your browser does not support location access.');
      return;
    }
    setLocLoading(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocLoading(false);
      },
      () => {
        setLocError('Could not get your location -- check your browser/device location permission.');
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const sorted = userLoc
    ? [...shelters].sort(
        (a, b) =>
          distanceKm(userLoc.lat, userLoc.lon, a.lat, a.lon) - distanceKm(userLoc.lat, userLoc.lon, b.lat, b.lon)
      )
    : shelters;

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
          RELIEF CAMPS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: 0, letterSpacing: '-0.02em' }}>
            Shelters
          </h1>
          <button
            onClick={findNearMe}
            disabled={locLoading}
            style={{
              padding: '10px 20px', background: '#1F6F64', border: 'none', borderRadius: 3,
              color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13,
              cursor: locLoading ? 'wait' : 'pointer', letterSpacing: '0.02em',
            }}
          >
            {locLoading ? 'Locating…' : userLoc ? '📍 Sorted by distance' : '📍 Find nearest to me'}
          </button>
        </div>

        {locError && (
          <div style={{ padding: '10px 16px', marginBottom: 16, background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>
            {locError}
          </div>
        )}

        {note && (
          <div style={{ padding: '10px 16px', marginBottom: 20, background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: '#8a6216' }}>
            {note}
          </div>
        )}

        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading shelters…</span>
          </div>
        )}

        {!loading && sorted.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>No active shelters listed right now.</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((s, i) => {
            const dist = userLoc ? distanceKm(userLoc.lat, userLoc.lon, s.lat, s.lon) : null;
            const full = s.capacity != null && s.current_occupancy != null && s.current_occupancy >= s.capacity;
            return (
              <div key={i} style={{ padding: '16px 20px', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderLeft: `3px solid ${i === 0 && userLoc ? '#1F6F64' : 'transparent'}`, borderRadius: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap' as const, gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B' }}>
                      {s.name} {i === 0 && userLoc && <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#1F6F64', marginLeft: 6 }}>NEAREST</span>}
                    </div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginTop: 4 }}>
                      {s.district}{dist !== null ? ` · ${dist.toFixed(1)} km away` : ''}
                    </div>
                    <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: full ? '#B54A2A' : MUTED, marginTop: 6 }}>
                      {s.capacity != null
                        ? `Capacity: ${s.current_occupancy ?? '?'} / ${s.capacity}${full ? ' -- FULL' : ''}`
                        : 'Capacity not reported'}
                    </div>
                  </div>
                  <a
                    href={directionsUrl(s.lat, s.lon)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: '8px 16px', background: 'rgba(31,111,100,0.1)', border: '1px solid rgba(31,111,100,0.4)', borderRadius: 2, color: '#1F6F64', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.04em', whiteSpace: 'nowrap' as const }}
                  >
                    DIRECTIONS →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}