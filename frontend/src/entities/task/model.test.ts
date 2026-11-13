import { describe, expect, it } from 'vitest';
import { availableActions, type TaskStatus } from './model';
const manager = { id: 'manager', role: 'manager' as const };
const executor = { id: 'executor', role: 'executor' as const };
const task = (status: TaskStatus, assignee_id = executor.id) => ({
  status,
  assignee_id,
  deleted_at: null,
});
describe('available actions (UI-02)', () => {
  it('manager reviews only tasks waiting for review', () => {
    expect(availableActions(task('in_review'), manager).map((a) => a.target)).toEqual([
      'accepted',
      'rework',
    ]);
    for (const status of ['new', 'in_progress', 'accepted', 'rework'] as const)
      expect(availableActions(task(status), manager)).toEqual([]);
  });
  it('executor can start, resume and submit only assigned tasks', () => {
    expect(availableActions(task('new'), executor)[0].target).toBe('in_progress');
    expect(availableActions(task('rework'), executor)[0].target).toBe('in_progress');
    expect(availableActions(task('in_progress'), executor)[0].target).toBe('in_review');
    expect(availableActions(task('in_review'), executor)).toEqual([]);
    expect(availableActions(task('new', 'someone-else'), executor)).toEqual([]);
  });
  it('accepted and deleted tasks have no transitions', () => {
    for (const viewer of [manager, executor]) {
      expect(availableActions(task('accepted'), viewer)).toEqual([]);
      expect(availableActions({ ...task('in_review'), deleted_at: '2026-11-13' }, viewer)).toEqual(
        [],
      );
    }
  });
  it('return requires a comment', () =>
    expect(
      availableActions(task('in_review'), manager).find((a) => a.target === 'rework')
        ?.commentRequired,
    ).toBe(true));
});
