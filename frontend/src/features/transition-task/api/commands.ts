import type { Task, TaskStatus } from '@/entities/task';
import { api, unwrap } from '@/shared/api';

export async function transitionTask(task: Task, status: TaskStatus, comment?: string) {
  return unwrap(
    await api().rpc('transition_task', {
      p_id: task.id,
      p_expected_version: task.version,
      p_target_status: status,
      p_comment: comment,
    }),
  );
}
