import type { ConstructionSite } from '@/entities/construction-site';
import { api, unwrap } from '@/shared/api';

export type SiteValues = { name: string; address: string };
export async function saveSite(
  values: SiteValues,
  site: ConstructionSite | undefined,
  requestId: string,
) {
  return site
    ? unwrap(
        await api().rpc('update_site', {
          p_id: site.id,
          p_expected_version: site.version,
          p_name: values.name,
          p_address: values.address,
        }),
      )
    : unwrap(
        await api().rpc('create_site', {
          p_name: values.name,
          p_address: values.address,
          p_request_id: requestId,
        }),
      );
}
export async function deleteSite(site: ConstructionSite) {
  return unwrap(
    await api().rpc('delete_site', { p_id: site.id, p_expected_version: site.version }),
  );
}
