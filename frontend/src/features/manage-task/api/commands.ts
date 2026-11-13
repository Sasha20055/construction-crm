import type { Task } from '@/entities/task';
import { api, unwrap } from '@/shared/api';

export type TaskValues = {
  title: string;
  description: string;
  siteId: string;
  assigneeId: string;
};
export async function saveTask(values: TaskValues, task: Task | undefined, requestId: string) {
  return task
    ? unwrap(
        await api().rpc('update_task', {
          p_id: task.id,
          p_expected_version: task.version,
          p_site_id: values.siteId,
          p_title: values.title,
          p_description: values.description,
          p_assignee_id: values.assigneeId,
        }),
      )
    : unwrap(
        await api().rpc('create_task', {
          p_site_id: values.siteId,
          p_title: values.title,
          p_description: values.description,
          p_assignee_id: values.assigneeId,
          p_request_id: requestId,
        }),
      );
}
export async function deleteTask(task: Task) {
  return unwrap(
    await api().rpc('delete_task', { p_id: task.id, p_expected_version: task.version }),
  );
}
