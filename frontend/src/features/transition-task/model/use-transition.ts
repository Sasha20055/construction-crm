import { useState } from 'react';
import { siteKeys } from '@/entities/construction-site';
import { useViewer } from '@/entities/session';
import { taskKeys, type Task, type TaskAction } from '@/entities/task';
import { useCommand } from '@/shared/api';
import { transitionTask } from '../api/commands';

export function useTransition(task: Task) {
  const viewer = useViewer();
  const [base, setBase] = useState(task);
  const mutation = useCommand(
    ({ action, comment, current }: { action: TaskAction; comment?: string; current?: Task }) =>
      transitionTask(current ?? base, action.target, comment),
    () => [
      taskKeys.lists(viewer.id),
      taskKeys.detail(viewer.id, task.id),
      taskKeys.history(viewer.id, task.id),
      siteKeys.lists(viewer.id),
    ],
  );
  return {
    mutation,
    begin: () => {
      setBase(task);
      mutation.reset();
    },
  };
}
