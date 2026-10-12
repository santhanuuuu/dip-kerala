import { useState, useEffect } from 'react';
import { riskColor, type Alert } from '../data/mockData';
import { fetchRealAlerts } from '../lib/api';
import { type Page } from '../App';
import { useT } from '../i18n/useT';
import { dict } from '../i18n/dict/alerts';

interface AlertsPageProps {
  navigate: (page: Page, placeId?: number) => void;
}

type FilterType = 'all' | 'flood' | 'landslide' | 'combined';
type FilterLevel = 'all' | 'Critical' | 'High' | 'Moderate';

const MUTED = '#4a5e62';

export default function AlertsPage({ navigate }: AlertsPageProps) {
  const t = useT(dict);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('all');
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRealAlerts()
      .then(setActiveAlerts)
      .catch(() => setActiveAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = activeAlerts.filter(a => {
    const typeMatch = typeFilter === 'all' || a.type === typeFilter;
    const levelMatch = levelFilter === 'all' || a.riskLevel === levelFilter;
    return typeMatch && levelMatch;
  });

  const criticalCount = activeAlerts.filter(a => a.riskLevel === 'Critical').length;
  const highCount = activeAlerts.filter(a => a.riskLevel === 'High').length;
  const moderateCount = activeAlerts.filter(a => a.riskLevel === 'Moderate').length;

  const filterBtn = (active: boolean, color: string, onClick: () => void, label: string) => (
    <button onClick={onClick} style={{
      padding: '4px 12px',
      background: active ? `${color}14` : 'transparent',
      border: active ? `1px solid ${color}55` : '1px solid rgba(18,38,43,0.12)',
      borderRadius: 2, cursor: 'pointer',
      fontFamily: 'IBM Plex Mono, monospace', fontSize: 10,
      color: active ? color : MUTED,
      letterSpacing: '0.06em', textTransform: 'uppercase' as const,
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px' }}>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>{t('bulletinFeed')}</div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 20px', letterSpacing: '-0.02em' }}>{t('pageTitle')}</h1>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'CRITICAL', labelText: t('criticalLabel'), count: criticalCount, color: '#B54A2A' },
              { label: 'HIGH', labelText: t('highLabel'), count: highCount, color: '#D99A2B' },
              { label: 'MODERATE', labelText: t('moderateLabel'), count: moderateCount, color: '#7C9A3C' },
            ].map(({ label, labelText, count, color }) => (
              <div key={label} style={{ flex: 1, padding: '12px 16px', background: '#ffffff', border: `1px solid rgba(18,38,43,0.08)`, borderTop: `2px solid ${color}`, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(18,38,43,0.05)' }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 28, fontWeight: 600, color, lineHeight: 1 }}>{count}</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em' }}>{labelText}<br />{t('activeSuffix')}</span>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
            {filterBtn(typeFilter === 'all', '#1F6F64', () => setTypeFilter('all'), t('filterAll'))}
            {filterBtn(typeFilter === 'flood', '#B54A2A', () => setTypeFilter('flood'), t('filterFlood'))}
            {filterBtn(typeFilter === 'landslide', '#D99A2B', () => setTypeFilter('landslide'), t('filterLandslide'))}
            {filterBtn(typeFilter === 'combined', '#7C9A3C', () => setTypeFilter('combined'), t('filterCombined'))}
            <div style={{ width: 1, height: 16, background: 'rgba(18,38,43,0.12)', margin: '0 2px' }} />
            {filterBtn(levelFilter === 'all', '#1F6F64', () => setLevelFilter('all'), t('filterAllLevels'))}
            {filterBtn(levelFilter === 'Critical', '#B54A2A', () => setLevelFilter('Critical'), t('filterCritical'))}
            {filterBtn(levelFilter === 'High', '#D99A2B', () => setLevelFilter('High'), t('filterHigh'))}
            {filterBtn(levelFilter === 'Moderate', '#7C9A3C', () => setLevelFilter('Moderate'), t('filterModerate'))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && (
            <div style={{ padding: '48px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>{t('scanningLiveConditions')}</div>
            </div>
          )}
          {!loading && filtered.map((alert, i) => {
            const color = riskColor[alert.riskLevel];
            const isNew = i < 2;
            return (
              <div key={alert.id} style={{
                background: '#ffffff',
                border: `1px solid rgba(18,38,43,0.08)`,
                borderLeft: `3px solid ${color}`,
                borderRadius: 2, padding: '20px 24px',
                position: 'relative', overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(18,38,43,0.05)',
              }}>
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '4rem', color, opacity: 0.04, letterSpacing: '0.1em', pointerEvents: 'none', userSelect: 'none' as const }}>
                  {alert.type.toUpperCase()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color, background: `${color}14`, border: `1px solid ${color}35`, padding: '2px 8px', borderRadius: 1, letterSpacing: '0.1em', fontWeight: 600 }}>
                        {alert.riskLevel.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{alert.type} {t('riskSuffix')}</span>
                      {isNew && <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#7C9A3C', border: '1px solid #7C9A3C44', padding: '1px 6px', borderRadius: 1, letterSpacing: '0.06em' }}>{t('newBadge')}</span>}
                    </div>
                    <button onClick={() => navigate('manifest', alert.placeId)} style={{ display: 'block', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 18, color: '#12262B', marginBottom: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' as const, letterSpacing: '-0.01em' }}>
                      {alert.placeName} · {alert.district} {t('districtSuffix')}
                    </button>
                    <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.6 }}>{alert.message}</p>
                    {alert.affectedPopulation && (
                      <div style={{ marginTop: 10, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.06em' }}>
                        {t('estAffectedPopulation')} <span style={{ color: '#12262B', fontWeight: 500 }}>{alert.affectedPopulation.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 100 }}>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.08em', marginBottom: 4 }}>{t('issuedLabel')}</div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#12262B' }}>
                      {new Date(alert.issuedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, marginBottom: 12 }}>
                      {new Date(alert.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </div>
                    <button onClick={() => navigate('manifest', alert.placeId)} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#1F6F64', background: 'none', border: '1px solid rgba(31,111,100,0.35)', padding: '4px 10px', borderRadius: 2, cursor: 'pointer', letterSpacing: '0.04em' }}>
                      {t('viewManifestButton')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '48px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED, letterSpacing: '0.06em' }}>{t('noAlertsMatchingFilter')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
