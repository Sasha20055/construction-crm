import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ReturnForm } from './index';
describe('return form (FLOW-02/UI-02)', () => {
  it('does not submit whitespace-only feedback', async () => {
    const submit = vi.fn();
    render(<ReturnForm onSubmit={submit} pending={false} />);
    await userEvent.type(screen.getByLabelText('Что нужно доработать'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть на доработку' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Опишите, что нужно исправить');
    expect(submit).not.toHaveBeenCalled();
  });
  it('submits trimmed feedback and renders server errors', async () => {
    const submit = vi.fn();
    render(<ReturnForm onSubmit={submit} pending={false} error="Данные уже изменились" />);
    await userEvent.type(screen.getByLabelText('Что нужно доработать'), '  Устранить зазор  ');
    await userEvent.click(screen.getByRole('button', { name: 'Вернуть на доработку' }));
    expect(submit).toHaveBeenCalledWith('Устранить зазор');
    expect(screen.getByRole('alert')).toHaveTextContent('Данные уже изменились');
  });
  it('prevents duplicate submission while a command is pending', () => {
    render(<ReturnForm onSubmit={vi.fn()} pending />);
    expect(screen.getByRole('button', { name: 'Вернуть на доработку' })).toBeDisabled();
  });
});
