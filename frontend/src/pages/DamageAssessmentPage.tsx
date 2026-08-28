import { useState, useRef, useEffect } from 'react';
import { damageLabel, damageColor, type Place, type DamageRecord } from '../data/mockData';
import { fetchAllPlaces, submitDamageAssessment, fetchDamageHistory, isLoggedIn } from '../lib/api';

type DamageClass = 'no-damage' | 'minor-damage' | 'major-damage' | 'destroyed';
interface InferenceResult { damageClass: DamageClass; confidence: number; placeName: string }

const MUTED = '#4a5e62';
const CARD = { background: '#ffffff', border: '1px solid rgba(18,38,43,0.09)', borderRadius: 2, boxShadow: '0 1px 6px rgba(18,38,43,0.05)' } as const;

export default function DamageAssessmentPage() {
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
  const preInputRef = useRef<HTMLInputElement>(null);
  const postInputRef = useRef<HTMLInputElement>(null);
  const loggedIn = isLoggedIn();

  useEffect(() => {
    fetchAllPlaces().then(setPlaces).catch(() => setPlaces([]));
  }, []);

  useEffect(() => {
    if (selectedPlace) {
      fetchDamageHistory(Number(selectedPlace)).then(setRecentRecords).catch(() => setRecentRecords([]));
    }
  }, [selectedPlace]);

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
      setError('Sign in with Google to run damage assessment.');
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
        placeName: place?.name || 'Unknown',
      });
      fetchDamageHistory(Number(selectedPlace)).then(setRecentRecords).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assessment failed. Is damage_model.pt loaded on the backend?');
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
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Satellite Damage Classifier</h1>
          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, margin: 0, maxWidth: 600 }}>
            Upload pre-event and post-event images for a location to run the real trained
            classifier (~66% overall accuracy; see the model's own accuracy figures below).
          </p>
        </div>

        {!loggedIn && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(217,154,43,0.08)', border: '1px solid rgba(217,154,43,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#D99A2B', letterSpacing: '0.04em' }}>
            ⚠ Sign in via the top bar to run an assessment — this endpoint requires authentication.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            <div style={{ ...CARD, padding: '20px 24px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 14 }}>ASSESSMENT METADATA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>PLACE / LSGD UNIT</label>
                  <select value={selectedPlace} onChange={e => setSelectedPlace(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select place…</option>
                    {places.map(p => <option key={p.id} value={p.id}>{p.name} ({p.district})</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>EVENT DATE</label>
                  <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            <div style={{ ...CARD, padding: '20px 24px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 14 }}>IMAGE PAIR — PRE / POST EVENT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                            {type.toUpperCase()}-EVENT
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.25, color: '#12262B' }}>⊕</div>
                          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.06em', marginBottom: 4 }}>{type.toUpperCase()}-EVENT IMAGE</div>
                          <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 11, color: MUTED, opacity: 0.7 }}>Click or drag to upload</div>
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
              {running ? '▶ RUNNING INFERENCE…' : '▶ RUN DAMAGE ASSESSMENT'}
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
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED, letterSpacing: '0.1em', marginBottom: 8 }}>CLASSIFICATION RESULT · {result.placeName}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 12 }}>
                  <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: damageColor[result.damageClass] }}>{damageLabel[result.damageClass]}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, color: MUTED }}>{Math.round(result.confidence * 100)}% confidence</span>
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
            <div style={{ ...CARD, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.1em', marginBottom: 12 }}>
                {selectedPlace ? 'ASSESSMENT HISTORY — THIS PLACE' : 'SELECT A PLACE TO SEE HISTORY'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentRecords.length === 0 && selectedPlace && (
                  <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: MUTED }}>No prior assessments recorded for this place yet.</p>
                )}
                {recentRecords.map(rec => (
                  <div key={rec.id} style={{ padding: '10px 12px', background: '#F2F4EF', border: `1px solid rgba(18,38,43,0.07)`, borderLeft: `2px solid ${damageColor[rec.damageClass]}`, borderRadius: 2 }}>
                    <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 13, color: '#12262B', marginBottom: 3 }}>{rec.placeName}</div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: damageColor[rec.damageClass], letterSpacing: '0.06em', marginBottom: 2 }}>{damageLabel[rec.damageClass].toUpperCase()}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{Math.round(rec.confidence * 100)}% conf.</span>
                      <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: MUTED }}>{rec.eventDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
