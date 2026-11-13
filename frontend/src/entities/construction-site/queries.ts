import { useQuery } from '@tanstack/react-query';
import { api, unwrap, readPage, type Tables } from '@/shared/api';
export type ConstructionSite = Tables<'construction_sites'>;
export function useSites(userId: string, page = 0) {
  return useQuery({
    queryKey: [userId, 'sites', page],
    queryFn: async ({ signal }) => {
      return readPage(page, (from, to) =>
        api()
          .from('construction_sites')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to)
          .abortSignal(signal),
      );
    },
  });
}
export function useSite(userId: string, id: string) {
  return useQuery({
    queryKey: [userId, 'site', id],
    queryFn: async ({ signal }) =>
      unwrap(
        await api()
          .from('construction_sites')
          .select('*')
          .eq('id', id)
          .abortSignal(signal)
          .single(),
      ),
  });
}

export const siteKeys = {
  lists: (userId: string) => [userId, 'sites'] as const,
  detail: (userId: string, id: string) => [userId, 'site', id] as const,
};
