import { useState, useEffect } from 'react';
import { submitIncidentReport, fetchRecentIncidents, type IncidentReport, type IncidentType } from '../lib/api';
import { useT, type TFunc } from '../i18n/useT';
import { dict } from '../i18n/dict/incidents';

const MUTED = '#4a5e62';

function getTypeLabels(t: TFunc): Record<IncidentType, string> {
  return {
    flood: t('typeFlood'),
    landslide: t('typeLandslide'),
    road_blocked: t('typeRoadBlocked'),
    other: t('typeOther'),
  };
}

function timeAgo(iso: string, t: TFunc): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t('justNow');
  if (mins < 60) return `${mins}${t('minsAgoSuffix')}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}${t('hoursAgoSuffix')}`;
  return `${Math.floor(hrs / 24)}${t('daysAgoSuffix')}`;
}

export default function IncidentsPage() {
  const t = useT(dict);
  const TYPE_LABELS = getTypeLabels(t);
  const [reports, setReports] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  const [incidentType, setIncidentType] = useState<IncidentType>('flood');
  const [description, setDescription] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const loadReports = () => {
    fetchRecentIncidents()
      .then((d) => {
        setReports(d.results || []);
        setNote(d.note || '');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, []);

  const getLocation = () => {
    if (!navigator.geolocation) {
      setLocError(t('noLocationSupport'));
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocError(t('locationDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async () => {
    if (!coords) {
      setSubmitError(t('locationRequired'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitIncidentReport({ incident_type: incidentType, description: description || undefined, lat: coords.lat, lon: coords.lon });
      setSubmitted(true);
      setDescription('');
      setCoords(null);
      loadReports();
      setTimeout(() => setSubmitted(false), 4000);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t('couldNotSubmitReport'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
          {t('communityReportsBadge')}
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 24px', letterSpacing: '-0.02em' }}>
          {t('pageTitle')}
        </h1>

        {/* Submission form */}
        <div style={{ padding: 20, background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2, marginBottom: 32 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED, marginBottom: 10, letterSpacing: '0.06em' }}>{t('whatAreYouSeeing')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 16 }}>
            {(Object.keys(TYPE_LABELS) as IncidentType[]).map((typeKey) => (
              <button
                key={typeKey}
                onClick={() => setIncidentType(typeKey)}
                style={{
                  padding: '8px 16px', borderRadius: 2, cursor: 'pointer',
                  fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                  background: incidentType === typeKey ? '#1F6F64' : '#ffffff',
                  color: incidentType === typeKey ? '#F2F4EF' : MUTED,
                  border: `1px solid ${incidentType === typeKey ? '#1F6F64' : 'rgba(18,38,43,0.2)'}`,
                }}
              >
                {TYPE_LABELS[typeKey]}
              </button>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            maxLength={500}
            rows={3}
            style={{
              width: '100%', padding: 12, border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3,
              fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, color: '#12262B', resize: 'vertical' as const,
              marginBottom: 16, boxSizing: 'border-box' as const,
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
            <button
              onClick={getLocation}
              disabled={locating}
              style={{
                padding: '10px 18px', borderRadius: 3, cursor: locating ? 'wait' : 'pointer',
                background: coords ? 'rgba(31,111,100,0.1)' : '#ffffff',
                border: `1px solid ${coords ? 'rgba(31,111,100,0.4)' : 'rgba(18,38,43,0.2)'}`,
                color: coords ? '#1F6F64' : '#12262B',
                fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13,
              }}
            >
              {locating ? t('locating') : coords ? `${t('locationSetPrefix')}${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)})` : t('useMyLocation')}
            </button>

            <button
              onClick={handleSubmit}
              disabled={submitting || !coords}
              style={{
                padding: '10px 24px', borderRadius: 3, border: 'none',
                cursor: submitting || !coords ? 'not-allowed' : 'pointer',
                background: submitting || !coords ? '#9fb3ae' : '#B54A2A',
                color: '#ffffff', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13,
              }}
            >
              {submitting ? t('submitting') : t('submitReport')}
            </button>
          </div>

          {locError && <div style={{ marginTop: 12, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>{locError}</div>}
          {submitError && <div style={{ marginTop: 12, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>{submitError}</div>}
          {submitted && <div style={{ marginTop: 12, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#1F6F64' }}>{t('reportSubmittedThanks')}</div>}
        </div>

        {/* Recent reports feed */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 18, color: '#12262B', margin: 0 }}>{t('recentCommunityReports')}</h2>
        </div>
        {note && (
          <div style={{ padding: '10px 16px', marginBottom: 16, background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: '#8a6216' }}>
            {note}
          </div>
        )}

        {loading && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>{t('loadingLabel')}</div>}
        {!loading && reports.length === 0 && (
          <div style={{ padding: '32px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>
            {t('noReportsNotice')}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map((r) => (
            <div key={r.id} style={{ padding: '14px 18px', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderLeft: '3px solid #D99A2B', borderRadius: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.06em', marginBottom: 6 }}>
                <span style={{ color: '#D99A2B', fontWeight: 600 }}>{TYPE_LABELS[r.incident_type].toUpperCase()}{t('unverifiedSuffix')}</span>
                <span>{timeAgo(r.created_at, t)}</span>
              </div>
              <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 14, color: '#12262B', marginBottom: 4 }}>
                {r.district || t('locationReported')}
              </div>
              {r.description && (
                <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0 }}>{r.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
