interface LoginPageProps {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#12262B',
      paddingTop: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        {/* Card */}
        <div style={{
          background: '#1a3540',
          border: '1px solid rgba(31, 111, 100, 0.25)',
          borderTop: '3px solid #1F6F64',
          borderRadius: 3,
          padding: '40px 36px',
          textAlign: 'center',
        }}>
          {/* DIP logo mark */}
          <div style={{
            width: 48,
            height: 48,
            background: '#1F6F64',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            margin: '0 auto 24px',
            borderRadius: 4,
            color: '#F2F4EF',
          }}>
            ◭
          </div>

          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#c8cdc4', letterSpacing: '0.12em', marginBottom: 8 }}>
            DIP/KL · SECURE ACCESS
          </div>

          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 22, color: '#F2F4EF', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
            Sign in to DIP Kerala
          </h2>

          <p style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 13, color: '#c8cdc4', margin: '0 0 32px', lineHeight: 1.6 }}>
            Sign in to submit missing places, upload damage assessments, and access authenticated endpoints. Risk queries and map access are always public.
          </p>

          {/* Google OAuth button */}
          <button
            onClick={onLogin}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: '13px 20px',
              background: '#F2F4EF',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              color: '#12262B',
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 600,
              fontSize: 14,
              letterSpacing: '0.02em',
              marginBottom: 20,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e0e3dc')}
            onMouseLeave={e => (e.currentTarget.style.background = '#F2F4EF')}
          >
            {/* Google G */}
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{
            padding: '10px 14px',
            background: 'rgba(242, 244, 239, 0.03)',
            border: '1px solid rgba(242, 244, 239, 0.07)',
            borderRadius: 2,
          }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#c8cdc4', lineHeight: 1.6, letterSpacing: '0.04em' }}>
              OAUTH 2.0 → JWT · SESSION DURATION: 1 HOUR<br />
              WRITES REQUIRE AUTH · RISK QUERIES ARE PUBLIC
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#c8cdc4', letterSpacing: '0.06em' }}>
          Disaster Intelligence Platform · Kerala · 2024
        </div>
      </div>
    </div>
  );
}
