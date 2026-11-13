import { lazy, Suspense, Component, type ReactNode } from 'react';
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Building2, ClipboardList, Layers3, ShieldCheck } from 'lucide-react';
import { SessionProvider, useSession } from '@/entities/session';
import { SignOutButton } from '@/features/auth';
const SignInPage = lazy(() =>
  import('@/pages/sign-in').then((module) => ({ default: module.SignInPage })),
);
const SitesPage = lazy(() =>
  import('@/pages/sites').then((module) => ({ default: module.SitesPage })),
);
const SiteDetailsPage = lazy(() =>
  import('@/pages/site-details').then((module) => ({ default: module.SiteDetailsPage })),
);
const TaskDetailsPage = lazy(() =>
  import('@/pages/task-details').then((module) => ({ default: module.TaskDetailsPage })),
);
const MyTasksPage = lazy(() =>
  import('@/pages/my-tasks').then((module) => ({ default: module.MyTasksPage })),
);
import { reportFailure } from '@/shared/monitoring';
import { errorMessage } from '@/shared/api';
import { Button, ErrorNotice, Loading } from '@/shared/ui';
import './styles.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      reportFailure(error, 'query');
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      reportFailure(error, 'mutation');
    },
  }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 }, mutations: { retry: false } },
});
function ProtectedLayout() {
  const state = useSession();
  const location = useLocation();
  if (state.loading) return <Loading />;
  if (!state.session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (state.error || !state.profile)
    return (
      <div className="session-error">
        <h1>Не удалось загрузить профиль</h1>
        <p>Проверьте, что администратор назначил вам роль.</p>
        <ErrorNotice message={errorMessage(state.error)} retry={state.retry} />
        <SignOutButton />
      </div>
    );
  const profile = state.profile;
  return (
    <div className="app-shell" key={profile.id}>
      <aside className="sidebar">
        <NavLink to="/sites" className="brand">
          <span className="brand-symbol">
            <Building2 size={23} />
          </span>
          <span>
            стройконтроль<span className="brand-dot">.</span>
          </span>
        </NavLink>
        <div className="workspace">
          <span className="workspace-avatar">С</span>
          <div>
            <strong>Строительная компания</strong>
            <small>Рабочее пространство</small>
          </div>
        </div>
        <p className="nav-label">РАБОТА</p>
        <nav aria-label="Основная навигация">
          <NavLink
            to="/sites"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            <Layers3 size={19} />
            Объекты
          </NavLink>
          {profile.role === 'executor' && (
            <NavLink
              to="/my-tasks"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              <ClipboardList size={19} />
              Мои задачи
            </NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="access-note">
            <ShieldCheck size={18} />
            <span>
              Каждая задача —<br />
              под вашим контролем
            </span>
          </div>
          <div className="user-block">
            <span className="user-avatar">{profile.display_name.slice(0, 1)}</span>
            <div>
              <strong>{profile.display_name}</strong>
              <small>{profile.role === 'manager' ? 'Постановщик' : 'Исполнитель'}</small>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Рабочее пространство <span className="breadcrumb-separator">/</span>{' '}
            <strong>
              {location.pathname.startsWith('/tasks')
                ? 'Задачи'
                : location.pathname === '/my-tasks'
                  ? 'Мои задачи'
                  : 'Объекты'}
            </strong>
          </span>
          <span className="private-label">
            <span />
            Закрытая система
          </span>
        </header>
        <main className="main-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>СТРОЙКОНТРОЛЬ</span>
          <span>От задачи к результату.</span>
        </footer>
      </div>
    </div>
  );
}
function EntryPage() {
  const state = useSession();
  const location = useLocation();
  if (!state.initialized) return <Loading />;
  if (state.session) {
    const from = (location.state as { from?: string } | null)?.from;
    const safeFrom = from && /^\/(sites(?:\/|$)|tasks\/|my-tasks$)/.test(from) ? from : '/sites';
    return <Navigate to={safeFrom} replace />;
  }
  return <SignInPage />;
}
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    reportFailure(error, 'render');
  }
  render() {
    return this.state.failed ? (
      <div className="session-error">
        <h1>Не удалось открыть страницу</h1>
        <p>Попробуйте перезагрузить приложение.</p>
        <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function Application() {
  return (
    <Suspense fallback={<Loading />}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/sign-in" element={<EntryPage />} />
                <Route element={<ProtectedLayout />}>
                  <Route index element={<Navigate to="/sites" replace />} />
                  <Route path="/sites" element={<SitesPage />} />
                  <Route path="/sites/:id" element={<SiteDetailsPage />} />
                  <Route path="/tasks/:id" element={<TaskDetailsPage />} />
                  <Route path="/my-tasks" element={<MyTasksPage />} />
                  <Route
                    path="*"
                    element={
                      <div className="empty-state">
                        <h1>Страница не найдена</h1>
                        <NavLink to="/sites" className="button button-primary">
                          К объектам
                        </NavLink>
                      </div>
                    }
                  />
                </Route>
              </Routes>
            </BrowserRouter>
          </SessionProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </Suspense>
  );
}
