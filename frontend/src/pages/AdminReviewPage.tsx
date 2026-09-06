import { useState, useEffect } from 'react';
import { fetchPendingSubmissions, approveSubmission, rejectSubmission, type PendingSubmission } from '../lib/api';
import useIsMobile from '../hooks/useIsMobile';

const MUTED = '#4a5e62';

export default function AdminReviewPage() {
  const isMobile = useIsMobile();
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    fetchPendingSubmissions()
      .then(setSubmissions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: number) => {
    setActingOn(id);
    try {
      await approveSubmission(id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setActingOn(null);
    }
  };

  const handleReject = async (id: number) => {
    setActingOn(id);
    try {
      await rejectSubmission(id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed.');
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '24px 16px 48px' : '32px 24px 64px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>ADMIN</div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 26, color: '#12262B', margin: 0, letterSpacing: '-0.02em' }}>
            Review Submissions
          </h1>
        </div>

        {error && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>
            {error}
          </div>
        )}

        {loading && <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading submissions…</p>}

        {!loading && submissions.length === 0 && !error && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, color: MUTED, margin: 0 }}>Nothing pending review right now.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {submissions.map((s) => (
            <div key={s.id} style={{ background: '#ffffff', border: '1px solid rgba(18,38,43,0.09)', borderRadius: 2, padding: isMobile ? '16px' : '18px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                <div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B' }}>{s.name}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginTop: 2 }}>
                    {s.place_type || 'unspecified type'} · {s.district || 'unspecified district'}
                    {s.local_body ? ` · ${s.local_body}` : ''}
                  </div>
                </div>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED }}>
                  {new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
              {(s.approx_lat !== null && s.approx_lon !== null) && (
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginBottom: 12 }}>
                  {s.approx_lat.toFixed(4)}°N {s.approx_lon.toFixed(4)}°E
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleApprove(s.id)}
                  disabled={actingOn === s.id}
                  style={{ padding: '8px 16px', background: '#1F6F64', border: 'none', borderRadius: 2, color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, cursor: actingOn === s.id ? 'wait' : 'pointer' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(s.id)}
                  disabled={actingOn === s.id}
                  style={{ padding: '8px 16px', background: 'none', border: '1px solid rgba(181,74,42,0.4)', borderRadius: 2, color: '#B54A2A', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, cursor: actingOn === s.id ? 'wait' : 'pointer' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
