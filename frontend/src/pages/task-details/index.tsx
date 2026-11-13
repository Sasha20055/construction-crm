import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Clock3, Pencil, Trash2 } from 'lucide-react';
import { useSite } from '@/entities/construction-site';
import { useProfiles, useViewer } from '@/entities/session';
import { statusLabels, StatusBadge, useTask, useTaskHistory, type Task } from '@/entities/task';
import { TaskEditor, DeleteTaskDialog } from '@/features/manage-task';
import { TransitionTask } from '@/features/transition-task';
import { errorMessage } from '@/shared/api';
import { dateTime } from '@/shared/lib';
import { Button, Dialog, ErrorNotice, Loading, PageHeading, Pagination } from '@/shared/ui';

export function TaskDetailsPage() {
  const { id = '' } = useParams();
  const viewer = useViewer();
  const task = useTask(viewer.id, id);
  if (task.isPending) return <Loading />;
  if (task.error)
    return (
      <ErrorNotice
        message={errorMessage(task.error)}
        retry={() => {
          void task.refetch();
        }}
      />
    );
  return <TaskContent key={task.data.id} task={task.data} />;
}
function TaskContent({ task }: { task: Task }) {
  const viewer = useViewer();
  const navigate = useNavigate();
  const site = useSite(viewer.id, task.site_id);
  const [page, setPage] = useState(0);
  const history = useTaskHistory(viewer.id, task.id, page);
  const people = useProfiles([
    task.author_id,
    task.assignee_id,
    ...(history.data?.rows.map((event) => event.actor_id) ?? []),
  ]);
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  const names = new Map(people.data?.map((person) => [person.id, person.display_name]));
  return (
    <>
      <Link className="back-link" to={`/sites/${task.site_id}`}>
        <ArrowLeft size={16} />
        {site.data?.name ?? 'К объекту'}
      </Link>
      <PageHeading
        eyebrow="ЗАДАЧА"
        title={task.title}
        action={
          viewer.role === 'manager' && (
            <div className="action-row">
              <Button variant="secondary" disabled={!site.data} onClick={() => setEdit(true)}>
                <Pencil size={16} />
                Изменить
              </Button>
              <Button variant="ghost" aria-label="Удалить задачу" onClick={() => setRemove(true)}>
                <Trash2 size={18} />
              </Button>
            </div>
          )
        }
      />
      {(people.error || site.error) && (
        <ErrorNotice
          message="Не удалось загрузить связанные данные."
          retry={() => {
            void people.refetch();
            void site.refetch();
          }}
        />
      )}
      <div className="task-detail-grid">
        <div>
          <section className="panel task-description">
            <div className="panel-heading">
              <h2>Детали задачи</h2>
              <StatusBadge status={task.status} />
            </div>
            <p className="description-text">{task.description || 'Описание не добавлено.'}</p>
            <div className="workflow-actions">
              <TransitionTask task={task} />
            </div>
          </section>
          <section className="panel history-panel">
            <div className="panel-heading">
              <h2>
                <Clock3 size={19} />
                История изменений
              </h2>
              <span className="count-pill">{history.data?.count ?? '—'}</span>
            </div>
            {history.isPending ? (
              <Loading />
            ) : history.error ? (
              <ErrorNotice
                message={errorMessage(history.error)}
                retry={() => {
                  void history.refetch();
                }}
              />
            ) : (
              <>
                <ol className="timeline">
                  {history.data.rows.map((event) => (
                    <li key={event.id}>
                      <span
                        className={`timeline-dot ${event.to_status === 'accepted' ? 'complete' : ''}`}
                      >
                        <Check size={12} />
                      </span>
                      <div>
                        <div className="history-title">
                          {event.from_status ? (
                            <>
                              {statusLabels[event.from_status]} <ArrowUpRight size={13} />{' '}
                              {statusLabels[event.to_status]}
                            </>
                          ) : (
                            'Задача создана'
                          )}
                        </div>
                        <p className="small muted">
                          {names.get(event.actor_id) ?? 'Участник команды'} ·{' '}
                          {dateTime(event.created_at)}
                        </p>
                        {event.comment && <blockquote>{event.comment}</blockquote>}
                      </div>
                    </li>
                  ))}
                </ol>
                <Pagination
                  page={history.data.page}
                  count={history.data.count}
                  onChange={setPage}
                />
              </>
            )}
          </section>
        </div>
        <aside className="panel task-meta">
          <p className="eyebrow">О ЗАДАЧЕ</p>
          <dl>
            <dt>Объект</dt>
            <dd>
              <Link to={`/sites/${task.site_id}`}>
                {site.data?.name ?? 'Загружаем…'} <ArrowUpRight size={14} />
              </Link>
            </dd>
            <dt>Исполнитель</dt>
            <dd>
              <span className="person-avatar">
                {(names.get(task.assignee_id) ?? 'И').slice(0, 1)}
              </span>
              {names.get(task.assignee_id) ?? 'Исполнитель'}
            </dd>
            <dt>Постановщик</dt>
            <dd>{names.get(task.author_id) ?? 'Постановщик'}</dd>
            <dt>Создана</dt>
            <dd>{dateTime(task.created_at)}</dd>
            <dt>Последнее изменение</dt>
            <dd>{dateTime(task.updated_at)}</dd>
          </dl>
        </aside>
      </div>
      <Dialog open={edit} onOpenChange={setEdit} title="Редактировать задачу">
        {edit && site.data && (
          <TaskEditor task={task} site={site.data} onSaved={() => setEdit(false)} />
        )}
      </Dialog>
      <DeleteTaskDialog
        task={task}
        open={remove}
        onOpenChange={setRemove}
        onDeleted={() => navigate(`/sites/${task.site_id}`)}
      />
    </>
  );
}
