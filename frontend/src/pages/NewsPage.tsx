import { useState, useEffect } from 'react';
import { fetchNews } from '../lib/api';

const MUTED = '#4a5e62';

interface NewsArticle {
  title: string;
  description: string | null;
  url: string;
  image_url: string | null;
  source_name: string | null;
  published_at: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return 'Just now';
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNews()
      .then((d) => {
        setArticles(d.results || []);
        setLastRefreshed(d.last_refreshed || null);
      })
      .catch(() => setError('Could not load news from the backend.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#F2F4EF' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.12em', marginBottom: 8 }}>
            LIVE FEED — KERALA DISASTER NEWS
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 28, color: '#12262B', margin: 0, letterSpacing: '-0.02em' }}>
              News
            </h1>
            {lastRefreshed && (
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: MUTED }}>
                Refreshed {timeAgo(lastRefreshed)} · updates hourly
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: MUTED }}>Loading news…</span>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 16px', background: 'rgba(181,74,42,0.08)', border: '1px solid rgba(181,74,42,0.3)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#B54A2A' }}>
            {error}
          </div>
        )}

        {!loading && !error && articles.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: '#ffffff', border: '1px solid rgba(18,38,43,0.08)', borderRadius: 2 }}>
            <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 16, color: '#12262B', marginBottom: 8 }}>
              No articles yet
            </div>
            <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 14, color: MUTED, margin: 0 }}>
              The news cache refreshes hourly on the backend — check back shortly.
            </p>
          </div>
        )}

        {!loading && articles.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {articles.map((a, i) => (
              <a
                key={i}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', flexDirection: 'column',
                  background: '#ffffff',
                  border: '1px solid rgba(18,38,43,0.08)',
                  borderRadius: 2, overflow: 'hidden',
                  textDecoration: 'none', color: 'inherit',
                  boxShadow: '0 1px 4px rgba(18,38,43,0.05)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(18,38,43,0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 4px rgba(18,38,43,0.05)';
                }}
              >
                {a.image_url && (
                  <div style={{ width: '100%', height: 150, background: '#e5e8e2', overflow: 'hidden' }}>
                    <img
                      src={a.image_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED, letterSpacing: '0.06em' }}>
                    <span>{(a.source_name || 'UNKNOWN SOURCE').toUpperCase()}</span>
                    <span>{timeAgo(a.published_at)}</span>
                  </div>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 15, color: '#12262B', lineHeight: 1.3 }}>
                    {a.title}
                  </div>
                  {a.description && (
                    <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: MUTED, lineHeight: 1.5, margin: 0, flex: 1 }}>
                      {a.description.length > 140 ? a.description.slice(0, 140) + '…' : a.description}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
