import { useEffect, useRef, useState } from 'react';
import { riskColor, type Place, type Alert } from '../data/mockData';
import { fetchAllPlaces, fetchRealAlerts, fetchDistrictRanking, fetchDams, type DamInfo, type DistrictRanking } from '../lib/api';
import { type Page } from '../App';
import useIsMobile from '../hooks/useIsMobile';

interface DashboardPageProps {
  navigate: (page: Page, placeId?: number) => void;
}

const MUTED = '#4a5e62';

// Heatmap gradient -- same 4-stop grading for both flood and landslide layers: dark green
// (low risk) -> light green (moderate) -> orange (high) -> red (critical). Stops are intensity
// (0-1), which the risk score (0-100 from the district ranking endpoint) is normalized into.
const HEAT_GRADIENT = { 0.0: '#0F5132', 0.4: '#7C9A3C', 0.7: '#D99A2B', 1.0: '#8B1A1A' };

const DAM_RISK_COLOR: Record<DamInfo['risk_category'], string> = {
  high: '#B54A2A',
  normal: '#1F6F64',
  no_live_data: '#8a9a9c',
};

const LAYERS = [
  { id: 'flood', label: 'Flood Risk Heatmap', color: '#D99A2B' },
  { id: 'landslide', label: 'Landslide Risk Heatmap', color: '#7C9A3C' },
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
  const floodHeatRef = useRef<any>(null);
  const landslideHeatRef = useRef<any>(null);
  const [activeLayers, setActiveLayers] = useState(['flood', 'alerts', 'dams']);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [keralaPlaces, setKeralaPlaces] = useState<Place[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [districtRanking, setDistrictRanking] = useState<DistrictRanking[]>([]);
  const [dams, setDams] = useState<DamInfo[]>([]);

  useEffect(() => {
    fetchAllPlaces().then(setKeralaPlaces).catch(() => setKeralaPlaces([]));
    fetchRealAlerts().then(setActiveAlerts).catch(() => setActiveAlerts([]));
    // District ranking gives REAL, model-computed flood/landslide risk scores (0-100) per
    // district -- not sample data (see risk.py's district_risk_ranking()). That's the only
    // risk signal that exists for every place at once; querying the full per-place model for
    // all ~1,034 places on every dashboard load would be far too heavy, so the heatmap below
    // paints each place with its own district's score rather than a per-place prediction.
    fetchDistrictRanking().then(d => setDistrictRanking(d.results)).catch(() => setDistrictRanking([]));
    fetchDams().then(d => setDams(d.results)).catch(() => setDams([]));
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if ((mapRef.current as any)._leaflet_id) return;

    // leaflet.heat is an old-style plugin -- it patches a GLOBAL `L` (`window.L`) rather than
    // exporting anything itself, since it predates ES modules. Leaflet's own dynamic import
    // does NOT put it on `window` automatically, so without this line leaflet.heat throws
    // immediately on load (it can't find `window.L`), the whole Promise.all rejects, and
    // setMapLoaded(true) never runs -- the map silently gets stuck on "LOADING MAP..." forever
    // with no visible error. Setting window.L first, then importing leaflet.heat SECOND (not
    // in parallel) guarantees it's there when leaflet.heat's own top-level code runs.
    import('leaflet')
      .then((leaflet) => {
        const L = leaflet.default;
        (window as any).L = L;
        return import('leaflet.heat').then(() => L);
      })
      .then((L) => {
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

  // Flood & landslide heatmaps -- one weighted point per real place, intensity = that place's
  // district risk score (0-1). Redrawn whenever places/ranking/layer toggles change.
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;
    const { map, L } = mapInstanceRef.current;
    const heatLayer = (L as any).heatLayer;
    if (!heatLayer || keralaPlaces.length === 0) return;

    const scoreByDistrict = new Map(districtRanking.map(d => [d.district, d]));

    if (floodHeatRef.current) { map.removeLayer(floodHeatRef.current); floodHeatRef.current = null; }
    if (activeLayers.includes('flood')) {
      const points = keralaPlaces.map(p => {
        const score = scoreByDistrict.get(p.district)?.floodRisk ?? 0;
        return [p.lat, p.lon, score / 100];
      });
      floodHeatRef.current = heatLayer(points, { radius: 28, blur: 22, maxZoom: 10, max: 1.0, gradient: HEAT_GRADIENT }).addTo(map);
    }

    if (landslideHeatRef.current) { map.removeLayer(landslideHeatRef.current); landslideHeatRef.current = null; }
    if (activeLayers.includes('landslide')) {
      const points = keralaPlaces.map(p => {
        const score = scoreByDistrict.get(p.district)?.landslideRisk ?? 0;
        return [p.lat, p.lon, score / 100];
      });
      landslideHeatRef.current = heatLayer(points, { radius: 28, blur: 22, maxZoom: 10, max: 1.0, gradient: HEAT_GRADIENT }).addTo(map);
    }
  }, [mapLoaded, activeLayers, keralaPlaces, districtRanking]);

  // Active-alert pins -- unchanged from before, just no longer doubles as the general flood-risk layer.
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

          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(18,38,43,0.08)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 10 }}>HEATMAP GRADE</div>
            <div style={{ height: 8, borderRadius: 2, marginBottom: 6, background: 'linear-gradient(90deg, #0F5132, #7C9A3C, #D99A2B, #8B1A1A)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {['Low', 'Moderate', 'High', 'Critical'].map(lvl => (
                <span key={lvl} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.02em' }}>{lvl}</span>
              ))}
            </div>
          </div>

          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(18,38,43,0.08)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 10 }}>ALERT PIN LEGEND</div>
            {([['Critical', '#B54A2A'], ['High', '#D99A2B'], ['Moderate', '#7C9A3C'], ['Low', '#1F6F64']] as const).map(([lvl, col]) => (
              <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
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
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#1F6F64', marginTop: 2 }}>Kerala Risk Heatmap · Dam Status · Live Alerts</div>
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