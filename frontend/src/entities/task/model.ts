import type { Database, Tables } from '@/shared/api';
export type Task = Tables<'tasks'>;
export type TaskStatus = Database['public']['Enums']['task_status'];
export const statusLabels: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  in_review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};
export type TaskAction = { target: TaskStatus; label: string; commentRequired?: boolean };
export function availableActions(
  task: Pick<Task, 'status' | 'assignee_id' | 'deleted_at'>,
  viewer: Pick<Tables<'profiles'>, 'id' | 'role'>,
): TaskAction[] {
  if (task.deleted_at) return [];
  if (viewer.role === 'manager')
    return task.status === 'in_review'
      ? [
          { target: 'accepted', label: 'Принять задачу' },
          { target: 'rework', label: 'Вернуть на доработку', commentRequired: true },
        ]
      : [];
  if (task.assignee_id !== viewer.id) return [];
  if (task.status === 'new' || task.status === 'rework')
    return [{ target: 'in_progress', label: 'Взять в работу' }];
  if (task.status === 'in_progress')
    return [{ target: 'in_review', label: 'Отправить на проверку' }];
  return [];
}
