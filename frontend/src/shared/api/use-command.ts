import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError } from './client';

export function useCommand<TInput, TOutput>(
  command: (input: TInput) => Promise<TOutput>,
  affected: (output: TOutput | undefined, input: TInput) => readonly QueryKey[],
) {
  const client = useQueryClient();
  const refresh = (output: TOutput | undefined, input: TInput) => {
    const keys = new Map(affected(output, input).map((key) => [JSON.stringify(key), key]));
    return Promise.all(
      [...keys.values()].map((queryKey) => client.invalidateQueries({ queryKey })),
    );
  };
  return useMutation({
    mutationFn: command,
    onSuccess: refresh,
    onError: (error, input) => {
      if (error instanceof ApiError && ['40001', 'P0002'].includes(error.code))
        return refresh(undefined, input);
    },
  });
}
