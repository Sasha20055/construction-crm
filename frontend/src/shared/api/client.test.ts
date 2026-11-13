import { describe, expect, it } from 'vitest';
import { ApiError, errorMessage, unwrap } from './client';
describe('API error contract', () => {
  it('maps conflicts and permissions without leaking database messages', () => {
    expect(errorMessage(new ApiError('40001', 'VERSION_CONFLICT'))).toContain(
      'Данные уже изменились',
    );
    expect(errorMessage(new ApiError('42501', 'sensitive SQL'))).toBe(
      'У вас нет прав на это действие.',
    );
    expect(errorMessage(new ApiError('P0002', 'foreign UUID'))).toContain('нет к ней доступа');
    expect(errorMessage(new Error('secret internal detail'))).not.toContain('secret');
  });
  it('unwraps successful results and preserves typed errors', () => {
    expect(unwrap({ data: { id: 1 }, error: null })).toEqual({ id: 1 });
    expect(() => unwrap({ data: null, error: null })).toThrow(ApiError);
    expect(() => unwrap({ data: null, error: { code: '42501', message: 'denied' } })).toThrow(
      ApiError,
    );
  });
});
