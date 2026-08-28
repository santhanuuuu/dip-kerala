import { useEffect, useRef, useState } from 'react';
import { riskColor, type RiskLevel, type Place, type Alert } from '../data/mockData';
import { fetchAllPlaces, fetchRealAlerts } from '../lib/api';
import { type Page } from '../App';

interface DashboardPageProps {
  navigate: (page: Page, placeId?: number) => void;
}

const MUTED = '#4a5e62';

const LAYERS = [
  { id: 'flood', label: 'Flood Risk', color: '#B54A2A' },
  { id: 'landslide', label: 'Landslide Risk', color: '#D99A2B' },
  { id: 'alerts', label: 'Active Alerts', color: '#1F6F64' },
];

export default function DashboardPage({ navigate }: DashboardPageProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [activeLayers, setActiveLayers] = useState(['flood', 'alerts']);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [keralaPlaces, setKeralaPlaces] = useState<Place[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    fetchAllPlaces().then(setKeralaPlaces).catch(() => setKeralaPlaces([]));
    fetchRealAlerts().then(setActiveAlerts).catch(() => setActiveAlerts([]));
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    if ((mapRef.current as any)._leaflet_id) return;

    import('leaflet').then((leaflet) => {
      const L = leaflet.default;
      if (!mapRef.current || (mapRef.current as any)._leaflet_id) return;

      const map = L.map(mapRef.current, { center: [10.5, 76.5], zoom: 7, zoomControl: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = { map, L };
      setMapLoaded(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.map.remove();
        mapInstanceRef.current = null;
      }
      if (mapRef.current) delete (mapRef.current as any)._leaflet_id;
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current) return;
    const { map, L } = mapInstanceRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    keralaPlaces.forEach(place => {
      const alert = activeAlerts.find(a => a.placeId === place.id);
      const riskLvl: RiskLevel = alert?.riskLevel || 'Low';
      const color = riskColor[riskLvl];
      if (!alert && !activeLayers.includes('flood')) return;

      const size = riskLvl === 'Critical' ? 14 : riskLvl === 'High' ? 12 : 9;
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid rgba(255,255,255,0.7);border-radius:50%;box-shadow:0 0 ${riskLvl === 'Critical' ? '8px' : '4px'} ${color}88;"></div>`,
        className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([place.lat, place.lon], { icon }).addTo(map).bindPopup(`
        <div style="font-family:'IBM Plex Mono',monospace;background:#ffffff;color:#12262B;border:1px solid ${color};border-top:3px solid ${color};padding:10px;border-radius:3px;min-width:180px;box-shadow:0 4px 12px rgba(18,38,43,0.1)">
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:14px;margin-bottom:4px">${place.name}</div>
          <div style="font-size:10px;color:#4a5e62;margin-bottom:6px">${place.district} · ${place.lat.toFixed(4)}°N</div>
          <div style="font-size:10px;color:${color};letter-spacing:0.08em;margin-bottom:${alert ? '8px' : '0'}">${riskLvl.toUpperCase()} RISK</div>
          ${alert ? `<div style="font-size:10px;color:#4a5e62;line-height:1.4">${alert.message.slice(0, 80)}…</div>` : ''}
        </div>
      `, { className: 'leaflet-popup-dip' });

      markersRef.current.push(marker);
    });
  }, [mapLoaded, activeLayers, keralaPlaces, activeAlerts]);

  const toggleLayer = (id: string) =>
    setActiveLayers(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);

  return (
    <div style={{ height: '100vh', background: '#F2F4EF', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ background: '#ffffff', borderRight: '1px solid rgba(18,38,43,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 10 }}>RISK LEGEND</div>
            {([['Critical', '#B54A2A'], ['High', '#D99A2B'], ['Moderate', '#7C9A3C'], ['Low', '#1F6F64']] as const).map(([lvl, col]) => (
              <div key={lvl} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col }} />
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.04em' }}>{lvl}</span>
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
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#1F6F64', marginTop: 2 }}>Kerala LSGD Boundaries · Live Risk Overlay</div>
          </div>
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
