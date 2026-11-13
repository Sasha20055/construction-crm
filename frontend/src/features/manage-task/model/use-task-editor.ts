import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { siteKeys, type ConstructionSite } from '@/entities/construction-site';
import { useViewer } from '@/entities/session';
import { taskKeys, type Task } from '@/entities/task';
import { ApiError, useCommand } from '@/shared/api';
import { useRequestId } from '@/shared/lib';
import { saveTask, deleteTask, type TaskValues } from '../api/commands';

const schema = z.object({
  title: z.string().trim().min(1, 'Введите название').max(200, 'Не более 200 символов'),
  description: z.string().max(10000, 'Не более 10000 символов'),
  siteId: z.uuid('Выберите объект'),
  assigneeId: z.uuid('Выберите исполнителя'),
});
const defaults = (task: Task | undefined, site: ConstructionSite): TaskValues => ({
  title: task?.title ?? '',
  description: task?.description ?? '',
  siteId: task?.site_id ?? site.id,
  assigneeId: task?.assignee_id ?? '',
});
export function useTaskEditor(task: Task | undefined, site: ConstructionSite) {
  const viewer = useViewer();
  const [base, setBase] = useState(task);
  const requestId = useRequestId();
  const form = useForm<TaskValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(base, site),
  });
  const mutation = useCommand(
    (values: TaskValues) => saveTask(values, base, requestId(values)),
    (result) => [
      taskKeys.lists(viewer.id),
      siteKeys.lists(viewer.id),
      ...(base ? [taskKeys.detail(viewer.id, base.id), taskKeys.history(viewer.id, base.id)] : []),
      ...(result ? [taskKeys.detail(viewer.id, result.id)] : []),
    ],
  );
  const conflicted =
    Boolean(base && task && base.version !== task.version) ||
    (mutation.error instanceof ApiError && mutation.error.code === '40001');
  const reload = () => {
    setBase(task);
    form.reset(defaults(task, site));
    mutation.reset();
  };
  return { form, mutation, conflicted, reload, base };
}
export function useDeleteTask(task: Task) {
  const viewer = useViewer();
  return useCommand(
    () => deleteTask(task),
    () => [
      taskKeys.lists(viewer.id),
      taskKeys.detail(viewer.id, task.id),
      taskKeys.history(viewer.id, task.id),
      siteKeys.lists(viewer.id),
    ],
  );
}
