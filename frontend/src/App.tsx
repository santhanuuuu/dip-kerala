import { useState, useRef, useEffect } from 'react';
import Nav from './components/Nav';
import HomePage from './pages/HomePage';
import RiskManifestPage from './pages/RiskManifestPage';
import DashboardPage from './pages/DashboardPage';
import AlertsPage from './pages/AlertsPage';
import DamsPage from './pages/DamsPage';
import SheltersPage from './pages/SheltersPage';
import IncidentsPage from './pages/IncidentsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import NewsPage from './pages/NewsPage';
import DamageAssessmentPage from './pages/DamageAssessmentPage';
import SubmitPlacePage from './pages/SubmitPlacePage';
import AdminReviewPage from './pages/AdminReviewPage';
import { loginWithGoogle, logout, isLoggedIn as checkIsLoggedIn, isAdmin as checkIsAdmin, adminLogout, fetchNews } from './lib/api';

// NOTE: 'subscribe'/SubscribePage (SMS/WhatsApp alert signup) was wired in as a stub but never
// actually built -- removed from here rather than shipping a fake page. That's a real,
// separate feature (needs an SMS gateway like Twilio/MSG91) -- say the word if you want it
// built and it can be added back properly, wired the same way as everything else here.
export type Page = 'home' | 'manifest' | 'dashboard' | 'alerts' | 'dams' | 'shelters' | 'incidents' | 'analytics' | 'news' | 'damage' | 'submit' | 'admin';

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{
      borderTop: '1px solid rgba(18, 38, 43, 0.1)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      background: '#F2F4EF',
    }}>
      <span style={{
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 9,
        color: 'rgba(18, 38, 43, 0.35)',
        letterSpacing: '0.14em',
        padding: '6px 0',
      }}>
        ▸ {label}
      </span>
    </div>
  );
}

export default function App() {
  const [activePlaceId, setActivePlaceId] = useState<number>(1);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Handles the backend's OAuth redirect (/auth/callback?token=...) without needing a
  // full router -- this app is a single page, so we just check the path/query on mount,
  // store the real JWT, and clean the URL back to "/".
  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) localStorage.setItem('dip_jwt', token);
      window.history.replaceState({}, '', '/');
    }
    setIsLoggedIn(checkIsLoggedIn());
    setIsAdmin(checkIsAdmin());

    // Fire on every app load (not just when the News tab is opened) so a visit is what
    // checks for fresh news, rather than only the hourly scheduled job. The backend's
    // GET /api/news itself decides whether the cache is actually stale enough to refresh
    // (see routers/news.py's STALE_AFTER_MINUTES) -- this call is cheap even when nothing
    // ends up refreshing, and we don't need its result here since NewsPage fetches its own
    // copy when visited.
    fetchNews().catch(() => {});
  }, []);

  const refs: Record<Page, React.RefObject<HTMLDivElement | null>> = {
    home: useRef(null),
    manifest: useRef(null),
    dashboard: useRef(null),
    alerts: useRef(null),
    dams: useRef(null),
    shelters: useRef(null),
    incidents: useRef(null),
    analytics: useRef(null),
    news: useRef(null),
    damage: useRef(null),
    submit: useRef(null),
    admin: useRef(null),
  };

  const navigate = (page: Page, placeId?: number) => {
    if (placeId !== undefined) setActivePlaceId(placeId);
    const doScroll = () =>
      refs[page].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    placeId !== undefined ? setTimeout(doScroll, 60) : doScroll();
  };

  const handleAdminLogout = () => {
    adminLogout();
    setIsAdmin(false);
  };

  return (
    <div style={{ background: '#F2F4EF' }}>
      <Nav
        navigate={navigate}
        isLoggedIn={isLoggedIn}
        onLogin={loginWithGoogle}
        onLogout={logout}
        isAdmin={isAdmin}
        onAdminLoggedIn={() => { setIsAdmin(true); navigate('admin'); }}
        onAdminLogout={handleAdminLogout}
      />

      {/* No top padding/offset needed anymore -- the sidebar is a fixed overlay that never
          takes up layout space, unlike the old fixed top bar which pushed content down by
          its height (56px). scrollMarginTop is kept small just so an anchor-scrolled-to
          section doesn't land flush against the very top edge of the viewport. */}
      <div ref={refs.home} style={{ scrollMarginTop: 16 }}>
        <HomePage navigate={navigate} />
      </div>

      <SectionDivider label="RISK MANIFEST" />
      <div ref={refs.manifest} style={{ scrollMarginTop: 16 }}>
        <RiskManifestPage placeId={activePlaceId} navigate={navigate} />
      </div>

      <SectionDivider label="GIS DASHBOARD" />
      <div ref={refs.dashboard} style={{ scrollMarginTop: 16 }}>
        <DashboardPage navigate={navigate} />
      </div>

      <SectionDivider label="ACTIVE ALERTS" />
      <div ref={refs.alerts} style={{ scrollMarginTop: 16 }}>
        <AlertsPage navigate={navigate} />
      </div>

      <SectionDivider label="DAM WATER LEVELS" />
      <div ref={refs.dams} style={{ scrollMarginTop: 16 }}>
        <DamsPage />
      </div>

      <SectionDivider label="SHELTERS" />
      <div ref={refs.shelters} style={{ scrollMarginTop: 16 }}>
        <SheltersPage />
      </div>

      <SectionDivider label="COMMUNITY REPORTS" />
      <div ref={refs.incidents} style={{ scrollMarginTop: 16 }}>
        <IncidentsPage />
      </div>

      <SectionDivider label="ANALYTICS" />
      <div ref={refs.analytics} style={{ scrollMarginTop: 16 }}>
        <AnalyticsPage />
      </div>

      <SectionDivider label="NEWS" />
      <div ref={refs.news} style={{ scrollMarginTop: 16 }}>
        <NewsPage />
      </div>

      <SectionDivider label="DAMAGE ASSESSMENT" />
      <div ref={refs.damage} style={{ scrollMarginTop: 16 }}>
        <DamageAssessmentPage />
      </div>

      <SectionDivider label="SUBMIT A PLACE" />
      <div ref={refs.submit} style={{ scrollMarginTop: 16 }}>
        <SubmitPlacePage isLoggedIn={isLoggedIn} />
      </div>

      {/* Only rendered at all when actually admin-authenticated -- not just hidden via CSS,
          so the review functionality and its data never load into a regular visitor's session. */}
      {isAdmin && (
        <>
          <SectionDivider label="ADMIN — REVIEW SUBMISSIONS" />
          <div ref={refs.admin} style={{ scrollMarginTop: 16 }}>
            <AdminReviewPage />
          </div>
        </>
      )}
    </div>
  );
}