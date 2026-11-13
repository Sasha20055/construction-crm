import { useRef } from 'react';

export function useRequestId() {
  const request = useRef<{ payload: string; id: string } | null>(null);
  return (values: unknown) => {
    const payload = JSON.stringify(values);
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    return request.current.id;
  };
}
