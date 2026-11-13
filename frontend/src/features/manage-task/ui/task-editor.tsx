import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { useSites, type ConstructionSite } from '@/entities/construction-site';
import { useViewer } from '@/entities/session';
import type { Task } from '@/entities/task';
import { errorMessage } from '@/shared/api';
import {
  Button,
  Dialog,
  ErrorNotice,
  Field,
  useDialogBusy,
  Input,
  Loading,
  Pagination,
} from '@/shared/ui';
import { ExecutorPicker } from './executor-picker';
import { useTaskEditor, useDeleteTask } from '../model/use-task-editor';
export function TaskEditor({
  task,
  site,
  onSaved,
}: {
  task?: Task;
  site: ConstructionSite;
  onSaved: () => void;
}) {
  const viewer = useViewer();
  const { form, mutation, conflicted, reload } = useTaskEditor(task, site);
  useDialogBusy(mutation.isPending);
  const [sitePage, setSitePage] = useState(0);
  const [selectedSite, setSelectedSite] = useState(site);
  const sites = useSites(viewer.id, sitePage);
  if (sites.isPending) return <Loading />;
  if (sites.error)
    return (
      <ErrorNotice
        message={errorMessage(sites.error)}
        retry={() => {
          void sites.refetch();
        }}
      />
    );
  const options = [
    ...new Map([selectedSite, site, ...sites.data.rows].map((s) => [s.id, s])).values(),
  ];
  return (
    <form
      className="form-stack"
      noValidate
      onSubmit={form.handleSubmit((values) => mutation.mutate(values, { onSuccess: onSaved }))}
    >
      <Field
        label="Название задачи"
        htmlFor="task-title"
        error={form.formState.errors.title?.message}
      >
        <Input
          autoFocus
          id="task-title"
          maxLength={200}
          placeholder="Что нужно сделать?"
          {...form.register('title')}
        />
      </Field>
      <Field
        label="Описание"
        htmlFor="task-description"
        error={form.formState.errors.description?.message}
      >
        <textarea
          id="task-description"
          className="input textarea"
          maxLength={10000}
          placeholder="Детали и ожидаемый результат"
          {...form.register('description')}
        />
      </Field>
      <Field label="Объект" htmlFor="task-site" error={form.formState.errors.siteId?.message}>
        <select
          id="task-site"
          className="input"
          {...form.register('siteId', {
            onChange: (event: { target: { value: string } }) => {
              const next = options.find((option) => option.id === event.target.value);
              if (next) setSelectedSite(next);
            },
          })}
        >
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Pagination page={sites.data.page} count={sites.data.count} onChange={setSitePage} />
      <Controller
        control={form.control}
        name="assigneeId"
        render={({ field, fieldState }) => (
          <ExecutorPicker
            {...field}
            error={fieldState.error?.message}
            disabled={mutation.isPending}
          />
        )}
      />
      {conflicted && (
        <div role="alert">
          <p>
            Задача изменена другим пользователем. Загрузка актуальных данных заменит несохранённые
            изменения.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reload();
            }}
          >
            Загрузить актуальные данные
          </Button>
        </div>
      )}
      {mutation.error && !conflicted && <ErrorNotice message={errorMessage(mutation.error)} />}
      <div className="form-actions">
        <Button variant="secondary" type="button" disabled={mutation.isPending} onClick={onSaved}>
          Отмена
        </Button>
        <Button type="submit" busy={mutation.isPending} disabled={conflicted}>
          {task ? 'Сохранить изменения' : 'Создать задачу'}
        </Button>
      </div>
    </form>
  );
}
export function DeleteTaskDialog({
  task,
  open,
  onOpenChange,
  onDeleted,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteTask(task);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={mutation.isPending}
      title="Удалить задачу?"
      description={`Задача «${task.title}» станет недоступна. История сохранится в базе.`}
    >
      {mutation.error && <ErrorNotice message={errorMessage(mutation.error)} />}
      <div className="form-actions">
        <Button
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => onOpenChange(false)}
        >
          Отмена
        </Button>
        <Button
          variant="danger"
          busy={mutation.isPending}
          onClick={() => mutation.mutate(undefined, { onSuccess: onDeleted })}
        >
          Удалить задачу
        </Button>
      </div>
    </Dialog>
  );
}
