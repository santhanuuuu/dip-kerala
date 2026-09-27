import { useState, useEffect } from 'react';
import { fetchAllShelters, fetchHelplines, submitShelter, distanceKm, directionsUrl, type ShelterInfo, isLoggedIn } from '../lib/api';

const MUTED = '#4a5e62';

interface HelplineContact {
  district: string;
  contact_type: string;
  name: string | null;
  phone_number: string;
}

export default function SheltersPage() {
  const [shelters, setShelters] = useState<ShelterInfo[]>([]);
  const [helplines, setHelplines] = useState<HelplineContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [userLoc, setUserLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // Suggest-a-shelter form state
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDistrict, setFormDistrict] = useState('');
  const [formCapacity, setFormCapacity] = useState('');
  const [formCoords, setFormCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [formLocating, setFormLocating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);

  useEffect(() => {
    Promise.all([fetchAllShelters(), fetchHelplines()])
      .then(([shelterData, helplineData]) => {
        setShelters(shelterData.results || []);
        setNote(shelterData.note || '');
        setHelplines(helplineData.results || []);
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

  // Real, already-verified numbers (services/helplines.py) -- shown as the actionable
  // fallback when there's nothing in the shelters table itself, rather than a dead end.
  const disasterManagementContacts = helplines.filter(
    (h) => h.contact_type === 'disaster_management' || h.contact_type === 'control_room'
  );

  const useMyLocationForForm = () => {
    if (!navigator.geolocation) {
      setFormError('Your browser does not support location access.');
      return;
    }
    setFormLocating(true);
    setFormError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setFormLocating(false);
      },
      () => {
        setFormError('Could not get your location -- check your browser/device location permission.');
        setFormLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleShelterSubmit = async () => {
    if (!formName.trim() || !formDistrict.trim()) {
      setFormError('Name and district are required.');
      return;
    }
    if (!formCoords) {
      setFormError('Location is required -- tap "Use my location" first.');
      return;
    }
    setFormSubmitting(true);
    setFormError(null);
    try {
      await submitShelter({
        name: formName.trim(),
        district: formDistrict.trim(),
        lat: formCoords.lat,
        lon: formCoords.lon,
        capacity: formCapacity ? parseInt(formCapacity, 10) : undefined,
      });
      setFormSubmitted(true);
      setFormName(''); setFormDistrict(''); setFormCapacity(''); setFormCoords(null);
      setShowForm(false);
      setTimeout(() => setFormSubmitted(false), 5000);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not submit.');
    } finally {
      setFormSubmitting(false);
    }
  };

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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            {shelters.length > 0 && (
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
            )}
            <button
              onClick={() => setShowForm((s) => !s)}
              style={{
                padding: '10px 20px', background: showForm ? 'rgba(217,154,43,0.12)' : '#ffffff',
                border: `1px solid ${showForm ? 'rgba(217,154,43,0.5)' : 'rgba(18,38,43,0.2)'}`, borderRadius: 3,
                color: showForm ? '#8a6216' : '#12262B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              + Suggest a Shelter
            </button>
          </div>
        </div>

        {formSubmitted && (
          <div style={{ padding: '10px 16px', marginBottom: 16, background: 'rgba(31,111,100,0.08)', border: '1px solid rgba(31,111,100,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#1F6F64' }}>
            Thank you — submitted for admin review. It'll appear here once confirmed.
          </div>
        )}

        {showForm && (
          <div style={{ padding: 20, background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2, marginBottom: 24 }}>
            {!isLoggedIn() ? (
              <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0 }}>
                Sign in to suggest a shelter -- submissions are tied to an account so admins can follow up if needed.
              </p>
            ) : (
              <>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginBottom: 12, letterSpacing: '0.06em' }}>
                  SUGGEST A SHELTER — reviewed by an admin before it appears publicly
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <input
                    value={formName} onChange={(e) => setFormName(e.target.value)}
                    placeholder="Name (e.g. Govt. HS Thrikkakara)"
                    style={{ padding: 10, border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13 }}
                  />
                  <input
                    value={formDistrict} onChange={(e) => setFormDistrict(e.target.value)}
                    placeholder="District"
                    style={{ padding: 10, border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13 }}
                  />
                </div>
                <input
                  value={formCapacity} onChange={(e) => setFormCapacity(e.target.value.replace(/\D/g, ''))}
                  placeholder="Approx. capacity (optional)"
                  style={{ width: '100%', padding: 10, border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' as const }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
                  <button
                    onClick={useMyLocationForForm}
                    disabled={formLocating}
                    style={{
                      padding: '9px 16px', borderRadius: 3, cursor: formLocating ? 'wait' : 'pointer',
                      background: formCoords ? 'rgba(31,111,100,0.1)' : '#ffffff',
                      border: `1px solid ${formCoords ? 'rgba(31,111,100,0.4)' : 'rgba(18,38,43,0.2)'}`,
                      color: formCoords ? '#1F6F64' : '#12262B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12,
                    }}
                  >
                    {formLocating ? 'Locating…' : formCoords ? `✓ Location set (${formCoords.lat.toFixed(3)}, ${formCoords.lon.toFixed(3)})` : '📍 Use my location'}
                  </button>
                  <button
                    onClick={handleShelterSubmit}
                    disabled={formSubmitting}
                    style={{
                      padding: '9px 20px', borderRadius: 3, border: 'none', cursor: formSubmitting ? 'wait' : 'pointer',
                      background: '#1F6F64', color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12,
                    }}
                  >
                    {formSubmitting ? 'Submitting…' : 'Submit for Review'}
                  </button>
                </div>
                {formError && <div style={{ marginTop: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>{formError}</div>}
              </>
            )}
          </div>
        )}

        {locError && (
          <div style={{ padding: '10px 16px', marginBottom: 16, background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>
            {locError}
          </div>
        )}

        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading…</span>
          </div>
        )}

        {/* Honest empty state: no shelters in our records right now (no public standing feed
            of designated relief camps exists for Kerala -- these are only published by
            district authorities once an emergency is actually declared). Rather than a dead
            end, this points to the real, already-verified disaster management numbers. */}
        {!loading && shelters.length === 0 && (
          <div style={{ background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B', marginBottom: 8 }}>
                No shelters in our records right now
              </div>
              <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: '0 auto', maxWidth: 480, lineHeight: 1.6 }}>
                This isn't the same as "no emergency" -- relief camps in Kerala are designated by
                district authorities only once an emergency is actually declared, so there's no
                standing public list to show in advance. If you need a shelter right now, contact
                your district's disaster management control room directly:
              </p>
            </div>
            {disasterManagementContacts.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(18,38,43,0.08)' }}>
                {disasterManagementContacts.map((c, i) => (
                  <a
                    key={i}
                    href={`tel:${c.phone_number}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 24px', textDecoration: 'none',
                      borderTop: i > 0 ? '1px solid rgba(18,38,43,0.06)' : 'none',
                    }}
                  >
                    <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, color: '#12262B' }}>
                      {c.name || c.contact_type} · {c.district}
                    </span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, color: '#1F6F64', fontWeight: 600 }}>
                      📞 {c.phone_number}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {note && shelters.length > 0 && (
          <div style={{ padding: '10px 16px', marginBottom: 20, background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: '#8a6216' }}>
            {note}
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