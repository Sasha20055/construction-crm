import { Building2, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { SignInForm } from '@/features/auth';
import { config } from '@/shared/config';

export function SignInPage() {
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-symbol">
            <Building2 size={23} />
          </span>
          <span>
            стройконтроль<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="login-story-copy">
          <span className="login-kicker">РАБОТА, КОТОРАЯ ДВИЖЕТСЯ</span>
          <h1>
            От новой задачи
            <br />
            до принятого
            <br />
            <em>результата.</em>
          </h1>
          <p>
            Объекты, команда и задачи — в одном месте.
            <br />
            Каждый знает свой следующий шаг.
          </p>
          <div className="story-line">
            <span>01 / ПОСТАВИТЬ</span>
            <span>02 / ВЫПОЛНИТЬ</span>
            <span>03 / ПРИНЯТЬ</span>
          </div>
        </div>
        <div className="login-story-footer">
          <ShieldCheck size={18} />
          <span>Доступ к данным — по роли и назначению</span>
        </div>
        <div className="building-art" aria-hidden="true">
          <div />
          <div />
          <div />
          <div />
        </div>
      </section>
      <section className="login-form-panel">
        <div className="login-form-wrap">
          <span className="section-number">
            ЛИЧНЫЙ КАБИНЕТ <ArrowUpRight size={16} />
          </span>
          <h2>С возвращением</h2>
          <p className="muted login-intro">Войдите, чтобы продолжить работу.</p>
          {config.configured ? (
            <SignInForm />
          ) : (
            <div className="setup-notice" role="status">
              <ShieldCheck size={24} />
              <h3>Настройте подключение</h3>
              <p>
                Приложение готово к подключению Supabase. Добавьте URL проекта и публичный ключ в{' '}
                <code>.env.local</code>, затем перезапустите сервер.
              </p>
              <p>Инструкция и миграции находятся в README проекта.</p>
            </div>
          )}
        </div>
        <p className="login-footer">СТРОЙКОНТРОЛЬ · ОБЪЕКТЫ И ЗАДАЧИ</p>
      </section>
    </main>
  );
}
