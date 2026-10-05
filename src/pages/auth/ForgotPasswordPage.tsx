import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/context/I18nContext';

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (err) setError(t('auth.forgot.error'));
    else setSent(true); // message identique que le compte existe ou non (pas d'énumération de comptes)
  };

  if (sent) {
    return (
      <div>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-forest-50 border border-forest-200">
          <CheckCircle2 className="w-5 h-5 text-forest-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-forest-900">{t('auth.forgot.sent.title')}</h2>
            <p className="mt-1 text-sm text-forest-800">{t('auth.forgot.sent.desc')}</p>
          </div>
        </div>
        <Link to="/auth/login" className="mt-6 inline-block text-sm text-savanna-600 hover:text-savanna-700 font-semibold">
          {t('auth.forgot.back')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-display font-bold text-neutral-900">{t('auth.forgot.title')}</h2>
      <p className="mt-2 text-sm text-neutral-500">{t('auth.forgot.subtitle')}</p>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-clay-50 border border-clay-200 text-clay-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-neutral-700 mb-1.5">
            {t('auth.register.email')}
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="input-field pl-10"
              placeholder="you@example.com"
            />
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t('auth.forgot.sending') : t('auth.forgot.button')}
        </button>
      </form>

      <Link to="/auth/login" className="mt-6 inline-block text-sm text-savanna-600 hover:text-savanna-700 font-semibold">
        {t('auth.forgot.back')}
      </Link>
    </div>
  );
}
