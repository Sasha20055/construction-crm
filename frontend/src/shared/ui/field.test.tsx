import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Dialog, Field, Input, Pagination } from './index';
it('connects field errors to their controls', () => {
  const { rerender } = render(
    <Field label="Name" htmlFor="name" error="Required">
      <Input id="name" />
    </Field>,
  );
  expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Required');
  rerender(
    <Field label="Name" htmlFor="name">
      <Input id="name" />
    </Field>,
  );
  expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false');
  expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby');
});
it('keeps a way back from an empty page', async () => {
  const change = vi.fn();
  render(<Pagination page={1} count={20} onChange={change} />);
  await userEvent.click(screen.getByRole('button', { name: 'Предыдущая страница' }));
  expect(change).toHaveBeenCalledWith(0);
});
it('does not close a pending dialog with Escape or its close control', async () => {
  const change = vi.fn();
  render(
    <Dialog open busy onOpenChange={change} title="Saving">
      <Input aria-label="Value" />
    </Dialog>,
  );
  expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  expect(change).not.toHaveBeenCalled();
});
