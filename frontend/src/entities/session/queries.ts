import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, readPage, unwrap } from '@/shared/api';
import { useViewer } from './context';

export function useProfiles(ids: readonly string[]) {
  const viewer = useViewer();
  const uniqueIds = [...new Set(ids.filter(Boolean))].sort();
  return useQuery({
    queryKey: [viewer.id, 'profiles', uniqueIds],
    enabled: uniqueIds.length > 0,
    queryFn: async ({ signal }) => {
      const batches = [];
      for (let start = 0; start < uniqueIds.length; start += 100)
        batches.push(
          api()
            .from('profiles')
            .select('*')
            .in('id', uniqueIds.slice(start, start + 100))
            .abortSignal(signal),
        );
      return (await Promise.all(batches)).flatMap(unwrap);
    },
  });
}

export function useExecutors(search: string, page: number) {
  const viewer = useViewer();
  const term = search.trim().slice(0, 200);
  return useQuery({
    queryKey: [viewer.id, 'executors', term, page],
    enabled: viewer.role === 'manager',
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      readPage(page, (from, to) => {
        let query = api().from('profiles').select('*', { count: 'exact' }).eq('role', 'executor');
        if (term) query = query.ilike('display_name', `%${term.replace(/[\\%_]/g, '\\$&')}%`);
        return query.order('display_name').order('id').range(from, to).abortSignal(signal);
      }),
  });
}
