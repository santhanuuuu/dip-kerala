import { useState } from 'react';
import { submitPlace } from '../lib/api';

const districts = [
  'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam',
  'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta',
  'Thiruvananthapuram', 'Thrissur', 'Wayanad',
];

const placeTypes = [
  { value: 'gram_panchayat', label: 'Gram Panchayat' },
  { value: 'municipality', label: 'Municipality' },
  { value: 'municipal_corporation', label: 'Municipal Corporation' },
  { value: 'city', label: 'City / Town' },
];

const MUTED = '#4a5e62';

export default function SubmitPlacePage({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [form, setForm] = useState({ name: '', district: '', type: '', lat: '', lon: '', notes: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoggedIn) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitPlace({
        name: form.name,
        place_type: form.type || undefined,
        district: form.district || undefined,
        approx_lat: form.lat ? parseFloat(form.lat) : undefined,
        approx_lon: form.lon ? parseFloat(form.lon) : undefined,
      } as any);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const inputStyle = { width: '100%', background: '#F2F4EF', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 2, padding: '10px 14px', color: '#12262B', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, outline: 'none' };
  const labelStyle = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.08em', display: 'block', marginBottom: 6 };

  if (submitted) {
    return (
      <div style={{ minHeight: '60vh', background: '#F2F4EF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', padding: '48px 40px', background: '#ffffff', border: '1px solid rgba(124,154,60,0.25)', borderTop: '3px solid #7C9A3C', borderRadius: 3, maxWidth: 480, boxShadow: '0 4px 16px rgba(18,38,43,0.08)' }}>
          <div style={{ fontSize: 32, marginBottom: 16, color: '#7C9A3C' }}>✓</div>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 20, color: '#12262B', marginBottom: 8 }}>Submission received</div>
          <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>
            <strong style={{ color: '#12262B' }}>{form.name}</strong> has been submitted for review. An admin will verify the coordinates and place type. Once approved, it will appear in the LSGD database.
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.08em' }}>
            STATUS: PENDING REVIEW
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>PLACE SUBMISSION — PENDING ADMIN REVIEW</div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Submit a Missing Place</h1>
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0 }}>
            If a panchayat, municipality, or city isn't in the LSGD database, submit it here. An admin will review and add it — terrain features will be backfilled later.
          </p>
        </div>

        {!isLoggedIn && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#D99A2B', letterSpacing: '0.04em' }}>
            ⚠ Sign in via the top bar to submit — submissions require authentication.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ background: '#ffffff', border: '1px solid rgba(18,38,43,0.09)', borderRadius: 2, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '0 2px 8px rgba(18,38,43,0.05)' }}>
            <div>
              <label style={labelStyle}>PLACE NAME (ENGLISH) *</label>
              <input required value={form.name} onChange={set('name')} placeholder="e.g. Ponmudi" style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>DISTRICT *</label>
                <select required value={form.district} onChange={set('district')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select district…</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>PLACE TYPE *</label>
                <select required value={form.type} onChange={set('type')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Select type…</option>
                  {placeTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>APPROX. LATITUDE (°N)</label>
                <input type="number" step="0.0001" min="8" max="13" value={form.lat} onChange={set('lat')} placeholder="e.g. 10.4241" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>APPROX. LONGITUDE (°E)</label>
                <input type="number" step="0.0001" min="74" max="78" value={form.lon} onChange={set('lon')} placeholder="e.g. 76.8366" style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>ADDITIONAL NOTES (OPTIONAL)</label>
              <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any context — alternate spellings, why it's missing, etc." style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div style={{ padding: '10px 14px', background: 'rgba(217,154,43,0.06)', border: '1px solid rgba(217,154,43,0.2)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#D99A2B', letterSpacing: '0.04em', lineHeight: 1.6 }}>
              ⚠ Submissions do not auto-promote. An admin reviews each entry. Terrain features are backfilled after approval.
            </div>
            {submitError && (
              <div style={{ padding: '10px 14px', background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#B54A2A' }}>
                {submitError}
              </div>
            )}
            <button type="submit" disabled={!isLoggedIn || submitting} style={{ padding: '12px', background: isLoggedIn ? '#1F6F64' : 'rgba(18,38,43,0.1)', border: 'none', borderRadius: 2, cursor: isLoggedIn ? 'pointer' : 'not-allowed', color: isLoggedIn ? '#F2F4EF' : MUTED, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>
              {submitting ? 'SUBMITTING...' : 'SUBMIT FOR REVIEW'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
