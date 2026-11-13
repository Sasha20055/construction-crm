import type { ConstructionSite } from '@/entities/construction-site';
import { errorMessage } from '@/shared/api';
import { Button, Dialog, ErrorNotice, Field, useDialogBusy, Input } from '@/shared/ui';
import { useSiteEditor, useDeleteSite } from '../model/use-site-editor';
export function SiteEditor({ site, onSaved }: { site?: ConstructionSite; onSaved: () => void }) {
  const { form, mutation, conflicted, reload } = useSiteEditor(site);
  useDialogBusy(mutation.isPending);
  return (
    <form
      className="form-stack"
      noValidate
      onSubmit={form.handleSubmit((values) => mutation.mutate(values, { onSuccess: onSaved }))}
    >
      <Field
        label="Название объекта"
        htmlFor="site-name"
        error={form.formState.errors.name?.message}
      >
        <Input
          autoFocus
          id="site-name"
          placeholder="Например, ЖК Северный парк"
          maxLength={200}
          {...form.register('name')}
        />
      </Field>
      <Field label="Адрес" htmlFor="site-address" error={form.formState.errors.address?.message}>
        <Input
          id="site-address"
          placeholder="Город, улица, дом"
          maxLength={500}
          {...form.register('address')}
        />
      </Field>
      {conflicted && (
        <div role="alert">
          <p>
            Объект изменён другим пользователем. Загрузка актуальных данных заменит несохранённые
            изменения.
          </p>
          <Button type="button" variant="secondary" onClick={reload}>
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
          {site ? 'Сохранить изменения' : 'Создать объект'}
        </Button>
      </div>
    </form>
  );
}
export function DeleteSiteDialog({
  site,
  open,
  onOpenChange,
  onDeleted,
}: {
  site: ConstructionSite;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const mutation = useDeleteSite(site);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      busy={mutation.isPending}
      title="Удалить объект?"
      description={`Объект «${site.name}» и все его задачи исчезнут из рабочих списков. История сохранится в базе. Восстановление через интерфейс недоступно.`}
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
          Удалить объект
        </Button>
      </div>
    </Dialog>
  );
}
