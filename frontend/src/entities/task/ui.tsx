import { ArrowUpRight, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tables } from '@/shared/api';
import { dateTime } from '@/shared/lib';
import { EmptyState } from '@/shared/ui';
import { statusLabels, type Task, type TaskStatus } from './model';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
export function TaskList({ tasks, people = [] }: { tasks: Task[]; people?: Tables<'profiles'>[] }) {
  if (!tasks.length)
    return (
      <EmptyState
        title="Задач пока нет"
        description="Новые задачи появятся здесь после назначения."
      />
    );
  const names = new Map(people.map((p) => [p.id, p.display_name]));
  return (
    <div className="task-list">
      <div className="task-table-head">
        <span>Задача</span>
        <span>Исполнитель</span>
        <span>Статус</span>
        <span />
      </div>
      {tasks.map((task) => (
        <Link key={task.id} className="task-row" to={`/tasks/${task.id}`}>
          <div className="task-row-main">
            <div className="task-icon">
              <ClipboardList size={19} />
            </div>
            <div>
              <strong>{task.title}</strong>
              <small>{dateTime(task.created_at)}</small>
            </div>
          </div>
          <span className="assignee-name">{names.get(task.assignee_id) ?? 'Исполнитель'}</span>
          <StatusBadge status={task.status} />
          <ArrowUpRight size={17} className="muted" />
        </Link>
      ))}
    </div>
  );
}
