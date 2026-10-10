import { lazy, Suspense } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { I18nProvider } from '@/context/I18nContext';
import { FullPageLoader } from '@/components/ui/Loading';
import { LandingPage } from '@/pages/LandingPage';
import { AppLayout } from '@/components/layouts/AppLayout';
import { AuthLayout } from '@/components/layouts/AuthLayout';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const NewProjectPage = lazy(() => import('@/pages/NewProjectPage').then(m => ({ default: m.NewProjectPage })));
const ProjectWorkspacePage = lazy(() => import('@/pages/workspace/ProjectWorkspacePage').then(m => ({ default: m.ProjectWorkspacePage })));
const AssistantPage = lazy(() => import('@/pages/AssistantPage'));
const MarketplacePage = lazy(() => import('@/pages/MarketplacePage'));
const PricingPage = lazy(() => import('@/pages/PricingPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const LegalPage = lazy(() => import('@/pages/legal/LegalPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route
        path="/auth/login"
        element={
          <PublicOnlyRoute>
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/auth/register"
        element={
          <PublicOnlyRoute>
            <AuthLayout>
              <RegisterPage />
            </AuthLayout>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/auth/forgot-password"
        element={
          <PublicOnlyRoute>
            <AuthLayout>
              <ForgotPasswordPage />
            </AuthLayout>
          </PublicOnlyRoute>
        }
      />
      {/* Pas de PublicOnlyRoute : le lien email ouvre une session de récupération. */}
      <Route
        path="/auth/reset-password"
        element={
          <AuthLayout>
            <ResetPasswordPage />
          </AuthLayout>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout>
              <DashboardPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProjectsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute>
            <AppLayout>
              <NewProjectPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProjectWorkspacePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assistant"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AssistantPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/marketplace"
        element={
          <ProtectedRoute>
            <AppLayout>
              <MarketplacePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SettingsPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense fallback={<FullPageLoader />}>
              <AppRoutes />
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
