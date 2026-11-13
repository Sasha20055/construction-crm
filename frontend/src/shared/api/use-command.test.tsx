import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { useCommand } from './use-command';
it('invalidates affected queries once and leaves the session cache alone', async () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const { result } = renderHook(
    () =>
      useCommand(
        async () => 'saved',
        () => [
          ['u', 'tasks'],
          ['u', 'task', 't'],
          ['u', 'tasks'],
        ],
      ),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await act(async () => {
    await result.current.mutateAsync(undefined);
  });
  expect(invalidate.mock.calls).toEqual([
    [{ queryKey: ['u', 'tasks'] }],
    [{ queryKey: ['u', 'task', 't'] }],
  ]);
  client.clear();
});
it('refreshes conflicts without retrying the failed command', async () => {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const command = vi.fn().mockRejectedValue(new ApiError('40001', 'VERSION_CONFLICT'));
  const { result } = renderHook(() => useCommand(command, () => [['u', 'task', 't']]), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    await expect(result.current.mutateAsync(undefined)).rejects.toMatchObject({ code: '40001' });
  });
  expect(command).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['u', 'task', 't'] });
  client.clear();
});
