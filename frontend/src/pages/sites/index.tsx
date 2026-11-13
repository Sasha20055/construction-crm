import { useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  MapPin,
  Plus,
  Layers3,
  ClipboardList,
  ScanLine,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSites } from '@/entities/construction-site';
import { useViewer } from '@/entities/session';
import { useTasks } from '@/entities/task';
import { SiteEditor } from '@/features/manage-site';
import { errorMessage } from '@/shared/api';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeading,
  Pagination,
} from '@/shared/ui';

export function SitesPage() {
  const viewer = useViewer();
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const sites = useSites(viewer.id, page);
  const tasks = useTasks(viewer.id);
  const review = useTasks(viewer.id, { status: 'in_review' });
  const createButton =
    viewer.role === 'manager' ? (
      <Button onClick={() => setCreateOpen(true)}>
        <Plus size={18} />
        Новый объект
      </Button>
    ) : undefined;
  return (
    <>
      <PageHeading
        eyebrow="ОБЗОР / ОБЪЕКТЫ"
        title="Здесь строится результат"
        description={
          viewer.role === 'manager'
            ? 'Все объекты компании и работа вашей команды.'
            : 'Объекты, на которых вам назначены задачи.'
        }
        action={createButton}
      />
      <div className="stats-grid">
        <div className="stat-card">
          <Layers3 size={20} />
          <span>Доступных объектов</span>
          <strong>{sites.data?.count ?? '—'}</strong>
          <small>В вашем рабочем пространстве</small>
        </div>
        <div className="stat-card">
          <ClipboardList size={20} />
          <span>{viewer.role === 'manager' ? 'Всего задач' : 'Назначено вам'}</span>
          <strong>{tasks.data?.count ?? '—'}</strong>
          <small>На доступных объектах</small>
        </div>
        <div className="stat-card stat-accent">
          <ScanLine size={20} />
          <span>На проверке</span>
          <strong>{review.data?.count ?? '—'}</strong>
          <small>
            {viewer.role === 'manager' ? 'Ожидают вашего решения' : 'Ожидают решения постановщика'}
          </small>
        </div>
      </div>
      {(tasks.error || review.error) && (
        <ErrorNotice
          message="Не удалось загрузить статистику задач."
          retry={() => {
            void tasks.refetch();
            void review.refetch();
          }}
        />
      )}
      <div className="section-heading">
        <h2>
          Объекты <span className="count-pill">{sites.data?.count ?? '—'}</span>
        </h2>
        <span className="muted small">От нового к старому</span>
      </div>
      {sites.isPending ? (
        <Loading />
      ) : sites.error ? (
        <ErrorNotice
          message={errorMessage(sites.error)}
          retry={() => {
            void sites.refetch();
          }}
        />
      ) : sites.data.rows.length ? (
        <>
          <div className="sites-grid">
            {sites.data.rows.map((site, i) => (
              <Link className="site-card" key={site.id} to={`/sites/${site.id}`}>
                <div className={`site-visual site-visual-${i % 3}`}>
                  <span className="site-number">
                    ОБЪЕКТ / {String(sites.data.page * 20 + i + 1).padStart(2, '0')}
                  </span>
                  <Building2 size={72} strokeWidth={0.8} />
                  <span className="site-open">
                    <ArrowUpRight size={20} />
                  </span>
                </div>
                <div className="site-card-body">
                  <h3>{site.name}</h3>
                  <p>
                    <MapPin size={15} />
                    {site.address}
                  </p>
                  <div className="site-card-footer">
                    <span>Открыть объект</span>
                    <ArrowUpRight size={16} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={sites.data.page} count={sites.data.count} onChange={setPage} />
        </>
      ) : (
        <EmptyState
          title="Пока нет объектов"
          description={
            viewer.role === 'manager'
              ? 'Создайте первый объект, чтобы поставить задачи команде.'
              : 'Объект появится, когда вам назначат первую задачу.'
          }
          action={createButton}
        />
      )}
      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Новый объект"
        description="Укажите название стройки и её адрес."
      >
        {createOpen && <SiteEditor onSaved={() => setCreateOpen(false)} />}
      </Dialog>
    </>
  );
}
