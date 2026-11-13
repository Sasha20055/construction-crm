import { useState } from 'react';

export function usePage(scope: string) {
  const [state, setState] = useState({ scope, page: 0 });
  if (state.scope !== scope) setState({ scope, page: 0 });
  const page = state.scope === scope ? state.page : 0;
  return [page, (next: number) => setState({ scope, page: Math.max(0, next) })] as const;
}
