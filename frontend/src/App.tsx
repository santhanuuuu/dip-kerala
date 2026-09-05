import { useState, useRef, useEffect } from 'react';
import Nav from './components/Nav';
import HomePage from './pages/HomePage';
import RiskManifestPage from './pages/RiskManifestPage';
import DashboardPage from './pages/DashboardPage';
import AlertsPage from './pages/AlertsPage';
import NewsPage from './pages/NewsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import DamageAssessmentPage from './pages/DamageAssessmentPage';
import SubmitPlacePage from './pages/SubmitPlacePage';
import { loginWithGoogle, logout, isLoggedIn as checkIsLoggedIn } from './lib/api';

export type Page = 'home' | 'manifest' | 'dashboard' | 'alerts' | 'news' | 'analytics' | 'damage' | 'submit';

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
  }, []);

  const refs: Record<Page, React.RefObject<HTMLDivElement | null>> = {
    home: useRef(null),
    manifest: useRef(null),
    dashboard: useRef(null),
    alerts: useRef(null),
    news: useRef(null),
    analytics: useRef(null),
    damage: useRef(null),
    submit: useRef(null),
  };

  const navigate = (page: Page, placeId?: number) => {
    if (placeId !== undefined) setActivePlaceId(placeId);
    const doScroll = () =>
      refs[page].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    placeId !== undefined ? setTimeout(doScroll, 60) : doScroll();
  };

  return (
    <div style={{ background: '#F2F4EF' }}>
      <Nav
        navigate={navigate}
        isLoggedIn={isLoggedIn}
        onLogin={loginWithGoogle}
        onLogout={logout}
      />

      <div ref={refs.home} style={{ scrollMarginTop: 56, paddingTop: 56 }}>
        <HomePage navigate={navigate} />
      </div>

      <SectionDivider label="RISK MANIFEST" />
      <div ref={refs.manifest} style={{ scrollMarginTop: 56 }}>
        <RiskManifestPage placeId={activePlaceId} navigate={navigate} />
      </div>

      <SectionDivider label="GIS DASHBOARD" />
      <div ref={refs.dashboard} style={{ scrollMarginTop: 56 }}>
        <DashboardPage navigate={navigate} />
      </div>

      <SectionDivider label="ACTIVE ALERTS" />
      <div ref={refs.alerts} style={{ scrollMarginTop: 56 }}>
        <AlertsPage navigate={navigate} />
      </div>

      <SectionDivider label="NEWS" />
      <div ref={refs.news} style={{ scrollMarginTop: 56 }}>
        <NewsPage />
      </div>

      <SectionDivider label="ANALYTICS" />
      <div ref={refs.analytics} style={{ scrollMarginTop: 56 }}>
        <AnalyticsPage />
      </div>

      <SectionDivider label="DAMAGE ASSESSMENT" />
      <div ref={refs.damage} style={{ scrollMarginTop: 56 }}>
        <DamageAssessmentPage />
      </div>

      <SectionDivider label="SUBMIT A PLACE" />
      <div ref={refs.submit} style={{ scrollMarginTop: 56 }}>
        <SubmitPlacePage isLoggedIn={isLoggedIn} />
      </div>
    </div>
  );
}