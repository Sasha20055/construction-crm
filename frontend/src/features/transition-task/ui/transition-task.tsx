import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Check, ArrowUpRight, RotateCcw } from 'lucide-react';
import { useViewer } from '@/entities/session';
import { availableActions, type Task } from '@/entities/task';
import { errorMessage } from '@/shared/api';
import { Button, Dialog, ErrorNotice, Field } from '@/shared/ui';
import { useTransition } from '../model/use-transition';

const commentSchema = z.object({
  comment: z
    .string()
    .trim()
    .min(1, 'Опишите, что нужно исправить')
    .max(2000, 'Не более 2000 символов'),
});
export function ReturnForm({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (comment: string) => void;
  pending: boolean;
  error?: string;
}) {
  const form = useForm<z.infer<typeof commentSchema>>({
    resolver: zodResolver(commentSchema),
    defaultValues: { comment: '' },
  });
  return (
    <form
      className="form-stack"
      noValidate
      onSubmit={form.handleSubmit((values) => onSubmit(values.comment))}
    >
      <Field
        label="Что нужно доработать"
        htmlFor="return-comment"
        error={form.formState.errors.comment?.message}
      >
        <textarea
          autoFocus
          id="return-comment"
          className="input textarea"
          maxLength={2000}
          {...form.register('comment')}
        />
      </Field>
      {error && <ErrorNotice message={error} />}
      <Button type="submit" busy={pending}>
        <RotateCcw size={16} />
        Вернуть на доработку
      </Button>
    </form>
  );
}
export function TransitionTask({ task }: { task: Task }) {
  const viewer = useViewer();
  const [returnOpen, setReturnOpen] = useState(false);
  const { mutation, begin } = useTransition(task);
  const actions = availableActions(task, viewer);
  if (!actions.length)
    return (
      <p className="muted workflow-hint">
        {task.status === 'accepted'
          ? 'Задача завершена и принята.'
          : viewer.role === 'manager'
            ? 'Ожидаем действий исполнителя.'
            : 'Задача ожидает проверки постановщиком.'}
      </p>
    );
  return (
    <>
      <div className="action-row">
        {actions.map((action) => (
          <Button
            key={action.target}
            variant={action.commentRequired ? 'secondary' : 'primary'}
            busy={mutation.isPending}
            onClick={() =>
              action.commentRequired
                ? (begin(), setReturnOpen(true))
                : mutation.mutate({ action, current: task })
            }
          >
            {action.target === 'accepted' ? (
              <Check size={17} />
            ) : action.commentRequired ? (
              <RotateCcw size={17} />
            ) : (
              <ArrowUpRight size={17} />
            )}
            {action.label}
          </Button>
        ))}
      </div>
      {mutation.error && !returnOpen && <ErrorNotice message={errorMessage(mutation.error)} />}
      <Dialog
        open={returnOpen}
        busy={mutation.isPending}
        onOpenChange={setReturnOpen}
        title="Вернуть на доработку"
        description="Исполнитель увидит ваш комментарий в истории задачи."
      >
        <ReturnForm
          pending={mutation.isPending}
          error={mutation.error ? errorMessage(mutation.error) : undefined}
          onSubmit={(comment) =>
            mutation.mutate(
              { action: { target: 'rework', label: 'Вернуть' }, comment },
              { onSuccess: () => setReturnOpen(false) },
            )
          }
        />
      </Dialog>
    </>
  );
}
