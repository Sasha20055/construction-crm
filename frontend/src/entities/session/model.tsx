import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { api, supabase, unwrap } from '@/shared/api';
import { SessionContext } from './context';

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(!supabase);
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // Keep callback synchronous: awaiting Supabase here can deadlock its Auth lock.
      const userId = next?.user.id ?? null;
      if (previousUser.current !== userId) {
        client.clear();
        previousUser.current = userId;
      }
      setSession(next);
      setInitialized(true);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  const profile = useQuery({
    queryKey: [session?.user.id, 'session', 'profile'],
    enabled: Boolean(session),
    retry: false,
    queryFn: async ({ signal }) =>
      unwrap(
        await api()
          .from('profiles')
          .select('*')
          .eq('id', session!.user.id)
          .abortSignal(signal)
          .single(),
      ),
  });
  return (
    <SessionContext.Provider
      value={{
        session,
        initialized,
        profile: profile.data ?? null,
        loading: !initialized || Boolean(session && profile.isPending),
        error: profile.error,
        retry: () => {
          void profile.refetch();
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
