import { useState, useRef, useEffect } from 'react';
import { type Page } from '../App';
import { getCurrentUser, adminLogin } from '../lib/api';
import useIsMobile from '../hooks/useIsMobile';
import Logo from './Logo';

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
  { page: 'dams', label: 'Dams', icon: '≈' },
  { page: 'shelters', label: 'Shelters', icon: '⛨' },
  { page: 'incidents', label: 'Reports', icon: '✎' },
  { page: 'analytics', label: 'Analytics', icon: '▣' },
  { page: 'news', label: 'News', icon: '▤' },
  { page: 'damage', label: 'Damage', icon: '◉' },
  { page: 'submit', label: 'Submit Place', icon: '+' },
];

const MUTED_ADMIN = '#8a9a9d';
const SIDEBAR_WIDTH = 240;

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/** Unchanged from the previous top-bar version -- just relocated into the sidebar footer. */
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
          width: '100%', padding: '8px 14px', background: '#1F6F64', border: 'none', borderRadius: 3,
          cursor: 'pointer', color: '#F2F4EF', fontSize: 12,
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, letterSpacing: '0.04em',
        }}
      >Sign in</button>
    );
  }

  const user = getCurrentUser();

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt=""
            referrerPolicy="no-referrer"
            style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: 26, height: 26, borderRadius: '50%', background: '#1F6F64', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#F2F4EF', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600,
          }}>{user ? initials(user.name, user.email) : ''}</div>
        )}
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#4a5e62', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.name || user?.email}
        </span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: '100%',
          background: '#ffffff', border: '1px solid rgba(18,38,43,0.12)', borderRadius: 3,
          boxShadow: '0 8px 20px rgba(18,38,43,0.12)', overflow: 'hidden', zIndex: 1100,
        }}>
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

/** Unchanged logic from the previous version -- deliberately unobtrusive, never shows or
 * fills in the actual admin credentials anywhere in the UI. */
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
        style={{ width: '100%', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED_ADMIN, background: 'none', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 3, padding: '6px 8px', cursor: 'pointer', letterSpacing: '0.04em', textAlign: 'left' }}
      >
        Admin · sign out
      </button>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        onClick={() => setShowForm((s) => !s)}
        style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: MUTED_ADMIN, background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', opacity: 0.6, padding: 0 }}
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
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, width: 220,
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

/** Claude-style auto-hide sidebar: collapsed to a thin edge strip at rest, expands on hover
 * (desktop) with a smooth fade+slide, so the header stops competing for attention with the
 * page content underneath it. On mobile (no hover), a small persistent toggle button opens/
 * closes the same panel as a tap target instead. */
export default function Nav({ navigate, isLoggedIn, onLogin, onLogout, isAdmin, onAdminLoggedIn, onAdminLogout }: NavProps) {
  const isMobile = useIsMobile(900);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const expanded = isMobile ? mobileOpen : hovered;

  const goTo = (page: Page) => {
    navigate(page);
    setMobileOpen(false);
  };

  const items = isAdmin ? [...navItems, { page: 'admin' as Page, label: 'Review', icon: '✓' }] : navItems;

  return (
    <>
      {/* Thin always-present edge strip -- the hover target on desktop, and a visible
          affordance so it's discoverable rather than truly invisible. */}
      {!isMobile && (
        <div
          onMouseEnter={() => setHovered(true)}
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0, width: 10, zIndex: 999,
            cursor: 'pointer',
          }}
        >
          <div style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
            background: 'linear-gradient(180deg, rgba(31,111,100,0.35), rgba(31,111,100,0.1))',
            opacity: expanded ? 0 : 1, transition: 'opacity 0.3s ease',
          }} />
        </div>
      )}

      {/* Mobile toggle -- hover doesn't exist on touch, so this is a persistent tap target. */}
      {isMobile && (
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Menu"
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 1001,
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#ffffff', border: '1px solid rgba(18,38,43,0.15)', borderRadius: 6,
            boxShadow: '0 2px 8px rgba(18,38,43,0.1)', cursor: 'pointer', color: '#12262B', fontSize: 16,
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      )}

      {/* The expanding panel itself -- overlays content, never pushes it (position: fixed,
          not part of layout flow), so no page needs top/left padding to compensate for it. */}
      <div
        onMouseEnter={() => !isMobile && setHovered(true)}
        onMouseLeave={() => !isMobile && setHovered(false)}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 1000,
          width: SIDEBAR_WIDTH,
          background: 'rgba(242, 244, 239, 0.98)', backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(18, 38, 43, 0.12)',
          boxShadow: expanded ? '4px 0 24px rgba(18,38,43,0.12)' : 'none',
          display: 'flex', flexDirection: 'column',
          padding: '20px 16px',
          opacity: expanded ? 1 : 0,
          transform: expanded ? 'translateX(0)' : 'translateX(-16px)',
          pointerEvents: expanded ? 'auto' : 'none',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
        }}
      >
        <button
          onClick={() => goTo('home')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 24 }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
            <Logo size={28} />
          </div>
          <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 15, color: '#12262B', letterSpacing: '0.04em' }}>
            DIP<span style={{ color: '#1F6F64' }}>/</span>Kerala
          </span>
        </button>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map(({ page, label, icon }) => (
            <button
              key={page}
              onClick={() => goTo(page)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                background: 'none', border: '1px solid transparent', borderRadius: 4,
                cursor: 'pointer', color: '#4a5e62', fontSize: 13, textAlign: 'left',
                fontFamily: 'IBM Plex Mono, monospace', fontWeight: 500, letterSpacing: '0.02em',
                transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#12262B';
                (e.currentTarget as HTMLElement).style.background = 'rgba(18,38,43,0.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = '#4a5e62';
                (e.currentTarget as HTMLElement).style.background = 'none';
              }}
            >
              <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16, borderTop: '1px solid rgba(18,38,43,0.1)' }}>
          <AdminControl isAdmin={isAdmin} onAdminLoggedIn={onAdminLoggedIn} onAdminLogout={onAdminLogout} />
          <AuthControl isLoggedIn={isLoggedIn} onLogin={onLogin} onLogout={onLogout} />
        </div>
      </div>
    </>
  );
}