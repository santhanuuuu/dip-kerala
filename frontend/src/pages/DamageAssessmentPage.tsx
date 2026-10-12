import { useState, useRef, useEffect } from 'react';
import { damageColor, type Place, type DamageRecord } from '../data/mockData';
import { fetchAllPlaces, submitDamageAssessment, fetchDamageHistory, fetchRecentDamageAssessments, isLoggedIn, type RecentDamageRecord } from '../lib/api';
import useIsMobile from '../hooks/useIsMobile';
import { useT, type TFunc } from '../i18n/useT';
import { dict } from '../i18n/dict/damageAssessment';

type DamageClass = 'no-damage' | 'minor-damage' | 'major-damage' | 'destroyed';
interface InferenceResult { damageClass: DamageClass; confidence: number; placeName: string }

const MUTED = '#4a5e62';
const CARD = { background: '#ffffff', border: '1px solid rgba(18,38,43,0.09)', borderRadius: 2, boxShadow: '0 1px 6px rgba(18,38,43,0.05)' } as const;

function getDamageLabel(t: TFunc): Record<DamageClass, string> {
  return {
    'no-damage': t('damageNoDamage'),
    'minor-damage': t('damageMinor'),
    'major-damage': t('damageMajor'),
    destroyed: t('damageDestroyed'),
  };
}

export default function DamageAssessmentPage() {
  const t = useT(dict);
  const damageLabelT = getDamageLabel(t);
  const isMobile = useIsMobile();
  const [preImage, setPreImage] = useState<string | null>(null);
  const [preFile, setPreFile] = useState<File | null>(null);
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postFile, setPostFile] = useState<File | null>(null);
  const [selectedPlace, setSelectedPlace] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [recentRecords, setRecentRecords] = useState<DamageRecord[]>([]);
  const [statewideRecords, setStatewideRecords] = useState<RecentDamageRecord[]>([]);
  const [statewideLoading, setStatewideLoading] = useState(true);
  const preInputRef = useRef<HTMLInputElement>(null);
  const postInputRef = useRef<HTMLInputElement>(null);
  const loggedIn = isLoggedIn();

  useEffect(() => {
    fetchAllPlaces().then(setPlaces).catch(() => setPlaces([]));
  }, []);

  // Statewide feed -- loads immediately on entering the page, independent of place selection,
  // so there's something real to see (like the home page's active bulletins) instead of an
  // empty "select a place" placeholder.
  useEffect(() => {
    setStatewideLoading(true);
    fetchRecentDamageAssessments(10)
      .then(setStatewideRecords)
      .catch(() => setStatewideRecords([]))
      .finally(() => setStatewideLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPlace) {
      fetchDamageHistory(Number(selectedPlace)).then(setRecentRecords).catch(() => setRecentRecords([]));
    }
  }, [selectedPlace]);

  const jumpToPlace = (placeId: number) => {
    setSelectedPlace(String(placeId));
  };

  const handleImageUpload = (file: File, type: 'pre' | 'post') => {
    const reader = new FileReader();
    reader.onload = e => {
      if (type === 'pre') { setPreImage(e.target?.result as string); setPreFile(file); }
      else { setPostImage(e.target?.result as string); setPostFile(file); }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent, type: 'pre' | 'post') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handleImageUpload(file, type);
  };

  const runInference = async () => {
    if (!preFile || !postFile || !selectedPlace) return;
    if (!loggedIn) {
      setError(t('signInToRun'));
      return;
    }
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const place = places.find(p => p.id === Number(selectedPlace));
      const response = await submitDamageAssessment(Number(selectedPlace), preFile, postFile);
      setResult({
        damageClass: response.damage_class as DamageClass,
        confidence: response.confidence,
        placeName: place?.name || t('unknownPlace'),
      });
      fetchDamageHistory(Number(selectedPlace)).then(setRecentRecords).catch(() => {});
      fetchRecentDamageAssessments(10).then(setStatewideRecords).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setRunning(false);
    }
  };

  const canRun = preImage && postImage && selectedPlace;
  const inputStyle = { width: '100%', background: '#F2F4EF', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 2, padding: '9px 12px', color: '#12262B', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, outline: 'none' };
  const labelStyle = { fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.08em', display: 'block', marginBottom: 6 };

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>{t('pageTitle')}</h1>
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0, maxWidth: 600 }}>
            {t('pageSubtitle')}
          </p>
        </div>

        {!loggedIn && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#D99A2B', letterSpacing: '0.04em' }}>
            {t('signInNotice')}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 16 }}>
          <div>
            <div style={{ ...CARD, padding: '20px 24px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 14 }}>{t('assessmentMetadata')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t('placeLabel')}</label>
                  <select value={selectedPlace} onChange={e => setSelectedPlace(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">{t('selectPlace')}</option>
                    {places.map(p => <option key={p.id} value={p.id}>{p.name} ({p.district})</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('eventDateLabel')}</label>
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{ ...CARD, padding: '20px 24px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 14 }}>{t('imagePairHeading')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr', gap: isMobile ? 8 : 12 }}>
                {(['pre', 'post'] as const).map(type => {
                  const img = type === 'pre' ? preImage : postImage;
                  const inputRef = type === 'pre' ? preInputRef : postInputRef;
                  return (
                    <div key={type} onDrop={e => handleDrop(e, type)} onDragOver={e => e.preventDefault()} onClick={() => inputRef.current?.click()} style={{
                      border: `1.5px dashed ${img ? 'rgba(31,111,100,0.5)' : 'rgba(18,38,43,0.18)'}`,
                      borderRadius: 3, aspectRatio: '4/3',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', overflow: 'hidden', position: 'relative',
                      background: img ? 'transparent' : '#F2F4EF',
                      transition: 'border-color 0.15s',
                    }}>
                      {img ? (
                        <>
                          <img src={img} alt={`${type}-event`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', top: 8, left: 8, fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#ffffff', background: 'rgba(18,38,43,0.7)', padding: '2px 8px', borderRadius: 1, letterSpacing: '0.08em' }}>
                            {type === 'pre' ? t('preLabel') : t('postLabel')}{t('eventSuffix')}
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.25, color: '#12262B' }}>⊕</div>
                          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.06em', marginBottom: 4 }}>{type === 'pre' ? t('preLabel') : t('postLabel')}{t('eventImageSuffix')}</div>
                          <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11, color: MUTED, opacity: 0.7 }}>{t('clickOrDragUpload')}</div>
                        </div>
                      )}
                      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, type); }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: '10px 16px', background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#B54A2A' }}>
                {error}
              </div>
            )}

            <button onClick={runInference} disabled={!canRun || running} style={{
              width: '100%', padding: '13px',
              background: canRun && !running ? '#1F6F64' : 'rgba(18,38,43,0.08)',
              border: 'none', borderRadius: 3,
              cursor: canRun && !running ? 'pointer' : 'not-allowed',
              color: canRun ? '#F2F4EF' : MUTED,
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 14,
              letterSpacing: '0.04em', transition: 'background 0.15s',
            }}>
              {running ? t('runningInference') : t('runDamageAssessment')}
            </button>

            {result && (
              <div style={{
                marginTop: 12, padding: '20px 24px',
                background: '#ffffff',
                border: `1px solid ${damageColor[result.damageClass]}30`,
                borderTop: `3px solid ${damageColor[result.damageClass]}`,
                borderRadius: 2, position: 'relative', overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(18,38,43,0.06)',
              }}>
                <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%) rotate(-8deg)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '4rem', color: damageColor[result.damageClass], opacity: 0.05, pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  {result.damageClass.replace('-', ' ').toUpperCase()}
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginBottom: 8 }}>{t('classificationResultPrefix')} {result.placeName}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: damageColor[result.damageClass] }}>{damageLabelT[result.damageClass]}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, color: MUTED }}>{Math.round(result.confidence * 100)}{t('confidenceSuffix')}</span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: 5, background: i < Math.round(result.confidence * 10) ? damageColor[result.damageClass] : 'rgba(18,38,43,0.08)', borderRadius: 1 }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            {selectedPlace ? (
              <div style={{ ...CARD, padding: '16px 18px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em' }}>{t('assessmentHistoryHeading')}</div>
                  <button onClick={() => setSelectedPlace('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, textDecoration: 'underline', padding: 0 }}>
                    {t('allPlacesButton')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentRecords.length === 0 && (
                    <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED }}>{t('noPriorAssessments')}</p>
                  )}
                  {recentRecords.map(rec => (
                    <div key={rec.id} style={{ padding: '10px 12px', background: '#F2F4EF', border: `1px solid rgba(18,38,43,0.07)`, borderLeft: `2px solid ${damageColor[rec.damageClass]}`, borderRadius: 2 }}>
                      <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: '#12262B', marginBottom: 3 }}>{rec.placeName}</div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: damageColor[rec.damageClass], letterSpacing: '0.06em', marginBottom: 2 }}>{damageLabelT[rec.damageClass].toUpperCase()}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{Math.round(rec.confidence * 100)}{t('confSuffix')}</span>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{rec.eventDate}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ ...CARD, padding: '16px 18px', marginBottom: 12 }}>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 12 }}>
                  {t('recentDamageStatewide')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {statewideLoading && (
                    <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED }}>{t('loadingRecentAssessments')}</p>
                  )}
                  {!statewideLoading && statewideRecords.length === 0 && (
                    <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED }}>
                      {t('noAssessmentsStatewide')}
                    </p>
                  )}
                  {statewideRecords.map(rec => (
                    <button
                      key={rec.id}
                      onClick={() => jumpToPlace(rec.placeId)}
                      style={{
                        textAlign: 'left', width: '100%', cursor: 'pointer',
                        padding: '10px 12px', background: '#F2F4EF',
                        border: `1px solid rgba(18,38,43,0.07)`, borderLeft: `2px solid ${damageColor[rec.damageClass]}`,
                        borderRadius: 2, font: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: '#12262B' }}>{rec.placeName}</span>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, whiteSpace: 'nowrap' }}>{rec.district}</span>
                      </div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: damageColor[rec.damageClass], letterSpacing: '0.06em', marginBottom: 2 }}>{damageLabelT[rec.damageClass].toUpperCase()}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{Math.round(rec.confidence * 100)}{t('confSuffix')}</span>
                        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{rec.eventDate}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
