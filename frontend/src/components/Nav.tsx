import { useState, useRef, useEffect } from 'react';
import { type Page } from '../App';
import { getCurrentUser, adminLogin } from '../lib/api';
import useIsMobile from '../hooks/useIsMobile';

interface NavProps {
  navigate: (page: Page) => void;
  isLoggedIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  isAdmin: boolean;
  onAdminLoggedIn: () => void;
  onAdminLogout: () => void;
}

const navItems: { page: Page; label: string; icon: string }[] = [
  { page: 'home', label: 'Search', icon: '◈' },
  { page: 'dashboard', label: 'GIS Map', icon: '⊞' },
  { page: 'alerts', label: 'Alerts', icon: '⚠' },
  { page: 'analytics', label: 'Analytics', icon: '▣' },
  { page: 'damage', label: 'Damage', icon: '◉' },
  { page: 'submit', label: 'Submit Place', icon: '+' },
];

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/** A single clickable control: the avatar itself opens a small dropdown containing
 * "Sign out" -- there is never a separate persistent "Sign out" button sitting next
 * to a "signed in" label, just one element that both shows identity and lets you exit. */
function AuthControl({ isLoggedIn, onLogin, onLogout }: { isLoggedIn: boolean; onLogin: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!isLoggedIn) {
    return (
      <button
        onClick={onLogin}
        style={{
          padding: '6px 14px', background: '#1F6F64', border: 'none', borderRadius: 3,
          cursor: 'pointer', color: '#F2F4EF', fontSize: 12,
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, letterSpacing: '0.04em',
        }}
      >Sign in</button>
    );
  }

  const user = getCurrentUser();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#1F6F64',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600,
          }}>{user ? initials(user.name, user.email) : ''}</div>
        )}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          background: '#ffffff', border: '1px solid rgba(18,38,43,0.12)', borderRadius: 3,
          boxShadow: '0 8px 20px rgba(18,38,43,0.12)', minWidth: 160, overflow: 'hidden', zIndex: 1100,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(18,38,43,0.08)', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#4a5e62' }}>
            {user?.name || user?.email}
          </div>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#B54A2A', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Deliberately unobtrusive -- a small text link, not a prominent button, and it never
 * shows or fills in the actual admin credentials anywhere in the UI. The credentials
 * themselves are only ever checked server-side (see backend/routers/auth.py). */
function AdminControl({ isAdmin, onAdminLoggedIn, onAdminLogout }: { isAdmin: boolean; onAdminLoggedIn: () => void; onAdminLogout: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAdmin) {
    return (
      <button
        onClick={onAdminLogout}
        style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED_ADMIN, background: 'none', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3, padding: '4px 8px', cursor: 'pointer', letterSpacing: '0.04em' }}
      >
        Admin · sign out
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowForm((s) => !s)}
        style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED_ADMIN, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', opacity: 0.6 }}
      >
        Admin
      </button>
      {showForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await adminLogin(email, password);
              setShowForm(false);
              setEmail(''); setPassword('');
              onAdminLoggedIn();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Login failed.');
            } finally {
              setSubmitting(false);
            }
          }}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8, width: 220,
            background: '#ffffff', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3,
            boxShadow: '0 8px 20px rgba(18,38,43,0.15)', padding: 14, zIndex: 1100,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <input
            type="email" required placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, outline: 'none' }}
          />
          <input
            type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 2, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, outline: 'none' }}
          />
          {error && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: '#B54A2A' }}>{error}</div>}
          <button
            type="submit" disabled={submitting}
            style={{ padding: '8px', background: '#1F6F64', border: 'none', borderRadius: 2, color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 12, cursor: submitting ? 'wait' : 'pointer' }}
          >
            {submitting ? '...' : 'Log in'}
          </button>
        </form>
      )}
    </div>
  );
}

const MUTED_ADMIN = '#8a9a9d';

export default function Nav({ navigate, isLoggedIn, onLogin, onLogout, isAdmin, onAdminLoggedIn, onAdminLogout }: NavProps) {
  const isMobile = useIsMobile(900);
  const [menuOpen, setMenuOpen] = useState(false);

  const goTo = (page: Page) => {
    navigate(page);
    setMenuOpen(false);
  };

  const items = isAdmin ? [...navItems, { page: 'admin' as Page, label: 'Review', icon: '✓' }] : navItems;

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: 'rgba(242, 244, 239, 0.96)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(18, 38, 43, 0.12)',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', height: 56 }}>
        <button
          onClick={() => goTo('home')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <div style={{
            width: 28, height: 28, background: '#1F6F64',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#F2F4EF', fontFamily: 'IBM Plex Mono, monospace',
          }}>◭</div>
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, color: '#12262B', letterSpacing: '0.04em' }}>
            DIP<span style={{ color: '#1F6F64' }}>/</span>Kerala
          </span>
        </button>

        <div style={{ flex: 1 }} />

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {items.map(({ page, label, icon }) => (
              <button
                key={page}
                onClick={() => goTo(page)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                  background: 'none', border: '1px solid transparent', borderRadius: 3,
                  cursor: 'pointer', color: '#4a5e62', fontSize: 12,
                  fontFamily: 'IBM Plex Mono, monospace', fontWeight: 500, letterSpacing: '0.04em',
                  transition: 'color 0.15s, border-color 0.15s', whiteSpace: 'nowrap',
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
        )}

        <div style={{ width: isMobile ? 8 : 14 }} />
        <AdminControl isAdmin={isAdmin} onAdminLoggedIn={onAdminLoggedIn} onAdminLogout={onAdminLogout} />
        <div style={{ width: isMobile ? 8 : 14 }} />
        <AuthControl isLoggedIn={isLoggedIn} onLogin={onLogin} onLogout={onLogout} />

        {isMobile && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            style={{
              marginLeft: 10, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3,
              cursor: 'pointer', color: '#12262B', fontSize: 16,
            }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        )}
      </div>

      {isMobile && menuOpen && (
        <div style={{ background: '#F2F4EF', borderTop: '1px solid rgba(18,38,43,0.1)', padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => goTo(page)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'none', border: 'none', borderRadius: 3, cursor: 'pointer', textAlign: 'left',
                color: '#12262B', fontSize: 13, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.04em',
              }}
            >
              <span style={{ fontSize: 12, width: 16 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}