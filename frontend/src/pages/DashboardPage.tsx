import { useEffect, useRef, useState } from 'react';
import { riskColor, type Place, type Alert } from '../data/mockData';
import { fetchAllPlaces, fetchRealAlerts, fetchDistrictRanking, fetchDams, type DamInfo, type DistrictRanking } from '../lib/api';
import { type Page } from '../App';
import useIsMobile from '../hooks/useIsMobile';

interface DashboardPageProps {
  navigate: (page: Page, placeId?: number) => void;
}

const MUTED = '#4a5e62';

// Real Kerala district boundaries (14 districts), served from the maintainer's own CDN per
// their README ("direct CDN links ... enabling you to integrate the maps seamlessly into your
// applications"). Pinned to a specific commit so this never silently changes shape underneath
// us. Source: https://github.com/udit-001/india-maps-data
const KERALA_DISTRICTS_GEOJSON_URL =
  'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/states/kerala.geojson';

// Same 4-band risk coloring already used on the Analytics page's district ranking (AnalyticsPage.tsx)
// -- Critical >=80, High >=60, Moderate >=40, else Low -- so a district colored red here means
// exactly the same thing as "CRITICAL" there, and the same colors used for alert pins and dam
// status. One color code for the whole app, not a different one per page.
function riskBand(score: number): { level: 'Critical' | 'High' | 'Moderate' | 'Low'; color: string } {
  if (score >= 80) return { level: 'Critical', color: '#B54A2A' };
  if (score >= 60) return { level: 'High', color: '#D99A2B' };
  if (score >= 40) return { level: 'Moderate', color: '#7C9A3C' };
  return { level: 'Low', color: '#1F6F64' };
}

const DAM_RISK_COLOR: Record<DamInfo['risk_category'], string> = {
  high: '#B54A2A',
  normal: '#1F6F64',
  no_live_data: '#8a9a9c',
};

const LAYERS = [
  { id: 'flood', label: 'Flood Risk by District', color: '#D99A2B' },
  { id: 'landslide', label: 'Landslide Risk by District', color: '#7C9A3C' },
  { id: 'alerts', label: 'Active Alerts', color: '#1F6F64' },
  { id: 'dams', label: 'Dam Status', color: '#B54A2A' },
];

export default function DashboardPage({ navigate }: DashboardPageProps) {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const damMarkersRef = useRef<any[]>([]);
  const floodLayerRef = useRef<any>(null);
  const landslideLayerRef = useRef<any>(null);
  const hasFitBoundsRef = useRef(false);
  const [activeLayers, setActiveLayers] = useState(['flood', 'alerts', 'dams']);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [keralaPlaces, setKeralaPlaces] = useState<Place[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [districtRanking, setDistrictRanking] = useState<DistrictRanking[]>([]);
  const [dams, setDams] = useState<DamInfo[]>([]);
  const [districtGeoJson, setDistrictGeoJson] = useState<any>(null);

  useEffect(() => {
    fetchAllPlaces().then(setKeralaPlaces).catch(() => setKeralaPlaces([]));
    fetchRealAlerts().then(setActiveAlerts).catch(() => setActiveAlerts([]));
    // District ranking gives REAL, model-computed flood/landslide risk scores (0-100) per
    // district -- not sample data (see risk.py's district_risk_ranking()). It's the only risk
    // signal that exists for every district at once; the district shading below colors each
    // district by this one real score rather than running the full per-place model ~1,034
    // times on every dashboard load.
    fetchDistrictRanking().then(d => setDistrictRanking(d.results)).catch(() => setDistrictRanking([]));
    fetchDams().then(d => setDams(d.results)).catch(() => setDams([]));
    fetch(KERALA_DISTRICTS_GEOJSON_URL)
      .then(r => r.json())
      .then(setDistrictGeoJson)
      .catch(() => setDistrictGeoJson(null));
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if ((mapRef.current as any)._leaflet_id) return;

    import('leaflet')
      .then((leaflet) => {
        const L = leaflet.default;
        if (!mapRef.current || (mapRef.current as any)._leaflet_id) return;

        const map = L.map(mapRef.current, { center: [10.5, 76.5], zoom: 7, zoomControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = { map, L };
        setMapLoaded(true);
      })
      .catch((err) => {
        // Surface it loudly instead of leaving the map stuck on "LOADING MAP..." with no clue why.
        console.error('DIP/KL dashboard: failed to initialize the map', err);
      });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.map.remove();
        mapInstanceRef.current = null;
      }
      if (mapRef.current) delete (mapRef.current as any)._leaflet_id;
    };
  }, []);

  // Flood & landslide risk -- shown as the actual district shapes colored by that district's
  // real risk score, not a glowing gradient cloud. A gradient blob doesn't respect district
  // borders (it bled into Tamil Nadu/Karnataka) and its color at any one spot is hard to read
  // at a glance; a colored district with a name on it ("Wayanad is red") is immediate for
  // someone who isn't a GIS person. Same color bands as everywhere else in the app.
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || !districtGeoJson) return;
    const { map, L } = mapInstanceRef.current;
    if (districtRanking.length === 0) return;

    const scoreByDistrict = new Map(districtRanking.map(d => [d.district, d]));

    const makeLayer = (metric: 'floodRisk' | 'landslideRisk', metricLabel: string) =>
      L.geoJSON(districtGeoJson, {
        style: (feature: any) => {
          const d = scoreByDistrict.get(feature.properties.district);
          const score = d ? d[metric] : 0;
          const { color } = riskBand(score);
          return { fillColor: color, fillOpacity: 0.45, color: '#ffffff', weight: 1.5, opacity: 0.9 };
        },
        onEachFeature: (feature: any, layer: any) => {
          const d = scoreByDistrict.get(feature.properties.district);
          const score = d ? d[metric] : 0;
          const { level, color } = riskBand(score);
          const content = `
            <div style="font-family:'IBM Plex Mono',monospace;background:#ffffff;color:#12262B;border:1px solid ${color};border-top:3px solid ${color};padding:10px;border-radius:3px;min-width:160px;box-shadow:0 4px 12px rgba(18,38,43,0.1)">
              <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:4px">${feature.properties.district}</div>
              <div style="font-size:10px;color:${color};letter-spacing:0.08em;margin-bottom:4px">${metricLabel}: ${level.toUpperCase()}</div>
              <div style="font-size:10px;color:#4a5e62">Score: ${Math.round(score)} / 100</div>
            </div>
          `;
          layer.bindTooltip(`${feature.properties.district} — ${level}`, { sticky: true, className: 'leaflet-tooltip-dip' });
          layer.bindPopup(content, { className: 'leaflet-popup-dip' });
          layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.65 }));
          layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.45 }));
        },
      });

    if (floodLayerRef.current) { map.removeLayer(floodLayerRef.current); floodLayerRef.current = null; }
    if (activeLayers.includes('flood')) {
      floodLayerRef.current = makeLayer('floodRisk', 'Flood risk').addTo(map);
      if (!hasFitBoundsRef.current) {
        map.fitBounds(floodLayerRef.current.getBounds(), { padding: [16, 16] });
        hasFitBoundsRef.current = true;
      }
    }

    if (landslideLayerRef.current) { map.removeLayer(landslideLayerRef.current); landslideLayerRef.current = null; }
    if (activeLayers.includes('landslide')) {
      landslideLayerRef.current = makeLayer('landslideRisk', 'Landslide risk').addTo(map);
      if (!hasFitBoundsRef.current) {
        map.fitBounds(landslideLayerRef.current.getBounds(), { padding: [16, 16] });
        hasFitBoundsRef.current = true;
      }
    }
  }, [mapLoaded, activeLayers, districtRanking, districtGeoJson]);

  // Active-alert pins -- unchanged: exact place markers, separate from the district shading above.
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;
    const { map, L } = mapInstanceRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (!activeLayers.includes('alerts')) return;

    activeAlerts.forEach(alert => {
      const place = keralaPlaces.find(p => p.id === alert.placeId);
      if (!place) return;
      const color = riskColor[alert.riskLevel];
      const size = alert.riskLevel === 'Critical' ? 14 : alert.riskLevel === 'High' ? 12 : 9;
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid rgba(255,255,255,0.8);border-radius:50%;box-shadow:0 0 ${alert.riskLevel === 'Critical' ? '8px' : '4px'} ${color}88;"></div>`,
        className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([place.lat, place.lon], { icon }).addTo(map).bindPopup(`
        <div style="font-family:'IBM Plex Mono',monospace;background:#ffffff;color:#12262B;border:1px solid ${color};border-top:3px solid ${color};padding:10px;border-radius:3px;min-width:180px;box-shadow:0 4px 12px rgba(18,38,43,0.1)">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:4px">${place.name}</div>
          <div style="font-size:10px;color:#4a5e62;margin-bottom:6px">${place.district} · ${place.lat.toFixed(4)}°N</div>
          <div style="font-size:10px;color:${color};letter-spacing:0.08em;margin-bottom:8px">${alert.riskLevel.toUpperCase()} RISK</div>
          <div style="font-size:10px;color:#4a5e62;line-height:1.4">${alert.message.slice(0, 80)}…</div>
        </div>
      `, { className: 'leaflet-popup-dip' });

      markersRef.current.push(marker);
    });
  }, [mapLoaded, activeLayers, keralaPlaces, activeAlerts]);

  // Dam markers -- red (high risk), green (normal), grey (no live telemetry), straight from
  // the backend's own risk_category so this never re-derives or guesses a dam's status.
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;
    const { map, L } = mapInstanceRef.current;

    damMarkersRef.current.forEach(m => m.remove());
    damMarkersRef.current = [];
    if (!activeLayers.includes('dams')) return;

    const damsWithCoords = dams.filter(
      (d): d is DamInfo & { latitude: number; longitude: number } => d.latitude !== null && d.longitude !== null,
    );

    damsWithCoords.forEach(dam => {
      const color = DAM_RISK_COLOR[dam.risk_category];
      const icon = L.divIcon({
        html: `<div style="width:11px;height:11px;background:${color};border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 4px ${color}99;transform:rotate(45deg);"></div>`,
        className: '', iconSize: [11, 11], iconAnchor: [5.5, 5.5],
      });

      const statusLabel = dam.risk_category === 'high' ? 'HIGH RISK' : dam.risk_category === 'normal' ? 'NORMAL' : 'NO LIVE DATA';
      const readingLine = dam.current_level_m !== null
        ? `${dam.storage_percentage !== null ? `${dam.storage_percentage.toFixed(1)}% full · ` : ''}${dam.current_level_m.toFixed(2)} m`
        : 'No reading on record';

      const marker = L.marker([dam.latitude, dam.longitude], { icon }).addTo(map).bindPopup(`
        <div style="font-family:'IBM Plex Mono',monospace;background:#ffffff;color:#12262B;border:1px solid ${color};border-top:3px solid ${color};padding:10px;border-radius:3px;min-width:180px;box-shadow:0 4px 12px rgba(18,38,43,0.1)">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:4px">${dam.name}</div>
          <div style="font-size:10px;color:#4a5e62;margin-bottom:6px">${dam.district}${dam.river ? ` · ${dam.river}` : ''}</div>
          <div style="font-size:10px;color:${color};letter-spacing:0.08em;margin-bottom:8px">${statusLabel}</div>
          <div style="font-size:10px;color:#4a5e62;line-height:1.4">${readingLine}</div>
        </div>
      `, { className: 'leaflet-popup-dip' });

      damMarkersRef.current.push(marker);
    });
  }, [mapLoaded, activeLayers, dams]);

  const toggleLayer = (id: string) =>
    setActiveLayers(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);

  return (
    <div style={{ height: '100vh', background: '#F2F4EF', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', overflow: 'hidden', position: 'relative' }}>

        {/* Sidebar -- an overlay panel on mobile, toggled by the floating button, so the
            map gets the full screen by default on small devices. */}
        <div style={{
          background: '#ffffff', borderRight: '1px solid rgba(18,38,43,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(isMobile ? {
            position: 'absolute' as const, top: 0, left: 0, bottom: 0, width: '82%', maxWidth: 320, zIndex: 900,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.2s ease-out', boxShadow: sidebarOpen ? '4px 0 16px rgba(18,38,43,0.15)' : 'none',
          } : {}),
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(18,38,43,0.08)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 12 }}>LAYER TOGGLES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {LAYERS.map(layer => (
                <button key={layer.id} onClick={() => toggleLayer(layer.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  background: activeLayers.includes(layer.id) ? `${layer.color}10` : 'rgba(18,38,43,0.02)',
                  border: activeLayers.includes(layer.id) ? `1px solid ${layer.color}40` : '1px solid rgba(18,38,43,0.08)',
                  borderRadius: 2, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: activeLayers.includes(layer.id) ? layer.color : 'rgba(18,38,43,0.2)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: activeLayers.includes(layer.id) ? '#12262B' : MUTED, letterSpacing: '0.04em' }}>{layer.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* One color legend for the whole page -- district shading, alert pins, and these
              four levels all mean the same thing everywhere, so there's only one code to learn. */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(18,38,43,0.08)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 10 }}>RISK LEVELS</div>
            {([['Critical', '#B54A2A'], ['High', '#D99A2B'], ['Moderate', '#7C9A3C'], ['Low', '#1F6F64']] as const).map(([lvl, col]) => (
              <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 2, background: col }} />
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.04em' }}>{lvl}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(18,38,43,0.08)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 10 }}>DAM STATUS</div>
            {([['High risk', DAM_RISK_COLOR.high], ['Normal', DAM_RISK_COLOR.normal], ['No live data', DAM_RISK_COLOR.no_live_data]] as const).map(([lbl, col]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, background: col, transform: 'rotate(45deg)' }} />
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.04em' }}>{lbl}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 10 }}>
              CRITICAL ZONES — {activeAlerts.filter(a => a.riskLevel === 'Critical').length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeAlerts.map(alert => (
                <button key={alert.id} onClick={() => navigate('manifest', alert.placeId)} style={{
                  padding: '10px 12px',
                  background: 'rgba(18,38,43,0.02)',
                  border: `1px solid rgba(18,38,43,0.07)`,
                  borderLeft: `2px solid ${riskColor[alert.riskLevel]}`,
                  borderRadius: 2, cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(18,38,43,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(18,38,43,0.02)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, color: '#12262B' }}>{alert.placeName}</span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: riskColor[alert.riskLevel], letterSpacing: '0.06em' }}>{alert.riskLevel.toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{alert.district} · {alert.type.toUpperCase()}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Map */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 500, background: 'rgba(242,244,239,0.95)', border: '1px solid rgba(18,38,43,0.12)', borderRadius: 3, padding: '8px 12px', boxShadow: '0 2px 8px rgba(18,38,43,0.08)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.08em' }}>DIP/KL · GIS DASHBOARD</div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#1F6F64', marginTop: 2 }}>District Risk Colors · Dam Status · Live Alerts</div>
          </div>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{
                position: 'absolute', bottom: 20, left: 12, zIndex: 500,
                padding: '10px 16px', background: '#1F6F64', border: 'none', borderRadius: 3,
                color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12,
                cursor: 'pointer', boxShadow: '0 2px 8px rgba(18,38,43,0.2)',
              }}
            >
              {sidebarOpen ? '✕ Close' : '☰ Layers & Alerts'}
            </button>
          )}
          {isMobile && sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(18,38,43,0.25)', zIndex: 800 }}
            />
          )}
          {!mapLoaded && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F2F4EF', zIndex: 400 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#1F6F64', letterSpacing: '0.08em' }}>LOADING MAP…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}