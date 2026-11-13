import { api } from '@/shared/api';

export async function signIn(values: { email: string; password: string }) {
  const { error } = await api().auth.signInWithPassword(values);
  if (error) throw error;
}
export async function signOut() {
  const { error } = await api().auth.signOut({ scope: 'local' });
  if (error) throw error;
}
