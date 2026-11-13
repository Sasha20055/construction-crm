import { expect, it, vi } from 'vitest';
import { readPage } from './pagination';
it('recovers a page after count shrinks, including PostgREST range errors', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      data: null,
      count: null,
      error: { code: 'PGRST103', message: 'Range' },
    })
    .mockResolvedValueOnce({ data: ['first'], count: 21, error: null })
    .mockResolvedValueOnce({ data: ['last'], count: 21, error: null });
  expect(await readPage(4, read)).toEqual({ rows: ['last'], count: 21, page: 1 });
  expect(read.mock.calls).toEqual([
    [80, 99],
    [0, 19],
    [20, 39],
  ]);
});
it('returns page zero when the last page disappears or all records are removed', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: [], count: 20, error: null })
    .mockResolvedValueOnce({ data: ['first'], count: 20, error: null });
  expect(await readPage(1, read)).toEqual({ rows: ['first'], count: 20, page: 0 });
  expect(await readPage(0, () => Promise.resolve({ data: [], count: 0, error: null }))).toEqual({
    rows: [],
    count: 0,
    page: 0,
  });
});
it('preserves errors instead of treating failures as empty lists', async () => {
  await expect(
    readPage(1, () =>
      Promise.resolve({ data: null, count: null, error: { code: '42501', message: 'Denied' } }),
    ),
  ).rejects.toMatchObject({ code: '42501' });
});
