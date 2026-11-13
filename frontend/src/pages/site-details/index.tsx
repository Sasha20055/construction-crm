import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useSite } from '@/entities/construction-site';
import { useProfiles, useViewer } from '@/entities/session';
import { TaskList, useTasks } from '@/entities/task';
import { SiteEditor, DeleteSiteDialog } from '@/features/manage-site';
import { TaskEditor } from '@/features/manage-task';
import { usePage } from '@/shared/lib';
import { errorMessage } from '@/shared/api';
import { Button, Dialog, ErrorNotice, Loading, PageHeading, Pagination } from '@/shared/ui';

export function SiteDetailsPage() {
  const { id = '' } = useParams();
  const viewer = useViewer();
  const navigate = useNavigate();
  const [page, setPage] = usePage(id);
  const [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false),
    [createTask, setCreateTask] = useState(false);
  const site = useSite(viewer.id, id);
  const tasks = useTasks(viewer.id, { siteId: id, page });
  const people = useProfiles(
    tasks.data?.rows.flatMap((task) => [task.assignee_id, task.author_id]) ?? [],
  );
  if (site.isPending) return <Loading />;
  if (site.error)
    return (
      <ErrorNotice
        message={errorMessage(site.error)}
        retry={() => {
          void site.refetch();
        }}
      />
    );
  return (
    <>
      <Link className="back-link" to="/sites">
        <ArrowLeft size={16} />
        Все объекты
      </Link>
      <PageHeading
        eyebrow="ОБЪЕКТ"
        title={site.data.name}
        description={site.data.address}
        action={
          viewer.role === 'manager' && (
            <div className="action-row">
              <Button variant="secondary" onClick={() => setEdit(true)}>
                <Pencil size={16} />
                Изменить
              </Button>
              <Button variant="ghost" aria-label="Удалить объект" onClick={() => setRemove(true)}>
                <Trash2 size={18} />
              </Button>
            </div>
          )
        }
      />
      <div className="site-info-banner">
        <MapPin size={20} />
        <div>
          <span className="small muted">АДРЕС ОБЪЕКТА</span>
          <p>{site.data.address}</p>
        </div>
        <span className="banner-mark">СТРОЙКОНТРОЛЬ / ОБЪЕКТ</span>
      </div>
      <div className="section-heading">
        <h2>
          Задачи объекта <span className="count-pill">{tasks.data?.count ?? '—'}</span>
        </h2>
        {viewer.role === 'manager' && (
          <Button onClick={() => setCreateTask(true)}>
            <Plus size={17} />
            Новая задача
          </Button>
        )}
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
      <Dialog open={edit} onOpenChange={setEdit} title="Редактировать объект">
        {edit && <SiteEditor site={site.data} onSaved={() => setEdit(false)} />}
      </Dialog>
      <Dialog
        open={createTask}
        onOpenChange={setCreateTask}
        title="Новая задача"
        description="Назначьте исполнителя и опишите ожидаемый результат."
      >
        {createTask && <TaskEditor site={site.data} onSaved={() => setCreateTask(false)} />}
      </Dialog>
      <DeleteSiteDialog
        site={site.data}
        open={remove}
        onOpenChange={setRemove}
        onDeleted={() => navigate('/sites')}
      />
    </>
  );
}
