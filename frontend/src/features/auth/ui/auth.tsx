import { LogOut, ArrowRight } from 'lucide-react';
import { errorMessage } from '@/shared/api';
import { Button, ErrorNotice, Field, Input } from '@/shared/ui';
import { useSignIn, useSignOut } from '../model/use-auth';
export function SignInForm() {
  const { form, mutation } = useSignIn();
  return (
    <form
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      className="form-stack"
      noValidate
    >
      <Field label="Рабочий email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="you@company.ru"
          {...form.register('email')}
          aria-invalid={Boolean(form.formState.errors.email)}
        />
      </Field>
      <Field label="Пароль" htmlFor="password" error={form.formState.errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Введите пароль"
          {...form.register('password')}
          aria-invalid={Boolean(form.formState.errors.password)}
        />
      </Field>
      {mutation.error && <ErrorNotice message={errorMessage(mutation.error)} />}
      <Button type="submit" busy={mutation.isPending} className="w-full">
        Войти в систему <ArrowRight size={17} />
      </Button>
      <p className="login-note">Доступ выдаёт администратор вашей компании.</p>
    </form>
  );
}
export function SignOutButton() {
  const mutation = useSignOut();
  return (
    <>
      <Button
        variant="ghost"
        className="sign-out"
        busy={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        <LogOut size={17} />
        Выйти
      </Button>
      {mutation.error && <ErrorNotice message={errorMessage(mutation.error)} />}
    </>
  );
}
