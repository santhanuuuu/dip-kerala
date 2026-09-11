// Real backend API client. Shaped to match src/data/mockData.ts's types exactly, so pages
// that were built against mock data need minimal changes -- swap the import, keep the JSX.
import type { Place, RiskLevel, Alert, DamageRecord } from '../data/mockData';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('dip_jwt');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CurrentUser {
  email: string;
  name: string | null;
  picture: string | null;
}

/** Decodes the stored JWT client-side to get the signed-in user's name/picture --
 * no extra network round trip needed, since the backend already puts these in the
 * token payload at login. JWT payloads are base64, not encrypted -- fine to read,
 * just never trust them for anything security-sensitive on the frontend. */
export function getCurrentUser(): CurrentUser | null {
  const token = localStorage.getItem('dip_jwt');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { email: payload.email, name: payload.name || null, picture: payload.picture || null };
  } catch {
    return null;
  }
}

function titleCase(s: string): RiskLevel {
  const t = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return (['Critical', 'High', 'Moderate', 'Low'].includes(t) ? t : 'Moderate') as RiskLevel;
}

// --- Places: fetched ONCE and cached in memory (matches the backend's own comment that this
// payload is meant to be fetched once and filtered client-side, not re-queried per keystroke) ---
let placesCache: Place[] | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAllPlaces(): Promise<Place[]> {
  if (placesCache) return placesCache;

  // The backend can take up to a minute to respond on a cold start, and an early
  // request can fail outright while it's still coming up. Retrying with a short
  // backoff turns that into a brief wait instead of a hard error for the user.
  const delays = [0, 3000, 8000, 15000];
  let lastError: Error | null = null;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    try {
      const res = await fetch(`${API_BASE}/api/places`);
      if (!res.ok) throw new Error(`Server responded with status ${res.status}`);
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
        terrainIsEstimated: p.terrainIsEstimated,
      }));
      return placesCache!;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error('Unknown error');
    }
  }
  throw new Error('The server is taking longer than usual to respond. Please try again in a moment.');
}

// --- Real risk query -- uses the actual trained models' output, not placeholder data.
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
export async function submitPlace(data: { name: string; place_type?: string; district?: string; local_body?: string; approx_lat?: number; approx_lon?: number }) {
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

// --- Admin login: entirely separate from the regular Google-login session, uses its own
// token under a different localStorage key so the two never interfere with each other. ---
function adminAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('dip_admin_jwt');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Login failed.');
  }
  const { token } = await res.json();
  localStorage.setItem('dip_admin_jwt', token);
}

export function adminLogout() {
  localStorage.removeItem('dip_admin_jwt');
}

export function isAdmin(): boolean {
  return !!localStorage.getItem('dip_admin_jwt');
}

export interface PendingSubmission {
  id: number;
  name: string;
  place_type: string | null;
  district: string | null;
  local_body: string | null;
  approx_lat: number | null;
  approx_lon: number | null;
  created_at: string;
}

export async function fetchPendingSubmissions(): Promise<PendingSubmission[]> {
  const res = await fetch(`${API_BASE}/api/admin/submissions`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error('Could not load submissions. Are you still signed in as admin?');
  const d = await res.json();
  return d.results || [];
}

export async function approveSubmission(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/submissions/${id}/approve`, {
    method: 'POST',
    headers: adminAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Approval failed.');
  }
}

export async function rejectSubmission(id: number, notes = ''): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/submissions/${id}/reject?admin_notes=${encodeURIComponent(notes)}`, {
    method: 'POST',
    headers: adminAuthHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || 'Rejection failed.');
  }
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