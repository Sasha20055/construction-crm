import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, LoaderCircle, X, FolderOpen, AlertCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cloneElement, isValidElement, useState, type ReactElement } from 'react';
import { cn } from '@/shared/lib';
import { DialogBusyContext } from './dialog-state';

export function Button({
  className,
  variant = 'primary',
  busy,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      className={cn('button', `button-${variant}`, className)}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...props} className={cn('input', className)} />;
}
export function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  type Control = { 'aria-invalid'?: boolean; 'aria-describedby'?: string };
  const description = isValidElement<Control>(children)
    ? children.props['aria-describedby']
    : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Control>, {
        'aria-invalid': Boolean(error),
        'aria-describedby':
          [description, error ? `${htmlFor}-error` : undefined].filter(Boolean).join(' ') ||
          undefined,
      })
    : children;
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {control}
      {error && (
        <p id={`${htmlFor}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const [contentBusy, setContentBusy] = useState(false);
  const locked = busy || contentBusy;
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!locked) onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className="dialog-content"
          onEscapeKeyDown={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[data-combobox]')?.querySelector('[aria-expanded="true"]')
            )
              event.preventDefault();
          }}
        >
          <DialogPrimitive.Title className="dialog-title">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description
            className={description ? 'muted dialog-description' : 'sr-only'}
          >
            {description ?? title}
          </DialogPrimitive.Description>
          <DialogPrimitive.Close className="dialog-close" aria-label="Закрыть" disabled={locked}>
            <X size={20} />
          </DialogPrimitive.Close>
          <DialogBusyContext.Provider value={setContentBusy}>{children}</DialogBusyContext.Provider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={18} />
      <div>
        {message}
        {retry && (
          <button className="text-button" onClick={retry}>
            Обновить данные
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      Загружаем данные…
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <FolderOpen size={26} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Pagination({
  page,
  count,
  onChange,
  size = 20,
  label = 'Страницы',
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
  size?: number;
  label?: string;
}) {
  if (count <= size && page === 0) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <span>
        {count === 0 || page * size >= count
          ? 'Нет записей на этой странице'
          : `${page * size + 1}–${Math.min((page + 1) * size, count)} из ${count}`}
      </span>
      <div>
        <Button
          variant="secondary"
          type="button"
          aria-label="Предыдущая страница"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ArrowLeft size={16} />
        </Button>
        <Button
          variant="secondary"
          type="button"
          aria-label="Следующая страница"
          disabled={(page + 1) * size >= count}
          onClick={() => onChange(page + 1)}
        >
          <ArrowRight size={16} />
        </Button>
      </div>
    </nav>
  );
}
