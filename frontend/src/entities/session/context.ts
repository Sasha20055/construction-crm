import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Tables } from '@/shared/api';

export type SessionState = {
  session: Session | null;
  initialized: boolean;
  profile: Tables<'profiles'> | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
};
export const SessionContext = createContext<SessionState | null>(null);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
export function useViewer() {
  const { profile } = useSession();
  if (!profile) throw new Error('Authenticated profile is required');
  return profile;
}
