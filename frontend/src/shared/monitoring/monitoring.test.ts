import { expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { errorCode, reportFailure, routeTemplate } from './index';
it('reduces error payloads and routes to safe codes and templates', () => {
  const sensitive = 'password=secret and client description';
  expect(errorCode(new Error(sensitive))).toBe('UNEXPECTED');
  expect(errorCode(new ApiError(sensitive, sensitive))).toBe('API_ERROR');
  expect(routeTemplate('/tasks/customer-secret?token=secret')).toBe('/tasks/:id');
  expect(routeTemplate('/unknown?token=secret')).toBe('/unknown');
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  reportFailure(new Error(sensitive), 'render');
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  expect(log).toHaveBeenCalledWith(
    'Application failure',
    expect.objectContaining({ code: 'UNEXPECTED', source: 'render' }),
  );
  log.mockRestore();
});
it('does not report expected domain conflicts', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  reportFailure(new ApiError('40001', 'VERSION_CONFLICT'), 'mutation');
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
