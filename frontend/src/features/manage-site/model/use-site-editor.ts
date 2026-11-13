import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { siteKeys, type ConstructionSite } from '@/entities/construction-site';
import { useViewer } from '@/entities/session';
import { taskKeys } from '@/entities/task';
import { ApiError, useCommand } from '@/shared/api';
import { useRequestId } from '@/shared/lib';
import { saveSite, deleteSite, type SiteValues } from '../api/commands';

const schema = z.object({
  name: z.string().trim().min(1, 'Введите название').max(200, 'Не более 200 символов'),
  address: z.string().trim().min(1, 'Введите адрес').max(500, 'Не более 500 символов'),
});
const defaults = (site?: ConstructionSite): SiteValues => ({
  name: site?.name ?? '',
  address: site?.address ?? '',
});
export function useSiteEditor(site?: ConstructionSite) {
  const viewer = useViewer();
  const [base, setBase] = useState(site);
  const requestId = useRequestId();
  const form = useForm<SiteValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(base),
  });
  const mutation = useCommand(
    (values: SiteValues) => saveSite(values, base, requestId(values)),
    (result) => [
      siteKeys.lists(viewer.id),
      ...(base ? [siteKeys.detail(viewer.id, base.id)] : []),
      ...(result ? [siteKeys.detail(viewer.id, result.id)] : []),
    ],
  );
  const conflicted =
    Boolean(base && site && base.version !== site.version) ||
    (mutation.error instanceof ApiError && mutation.error.code === '40001');
  const reload = () => {
    setBase(site);
    form.reset(defaults(site));
    mutation.reset();
  };
  return { form, mutation, conflicted, reload };
}
export function useDeleteSite(site: ConstructionSite) {
  const viewer = useViewer();
  return useCommand(
    () => deleteSite(site),
    () => [
      siteKeys.lists(viewer.id),
      siteKeys.detail(viewer.id, site.id),
      taskKeys.lists(viewer.id),
      [viewer.id, 'task'],
      [viewer.id, 'history'],
      [viewer.id, 'profiles'],
    ],
  );
}
