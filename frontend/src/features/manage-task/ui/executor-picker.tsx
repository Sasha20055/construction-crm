import { useEffect, useId, useState, type Ref } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useExecutors, useProfiles } from '@/entities/session';
import { errorMessage } from '@/shared/api';
import { usePage } from '@/shared/lib';
import { ErrorNotice, Field, Input, Loading, Pagination } from '@/shared/ui';

export function ExecutorPicker({
  value,
  onChange,
  onBlur,
  error,
  ref,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  onBlur: () => void;
  error?: string;
  ref?: Ref<HTMLInputElement>;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = usePage(search);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ id: string; display_name: string }>();
  const profiles = useProfiles(value ? [value] : []);
  const people = useExecutors(search, page);
  const selected =
    profiles.data?.find((person) => person.id === value) ??
    (chosen?.id === value ? chosen : undefined);
  const rows = people.isFetching || people.error ? [] : (people.data?.rows ?? []);
  const active = rows.find((person) => person.id === activeId);
  useEffect(() => {
    if (active)
      document.getElementById(`${id}-${active.id}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, id]);
  const close = () => {
    setOpen(false);
    setSearch('');
    setActiveId(null);
  };
  const choose = (person: { id: string; display_name: string }) => {
    setChosen(person);
    onChange(person.id);
    close();
  };
  const expand = () => {
    if (!open) {
      setOpen(true);
      setSearch('');
      setActiveId(null);
    }
  };
  return (
    <div
      className="executor-picker"
      data-combobox=""
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          close();
          onBlur();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <Field label="Исполнитель" htmlFor={id} error={error}>
        <Input
          id={id}
          ref={ref}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? `${id}-list` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && active ? `${id}-${active.id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          className="executor-input"
          maxLength={200}
          value={open ? search : (selected?.display_name ?? '')}
          placeholder={open ? 'Поиск по имени' : value ? 'Загружаем имя…' : 'Выберите исполнителя'}
          onFocus={expand}
          onClick={expand}
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveId(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              expand();
              const current = rows.findIndex((person) => person.id === activeId);
              const next =
                event.key === 'ArrowDown'
                  ? (current + 1) % rows.length
                  : current < 0
                    ? rows.length - 1
                    : (current - 1 + rows.length) % rows.length;
              setActiveId(rows[next]?.id ?? null);
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              if (active) choose(active);
            }
          }}
        />
      </Field>
      <ChevronDown size={17} className="executor-chevron" aria-hidden="true" />
      {open && (
        <div className="executor-dropdown">
          {people.error || profiles.error ? (
            <ErrorNotice
              message={errorMessage(people.error ?? profiles.error)}
              retry={() => {
                void people.refetch();
                if (value) void profiles.refetch();
              }}
            />
          ) : null}
          {people.isFetching || people.isPending ? <Loading /> : null}
          <div
            id={`${id}-list`}
            role="listbox"
            aria-label="Исполнители"
            aria-busy={people.isFetching}
            className="executor-options"
          >
            {rows.map((person) => (
              <div
                id={`${id}-${person.id}`}
                key={person.id}
                role="option"
                aria-selected={person.id === value}
                className={`executor-option${person.id === activeId ? ' active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(person)}
              >
                <span>{person.display_name}</span>
                {person.id === value && <Check size={16} aria-hidden="true" />}
              </div>
            ))}
          </div>
          {!people.error && !people.isFetching && !people.isPending && !rows.length && (
            <p className="executor-empty muted" role="status">
              Никого не найдено
            </p>
          )}
          {people.data && (
            <Pagination
              page={people.data.page}
              count={people.data.count}
              label="Исполнители"
              onChange={(next) => {
                setActiveId(null);
                setPage(next);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
