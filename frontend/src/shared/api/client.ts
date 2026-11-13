import { createClient } from '@supabase/supabase-js';
import { config } from '@/shared/config';
import type { Database } from './database.types';

export const supabase = config.configured
  ? createClient<Database>(config.supabaseUrl, config.supabaseKey)
  : null;

export function api() {
  if (!supabase) throw new Error('Подключение Supabase не настроено.');
  return supabase;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function unwrap<T>(result: {
  data: T;
  error: { code: string; message: string } | null;
}): NonNullable<T> {
  if (result.error) throw new ApiError(result.error.code, result.error.message);
  if (result.data === null) throw new ApiError('P0002', 'NOT_AVAILABLE');
  return result.data as NonNullable<T>;
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === '40001')
      return 'Данные уже изменились. Обновите страницу и повторите действие.';
    if (error.code === '42501') return 'У вас нет прав на это действие.';
    if (error.code === 'P0002' || error.code === 'PGRST116')
      return 'Запись удалена или у вас нет к ней доступа.';
    if (error.message.includes('COMMENT_REQUIRED')) return 'Укажите, что нужно доработать.';
    if (error.message.includes('INVALID_TRANSITION'))
      return 'Этот переход сейчас недоступен. Обновите данные.';
    if (error.message.includes('INVALID_ASSIGNEE')) return 'Выберите действующего исполнителя.';
    if (['22023', '23514', '23502', '22P02'].includes(error.code))
      return 'Проверьте заполненные поля.';
  }
  if (error instanceof Error && /Invalid login credentials/.test(error.message))
    return 'Неверный email или пароль.';
  return 'Не удалось выполнить запрос. Проверьте соединение и повторите попытку.';
}
