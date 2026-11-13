import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { signIn, signOut } from '../api/commands';

const schema = z.object({
  email: z.string().trim().pipe(z.email('Введите корректный email')),
  password: z.string().min(1, 'Введите пароль'),
});
export function useSignIn() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const mutation = useMutation({ mutationFn: signIn });
  return { form, mutation };
}
export function useSignOut() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      await signOut();
      client.clear();
      navigate('/sign-in', { replace: true, state: null });
    },
  });
}
