import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ExecutorPicker } from './executor-picker';
vi.mock('@/entities/session', () => ({
  useProfiles: () => ({ data: [{ id: 'a', display_name: 'Анна' }] }),
  useExecutors: (search: string) => ({
    data: {
      rows: [
        { id: 'a', display_name: 'Анна' },
        { id: 'b', display_name: 'Борис' },
      ].filter((person) => person.display_name.toLowerCase().includes(search.toLowerCase())),
      count: 2,
      page: 0,
    },
    isPending: false,
    isFetching: false,
    isPlaceholderData: false,
  }),
}));
it('searches and selects in a single field with the keyboard', async () => {
  const change = vi.fn();
  render(<ExecutorPicker value="" onChange={change} onBlur={() => undefined} />);
  const input = screen.getByRole('combobox', { name: 'Исполнитель' });
  await userEvent.type(input, 'Бор');
  expect(screen.queryByRole('option', { name: 'Анна' })).not.toBeInTheDocument();
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(change).toHaveBeenCalledWith('b');
  expect(input).toHaveAttribute('aria-expanded', 'false');
});
it('keeps an existing selection when a search is cancelled', async () => {
  const change = vi.fn();
  render(<ExecutorPicker value="a" onChange={change} onBlur={() => undefined} />);
  const input = screen.getByRole('combobox', { name: 'Исполнитель' });
  expect(input).toHaveValue('Анна');
  await userEvent.type(input, 'Нет совпадений');
  expect(screen.getByRole('status')).toHaveTextContent('Никого не найдено');
  await userEvent.keyboard('{Escape}');
  expect(input).toHaveValue('Анна');
  expect(change).not.toHaveBeenCalled();
});
it('links validation errors to the searchable field', () => {
  render(
    <ExecutorPicker
      value=""
      onChange={() => undefined}
      onBlur={() => undefined}
      error="Выберите исполнителя"
    />,
  );
  expect(screen.getByRole('combobox')).toHaveAccessibleDescription('Выберите исполнителя');
  expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
});
