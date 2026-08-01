import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import MaintenanceGate from './components/MaintenanceGate';
import LandingPage from './pages/LandingPage';

/**
 * ROUTE SPLITTING
 *
 * Everything below was previously a static import, so a first-time visitor who
 * landed on "/" and never signed in still downloaded the admin panel, the bulk
 * importer, ManageJobs, and the xlsx library before anything rendered.
 *
 * These are lazy. LandingPage deliberately is NOT — it is the first paint for
 * every signed-out visitor, and making it a separate chunk would add a second
 * network round trip to exactly the page whose speed matters most.
 *
 * ProtectedRoute, Layout and MaintenanceGate stay static too: they are small,
 * they wrap the lazy routes, and splitting a wrapper only adds a waterfall.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const JobDetails = lazy(() => import('./pages/JobDetails'));
const Cart = lazy(() => import('./pages/Cart'));
const Profile = lazy(() => import('./pages/Profile'));
const Subscription = lazy(() => import('./pages/Subscription'));
const ManageJobs = lazy(() => import('./pages/ManageJobs'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Admin = lazy(() => import('./pages/Admin'));

/**
 * Was: a spinner until Firebase Auth resolved, then either the landing page or
 * a redirect.
 *
 * The problem with that: the landing page is PUBLIC, and it was sitting behind
 * auth resolution. On a cold load nothing rendered until the Firebase bundle
 * had downloaded and onAuthStateChanged had fired — and only then did the
 * landing settings fetch begin, and only after THAT did the browser learn the
 * hero image URL. Four sequential stages before the first byte of the image
 * was requested.
 *
 * Now the landing page renders immediately and the redirect happens once auth
 * resolves. Signed-out visitors — everyone the landing page is for — see it at
 * first paint.
 *
 * The trade: a signed-in user hitting "/" sees the landing page for a moment
 * before being bounced. That is mitigated below by checking for a persisted
 * Firebase session synchronously, so returning users still get the spinner and
 * never see the flash.
 */

/**
 * Does Firebase hold a persisted session in this browser?
 *
 * Firebase writes its auth state under a localStorage key of the form
 * `firebase:authUser:<apiKey>:[DEFAULT]`. Reading it directly is a heuristic,
 * not an API — it tells us whether onAuthStateChanged is LIKELY to produce a
 * user, so we can decide whether to hold the render for a moment.
 *
 * If Firebase ever changes that key the check simply returns false, and the
 * behaviour degrades to "render the landing page immediately", which is the
 * safe direction: a brief flash for a logged-in user, never a blank page.
 */
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.indexOf('firebase:authUser:') === 0) return true;
    }
  } catch {
    /* storage unavailable — treat as signed out */
  }
  return false;
}

const LIKELY_SIGNED_IN = hasStoredSession();

/**
 * Shown while a route chunk downloads. Deliberately just the page background,
 * matching the hold state in PublicHome — a spinner that appears for 80ms reads
 * as a glitch, an empty surface of the right colour reads as nothing at all.
 */
function RouteFallback() {
  return <div className="min-h-screen bg-[#f5f5f7]" />;
}

function PublicHome() {
  const { user, loading } = useAuth();

  // Hold ONLY when a session probably exists. A signed-out visitor never waits.
  if (loading && LIKELY_SIGNED_IN) {
    return <div className="min-h-screen bg-[#f5f5f7]" />;
  }

  if (user) {
    const dest = user.role === 'user' ? '/dashboard' : '/manage-jobs';
    return <Navigate to={dest} replace />;
  }

  return <LandingPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public landing — always accessible, even during maintenance */}
            <Route path="/" element={<PublicHome />} />

            {/* Everything authenticated is behind the maintenance gate */}
            <Route path="/subscribe" element={<ProtectedRoute><MaintenanceGate><Subscription /></MaintenanceGate></ProtectedRoute>} />

            <Route element={<ProtectedRoute><MaintenanceGate><Layout /></MaintenanceGate></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/job/:id" element={<JobDetails />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/manage-jobs" element={<ProtectedRoute allowedRoles={['superadmin', 'manager']}><ManageJobs /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute allowedRoles={['superadmin', 'manager']}><Analytics /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute allowedRoles={['superadmin']}><Admin /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}