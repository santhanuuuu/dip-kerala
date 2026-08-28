import { useState, useEffect } from 'react';
import { riskColor, type RiskLevel } from '../data/mockData';
import { fetchAllPlaces, fetchAreaRisk, type RealRiskResult } from '../lib/api';
import { type Page } from '../App';

interface RiskManifestPageProps {
  placeId: number;
  navigate: (page: Page, placeId?: number) => void;
}

const MUTED = '#4a5e62';
const CARD = { background: '#ffffff', border: '1px solid rgba(18,38,43,0.09)', borderRadius: 2 } as const;

function RiskGauge({ value, level }: { value: number; level: RiskLevel }) {
  const pct = Math.round(value * 100);
  const color = riskColor[level];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, letterSpacing: '0.06em' }}>FLOOD PROBABILITY</span>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 18, fontWeight: 600, color }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'rgba(18,38,43,0.07)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 1s ease-out' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: 'rgba(18,38,43,0.25)', letterSpacing: '0.04em' }}>
        <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
      </div>
    </div>
  );
}

function WeatherCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ padding: '12px 16px', background: 'rgba(18,38,43,0.03)', border: '1px solid rgba(18,38,43,0.07)', borderRadius: 2 }}>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 20, fontWeight: 600, color: '#12262B' }}>{value}</span>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED }}>{unit}</span>
      </div>
    </div>
  );
}

function TerrainRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 0', borderBottom: '1px solid rgba(18,38,43,0.05)' }}>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#12262B', textAlign: 'right', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function AccuracyCell({ accuracy }: { accuracy: number | null }) {
  const low = accuracy !== null && accuracy < 0.4;
  return (
    <div style={{ marginTop: 14, padding: '8px 12px', background: low ? 'rgba(181,74,42,0.06)' : 'rgba(18,38,43,0.03)', borderRadius: 2 }}>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.08em', marginBottom: 4 }}>HONEST ACCURACY (district-grouped validation)</div>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: low ? '#B54A2A' : '#12262B', fontWeight: 500 }}>
        {accuracy === null ? 'N/A' : `${(accuracy * 100).toFixed(1)}%`}
      </div>
      {low && (
        <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11, color: '#B54A2A', marginTop: 4, lineHeight: 1.4 }}>
          Below reliable levels for individual places -- treat as a rough district-level signal only, not a per-place guarantee.
        </div>
      )}
    </div>
  );
}

export default function RiskManifestPage({ placeId, navigate }: RiskManifestPageProps) {
  const [result, setResult] = useState<RealRiskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAllPlaces()
      .then((places) => {
        const place = places.find((p) => p.id === placeId);
        if (!place) throw new Error('Place not found in the loaded place list.');
        return fetchAreaRisk(place.name);
      })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [placeId]);

  if (loading) {
    return (
      <div style={{ minHeight: '40vh', background: '#F2F4EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'IBM Plex Mono, monospace', color: MUTED }}>Fetching live risk data...</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div style={{ minHeight: '60vh', background: '#F2F4EF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, color: '#12262B', marginBottom: 8 }}>
            {error || 'Place not found'}
          </div>
          <button onClick={() => navigate('home')} style={{ color: '#1F6F64', fontFamily: 'IBM Plex Mono, monospace', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>← Return to search</button>
        </div>
      </div>
    );
  }

  const { place } = result;
  const floodColor = riskColor[result.floodRiskLevel];
  const landslideColor = riskColor[result.landslideRiskLevel];
  const overallLevel = (['Critical', 'High', 'Moderate', 'Low'] as RiskLevel[])
    .find((l) => result.floodRiskLevel === l || result.landslideRiskLevel === l) || 'Low';

  const typeLabel: Record<string, string> = {
    gram_panchayat: 'Gram Panchayat',
    municipality: 'Municipality',
    municipal_corporation: 'Municipal Corporation',
    city: 'City / Town',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 64px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED }}>
          <button onClick={() => navigate('home')} style={{ color: '#1F6F64', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>← SEARCH</button>
          <span>/</span><span>{place.district.toUpperCase()}</span><span>/</span>
          <span style={{ color: '#12262B' }}>{place.name.toUpperCase()}</span>
        </div>

        <div style={{
          background: '#ffffff', border: `1px solid rgba(18,38,43,0.09)`,
          borderTop: `3px solid ${riskColor[overallLevel]}`,
          borderRadius: 3, padding: '28px 32px', marginBottom: 16,
          position: 'relative', overflow: 'hidden', boxShadow: '0 2px 12px rgba(18,38,43,0.06)',
        }}>
          <div style={{
            position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%) rotate(-8deg)',
            fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '6rem',
            letterSpacing: '0.12em', color: riskColor[overallLevel],
            opacity: 0.04, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            {overallLevel.toUpperCase()}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 1 }}>
                  RISK MANIFEST
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.08em' }}>
                  DIP-KL · {typeLabel[place.type]?.toUpperCase() || place.type.toUpperCase()}
                </div>
              </div>
              <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', color: '#12262B', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                {place.name}
              </h1>
              <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, color: MUTED, marginBottom: 14 }}>
                {place.nameMalayalam ? `${place.nameMalayalam} · ` : ''}{place.district} District
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, letterSpacing: '0.04em' }}>
                {place.lat.toFixed(5)}°N · {place.lon.toFixed(5)}°E · {place.elevation.toFixed(0)}m ASL
              </div>
            </div>

            <div style={{ textAlign: 'right', borderLeft: '1px solid rgba(18,38,43,0.08)', paddingLeft: 28 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginBottom: 4 }}>ISSUED</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#12262B' }}>
                {new Date(result.queriedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, color: '#12262B', marginBottom: 14 }}>
                {new Date(result.queriedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })} IST
              </div>
              <div style={{ display: 'inline-block', padding: '4px 12px', border: `2px solid ${riskColor[overallLevel]}`, color: riskColor[overallLevel], fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.12em', borderRadius: 2 }}>
                {overallLevel.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Honest calibration note, from the backend, not a fabricated alert */}
        <div style={{ padding: '12px 16px', background: 'rgba(18,38,43,0.03)', border: '1px solid rgba(18,38,43,0.1)', borderRadius: 2, marginBottom: 16 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.08em', marginBottom: 4 }}>MODEL NOTE</div>
          <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: '#12262B', lineHeight: 1.5 }}>{result.note}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ ...CARD, borderTop: `2px solid ${floodColor}`, padding: '20px 24px', boxShadow: '0 1px 6px rgba(18,38,43,0.05)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 14 }}>FLOOD RISK ASSESSMENT</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
              <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 40, color: floodColor, lineHeight: 1 }}>{result.floodRiskLevel}</span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>risk level</span>
            </div>
            <RiskGauge value={result.floodProbability} level={result.floodRiskLevel} />
            <AccuracyCell accuracy={result.floodAccuracy} />
          </div>

          <div style={{ ...CARD, borderTop: `2px solid ${landslideColor}`, padding: '20px 24px', boxShadow: '0 1px 6px rgba(18,38,43,0.05)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 14 }}>LANDSLIDE RISK ASSESSMENT</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
              <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 40, color: landslideColor, lineHeight: 1 }}>{result.landslideRiskLevel}</span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>risk level</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, letterSpacing: '0.06em' }}>CONFIDENCE</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 18, fontWeight: 600, color: landslideColor }}>{Math.round(result.landslideConfidence * 100)}%</span>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 6, background: i < Math.round(result.landslideConfidence * 10) ? landslideColor : 'rgba(18,38,43,0.08)', borderRadius: 1 }} />
                ))}
              </div>
            </div>
            <AccuracyCell accuracy={result.landslideAccuracy} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ ...CARD, padding: '20px 24px', boxShadow: '0 1px 6px rgba(18,38,43,0.05)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              LIVE WEATHER — OPEN-METEO
              <span style={{ color: '#7C9A3C', fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7C9A3C', display: 'inline-block' }} />LIVE
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <WeatherCell label="7-Day Rainfall" value={result.rainfall7dayMm.toFixed(1)} unit="mm" />
              <WeatherCell label="Temperature" value={result.temperatureC !== null ? result.temperatureC.toFixed(1) : '--'} unit="°C" />
              <WeatherCell label="Wind Speed" value={result.windspeedKmh !== null ? result.windspeedKmh.toFixed(1) : '--'} unit="km/h" />
            </div>
          </div>

          <div style={{ ...CARD, padding: '20px 24px', boxShadow: '0 1px 6px rgba(18,38,43,0.05)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 12 }}>TERRAIN FEATURES — LSGD STORE</div>
            <TerrainRow label="Elevation" value={`${place.elevation.toFixed(0)} m ASL`} />
            <TerrainRow label="Avg. Slope" value={`${place.slope.toFixed(1)}°`} />
            <TerrainRow label="Dist. to Water" value={`${place.distToWaterM.toFixed(0)} m`} />
            <TerrainRow label="Vegetation Cover" value={`${place.vegetationPct.toFixed(1)}%`} />
            <TerrainRow label="Built-up Area" value={`${place.builtupPct.toFixed(1)}%`} />
          </div>
        </div>

        <div style={{ padding: '20px 24px', background: 'rgba(31,111,100,0.06)', border: '1px solid rgba(31,111,100,0.2)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#1F6F64', letterSpacing: '0.1em', marginBottom: 4 }}>DAMAGE ASSESSMENT</div>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED }}>
              Upload pre/post images to run the damage classifier for {place.name}.
            </div>
          </div>
          <button onClick={() => navigate('damage')} style={{ padding: '10px 20px', background: '#1F6F64', border: 'none', borderRadius: 2, cursor: 'pointer', color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            Upload Images →
          </button>
        </div>
      </div>
    </div>
  );
}
