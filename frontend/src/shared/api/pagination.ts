import { PAGE_SIZE } from '@/shared/lib';
import { unwrap } from './client';

export type PageResult<T> = { rows: T[]; count: number; page: number };

export async function readPage<T>(
  requestedPage: number,
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    count: number | null;
    error: { code: string; message: string } | null;
  }>,
): Promise<PageResult<T>> {
  let page = Math.max(0, Math.floor(requestedPage));
  for (;;) {
    let result = await read(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (page > 0 && result.error?.code === 'PGRST103') {
      result = await read(0, PAGE_SIZE - 1);
      unwrap(result);
      page = Math.min(page - 1, Math.max(0, Math.ceil((result.count ?? 0) / PAGE_SIZE) - 1));
      if (page > 0) continue;
    }
    const rows = unwrap(result);
    const count = result.count ?? 0;
    const lastPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
    if (page <= lastPage) return { rows, count, page };
    page = lastPage;
  }
}
