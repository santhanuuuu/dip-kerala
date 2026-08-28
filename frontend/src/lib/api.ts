// Real backend API client. Shaped to match src/data/mockData.ts's types exactly, so pages
// that were built against mock data need minimal changes -- swap the import, keep the JSX.
import type { Place, RiskLevel, Alert, DamageRecord } from '../data/mockData';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('dip_jwt');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function titleCase(s: string): RiskLevel {
  const t = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return (['Critical', 'High', 'Moderate', 'Low'].includes(t) ? t : 'Moderate') as RiskLevel;
}

// --- Places: fetched ONCE and cached in memory (matches the backend's own comment that this
// payload is meant to be fetched once and filtered client-side, not re-queried per keystroke) ---
let placesCache: Place[] | null = null;

export async function fetchAllPlaces(): Promise<Place[]> {
  if (placesCache) return placesCache;
  const res = await fetch(`${API_BASE}/api/places`);
  if (!res.ok) throw new Error('Could not load places from the backend. Is it running?');
  const data = await res.json();
  placesCache = data.results.map((p: any) => ({
    id: p.id,
    name: p.name,
    nameMalayalam: p.nameMalayalam || '',
    district: p.district,
    type: p.type,
    lat: p.lat,
    lon: p.lon,
    elevation: p.elevation,
    slope: p.slope,
    distToWaterM: p.distToWaterM,
    vegetationPct: p.vegetationPct,
    builtupPct: p.builtupPct,
  }));
  return placesCache!;
}

// --- Real risk query -- REAL accuracy numbers, not the fabricated 0.874/0.912 from mock data.
// Landslide's real honest accuracy is genuinely poor (~18%); this is displayed as-is, not hidden.
export interface RealRiskResult {
  place: Place;
  floodProbability: number;
  floodRiskLevel: RiskLevel;
  landslideRiskLevel: RiskLevel;
  landslideConfidence: number;
  rainfall7dayMm: number;
  windspeedKmh: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  queriedAt: string;
  floodAccuracy: number | null;
  landslideAccuracy: number | null;
  note: string;
}

export async function fetchAreaRisk(placeName: string): Promise<RealRiskResult> {
  const res = await fetch(`${API_BASE}/api/risk/${encodeURIComponent(placeName)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `'${placeName}' not found.`);
  }
  const d = await res.json();
  const places = await fetchAllPlaces();
  const place = places.find((p) => p.name.toLowerCase() === d.place.name.toLowerCase()) || {
    id: -1, name: d.place.name, nameMalayalam: '', district: d.place.district, type: d.place.type,
    lat: d.place.lat, lon: d.place.lon, elevation: 0, slope: 0, distToWaterM: 0, vegetationPct: 0, builtupPct: 0,
  };
  return {
    place,
    floodProbability: d.flood.probability,
    floodRiskLevel: titleCase(d.flood.risk_level),
    landslideRiskLevel: titleCase(d.landslide.risk_level),
    landslideConfidence: d.landslide.confidence,
    rainfall7dayMm: d.weather.rainfall_7day_mm,
    windspeedKmh: d.weather.wind_kmh,
    temperatureC: d.weather.temperature_c,
    humidityPct: d.weather.humidity_pct,
    queriedAt: new Date().toISOString(),
    floodAccuracy: d.flood.model_honest_accuracy,
    landslideAccuracy: d.landslide.model_honest_accuracy,
    note: d.note,
  };
}

// --- Real alerts (from the live scan endpoint, not a hardcoded list) ---
const ALERTS_CACHE_MS = 60_000;
let alertsCache: { key: string; ts: number; promise: Promise<Alert[]> } | null = null;

export async function fetchRealAlerts(threshold = 0.7): Promise<Alert[]> {
  const key = String(threshold);
  const now = Date.now();
  if (alertsCache && alertsCache.key === key && now - alertsCache.ts < ALERTS_CACHE_MS) {
    return alertsCache.promise;
  }

  const promise = (async () => {
    const res = await fetch(`${API_BASE}/api/risk/scan/alerts?threshold=${threshold}`);
    if (!res.ok) throw new Error('Could not load alerts.');
    const d = await res.json();
    const places = await fetchAllPlaces();
    return d.alerts.map((a: any, i: number) => {
      const place = places.find((p) => p.name === a.place);
      return {
        id: i + 1,
        placeId: place?.id ?? -1,
        placeName: a.place,
        district: a.district,
        riskLevel: titleCase(a.risk_level),
        message: `Flood probability ${Math.round(a.probability * 100)}% -- above the ${Math.round(threshold * 100)}% alert threshold. Verify against local conditions before acting.`,
        issuedAt: new Date().toISOString(),
        type: 'flood' as const,
        affectedPopulation: undefined,
      };
    });
  })();

  alertsCache = { key, ts: now, promise };
  return promise;
}

// --- Submit a missing place ---
export async function submitPlace(data: { name: string; place_type?: string; district?: string }) {
  const res = await fetch(`${API_BASE}/api/places/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Submission failed. Are you logged in?');
  }
  return res.json();
}

// --- Auth ---
export function loginWithGoogle() {
  window.location.href = `${API_BASE}/api/auth/google/login`;
}
export function logout() {
  localStorage.removeItem('dip_jwt');
  window.location.reload();
}
export function isLoggedIn(): boolean {
  return !!localStorage.getItem('dip_jwt');
}

// --- News ---
export async function fetchNews() {
  const res = await fetch(`${API_BASE}/api/news`);
  if (!res.ok) return { results: [], last_refreshed: null };
  return res.json();
}

// --- Helplines & shelters ---
export async function fetchHelplines(district?: string) {
  const url = district ? `${API_BASE}/api/helplines?district=${encodeURIComponent(district)}` : `${API_BASE}/api/helplines`;
  const res = await fetch(url);
  if (!res.ok) return { results: [] };
  return res.json();
}
export async function fetchShelters(district?: string) {
  const url = district ? `${API_BASE}/api/shelters?district=${encodeURIComponent(district)}` : `${API_BASE}/api/shelters`;
  const res = await fetch(url);
  if (!res.ok) return { results: [], note: '' };
  return res.json();
}

// --- Damage assessment ---
export async function submitDamageAssessment(placeId: number, preImage: File, postImage: File) {
  const formData = new FormData();
  formData.append('place_id', String(placeId));
  formData.append('pre_image', preImage);
  formData.append('post_image', postImage);
  const res = await fetch(`${API_BASE}/api/damage-assessment`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Damage assessment failed.');
  }
  return res.json();
}

export async function fetchDamageHistory(placeId: number): Promise<DamageRecord[]> {
  const res = await fetch(`${API_BASE}/api/damage-assessment/${placeId}/history`);
  if (!res.ok) return [];
  const d = await res.json();
  const places = await fetchAllPlaces();
  const place = places.find((p) => p.id === placeId);
  return (d.results || []).map((r: any) => ({
    id: r.id,
    placeName: place?.name || 'Unknown',
    district: place?.district || '',
    damageClass: r.damage_class,
    confidence: r.confidence,
    eventDate: r.event_date || (r.created_at ? r.created_at.slice(0, 10) : 'unknown date'),
  }));
}

// --- Analytics: both of these are REAL computed/aggregated data, not sample numbers.
// District ranking is computed live from the trained models; daily history reads the
// actual risk_queries table and will be sparse on a fresh deployment -- that's honest,
// not a bug.
export interface DistrictRanking {
  district: string;
  floodRisk: number;
  landslideRisk: number;
  combined: number;
  sampledPlaces: number;
}

const RANKING_CACHE_MS = 60_000;
let rankingCache: { ts: number; promise: Promise<{ results: DistrictRanking[]; note: string }> } | null = null;

export async function fetchDistrictRanking(): Promise<{ results: DistrictRanking[]; note: string }> {
  const now = Date.now();
  if (rankingCache && now - rankingCache.ts < RANKING_CACHE_MS) {
    return rankingCache.promise;
  }

  const promise = (async () => {
    const res = await fetch(`${API_BASE}/api/risk/districts/ranking`);
    if (!res.ok) return { results: [], note: 'Could not load district ranking.' };
    return res.json();
  })();

  rankingCache = { ts: now, promise };
  return promise;
}

export interface DailyHistory {
  date: string;
  totalQueries: number;
  highRiskCount: number;
  criticalCount: number;
}

export async function fetchDailyHistory(): Promise<{ results: DailyHistory[]; totalAllTime: number; note: string }> {
  const res = await fetch(`${API_BASE}/api/risk/history/daily`);
  if (!res.ok) return { results: [], totalAllTime: 0, note: 'Could not load history.' };
  return res.json();
}
