import { type Page } from '../App';

interface NavProps {
  navigate: (page: Page) => void;
  isLoggedIn: boolean;
  onLogin: () => void;
}

const navItems: { page: Page; label: string; icon: string }[] = [
  { page: 'home', label: 'Search', icon: '◈' },
  { page: 'dashboard', label: 'GIS Map', icon: '⊞' },
  { page: 'alerts', label: 'Alerts', icon: '⚠' },
  { page: 'analytics', label: 'Analytics', icon: '▣' },
  { page: 'damage', label: 'Damage', icon: '◉' },
  { page: 'submit', label: 'Submit Place', icon: '+' },
];

export default function Nav({ navigate, isLoggedIn, onLogin }: NavProps) {
  return (
    <nav style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 1000,
      background: 'rgba(242, 244, 239, 0.96)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(18, 38, 43, 0.12)',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', height: 56 }}>
        <button
          onClick={() => navigate('home')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{
            width: 28, height: 28,
            background: '#1F6F64',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#F2F4EF',
            fontFamily: 'IBM Plex Mono, monospace',
          }}>◭</div>
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, color: '#12262B', letterSpacing: '0.04em' }}>
            DIP<span style={{ color: '#1F6F64' }}>/</span>Kerala
          </span>
        </button>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {navItems.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => navigate(page)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                background: 'none',
                border: '1px solid transparent',
                borderRadius: 3,
                cursor: 'pointer',
                color: '#4a5e62',
                fontSize: 12,
                fontFamily: 'IBM Plex Mono, monospace',
                fontWeight: 500,
                letterSpacing: '0.04em',
                transition: 'color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#12262B';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(18,38,43,0.15)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = '#4a5e62';
                (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
              }}
            >
              <span style={{ fontSize: 10 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 16 }} />

        {isLoggedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: '#1F6F64',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#F2F4EF',
              fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600,
            }}>KS</div>
            <span style={{ fontSize: 12, color: '#4a5e62', fontFamily: 'IBM Plex Mono, monospace' }}>signed in</span>
          </div>
        ) : (
          <button
            onClick={onLogin}
            style={{
              padding: '6px 14px',
              background: '#1F6F64',
              border: 'none', borderRadius: 3,
              cursor: 'pointer',
              color: '#F2F4EF',
              fontSize: 12,
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 600, letterSpacing: '0.04em',
            }}
          >Sign in</button>
        )}
      </div>
    </nav>
  );
}
