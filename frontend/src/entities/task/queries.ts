import { useQuery } from '@tanstack/react-query';
import { api, unwrap, readPage } from '@/shared/api';
import type { TaskStatus } from './model';
export function useTasks(
  userId: string,
  options: { siteId?: string; mine?: boolean; status?: TaskStatus; page?: number } = {},
) {
  const page = options.page ?? 0;
  return useQuery({
    queryKey: [userId, 'tasks', options],
    queryFn: ({ signal }) =>
      readPage(page, (from, to) => {
        let query = api().from('tasks').select('*', { count: 'exact' });
        if (options.siteId) query = query.eq('site_id', options.siteId);
        if (options.mine) query = query.eq('assignee_id', userId);
        if (options.status) query = query.eq('status', options.status);
        return query
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to)
          .abortSignal(signal);
      }),
  });
}
export function useTask(userId: string, id: string) {
  return useQuery({
    queryKey: [userId, 'task', id],
    queryFn: async ({ signal }) =>
      unwrap(await api().from('tasks').select('*').eq('id', id).abortSignal(signal).single()),
  });
}
export function useTaskHistory(userId: string, taskId: string, page = 0) {
  return useQuery({
    queryKey: [userId, 'history', taskId, page],
    queryFn: async ({ signal }) => {
      return readPage(page, (from, to) =>
        api()
          .from('task_status_events')
          .select('*', { count: 'exact' })
          .eq('task_id', taskId)
          .order('task_version', { ascending: false })
          .range(from, to)
          .abortSignal(signal),
      );
    },
  });
}

export const taskKeys = {
  lists: (userId: string) => [userId, 'tasks'] as const,
  detail: (userId: string, id: string) => [userId, 'task', id] as const,
  history: (userId: string, id: string) => [userId, 'history', id] as const,
};
