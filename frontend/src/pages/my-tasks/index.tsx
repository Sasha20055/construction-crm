import { useState } from 'react';
import { useProfiles, useViewer } from '@/entities/session';
import { statusLabels, TaskList, useTasks, type TaskStatus } from '@/entities/task';
import { usePage } from '@/shared/lib';
import { errorMessage } from '@/shared/api';
import { ErrorNotice, Loading, PageHeading, Pagination } from '@/shared/ui';

export function MyTasksPage() {
  const viewer = useViewer();
  const [status, setStatus] = useState<TaskStatus | undefined>();
  const [page, setPage] = usePage(status ?? 'all');
  const tasks = useTasks(viewer.id, { mine: true, status, page });
  const people = useProfiles(
    tasks.data?.rows.flatMap((task) => [task.assignee_id, task.author_id]) ?? [],
  );
  return (
    <>
      <PageHeading
        eyebrow="ЛИЧНОЕ / ЗАДАЧИ"
        title="Ваш следующий шаг"
        description="Все назначенные вам задачи. От начала работы до принятого результата."
      />
      <div className="filter-bar" aria-label="Фильтр по статусу">
        <button
          className={!status ? 'filter active' : 'filter'}
          onClick={() => {
            setStatus(undefined);
          }}
        >
          Все задачи
        </button>
        {Object.entries(statusLabels).map(([value, label]) => (
          <button
            key={value}
            className={status === value ? 'filter active' : 'filter'}
            onClick={() => {
              setStatus(value as TaskStatus);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="section-heading">
        <h2>
          Мои задачи <span className="count-pill">{tasks.data?.count ?? '—'}</span>
        </h2>
        <span className="small muted">Только назначенные вам</span>
      </div>
      {people.error && (
        <ErrorNotice
          message="Не удалось загрузить имена участников."
          retry={() => {
            void people.refetch();
          }}
        />
      )}
      {tasks.isPending ? (
        <Loading />
      ) : tasks.error ? (
        <ErrorNotice
          message={errorMessage(tasks.error)}
          retry={() => {
            void tasks.refetch();
          }}
        />
      ) : (
        <>
          <TaskList tasks={tasks.data.rows} people={people.data} />
          <Pagination page={tasks.data.page} count={tasks.data.count} onChange={setPage} />
        </>
      )}
    </>
  );
}
