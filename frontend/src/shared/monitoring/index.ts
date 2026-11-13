import { ApiError, supabase } from '@/shared/api';
import { usesHashRouting } from '@/shared/config';

export type ErrorSource = 'render' | 'query' | 'mutation' | 'runtime';
const expectedCodes = new Set([
  '40001',
  '42501',
  'P0002',
  'PGRST116',
  '22023',
  '23514',
  '23502',
  '22P02',
]);
let budget = { minute: 0, count: 0 };
export function errorCode(error: unknown) {
  if (error instanceof ApiError)
    return /^[A-Za-z0-9_]{1,40}$/.test(error.code) ? error.code : 'API_ERROR';
  if (error instanceof TypeError) return 'TYPE_ERROR';
  if (error instanceof Error && error.name === 'ChunkLoadError') return 'CHUNK_LOAD_ERROR';
  return 'UNEXPECTED';
}
export function routeTemplate(path: string) {
  if (/^\/sites\/[^/]+\/?$/.test(path)) return '/sites/:id';
  if (/^\/tasks\/[^/]+\/?$/.test(path)) return '/tasks/:id';
  return ['/sites', '/my-tasks', '/sign-in'].includes(path) ? path : '/unknown';
}
export function reportFailure(error: unknown, source: ErrorSource) {
  if (error instanceof ApiError && expectedCodes.has(error.code)) return;
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'AuthApiError'))
    return;
  const minute = Math.floor(Date.now() / 60000);
  if (budget.minute !== minute) budget = { minute, count: 0 };
  if (budget.count >= 20) return;
  budget.count++;
  const id = crypto.randomUUID();
  const event = {
    id,
    source,
    code: errorCode(error),
    route: routeTemplate(
      usesHashRouting ? window.location.hash.slice(1).split('?')[0] : window.location.pathname,
    ),
    release: __APP_VERSION__,
  };
  console.error('Application failure', event);
  if (supabase)
    void supabase
      .rpc('report_client_error', {
        p_id: id,
        p_source: source,
        p_code: event.code,
        p_route: event.route,
        p_release: event.release,
      })
      .then(
        () => undefined,
        () => undefined,
      );
  return id;
}
export function installErrorReporting() {
  const onError = (event: ErrorEvent) => {
    reportFailure(event.error, 'runtime');
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportFailure(event.reason, 'runtime');
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
