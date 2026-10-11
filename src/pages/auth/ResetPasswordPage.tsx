import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { FullPageLoader } from '@/components/ui/Loading';

const MIN_LENGTH = 8;

// Page d'arrivée du lien reçu par email. Supabase ouvre une session de récupération à
// l'arrivée sur cette page ; sans session (lien expiré ou déjà utilisé), on propose un nouveau lien.
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (authLoading) return <FullPageLoader />;

  if (!session) {
    return (
      <div>
        <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-clay-50 border border-clay-200">
          <AlertCircle className="w-5 h-5 text-clay-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-clay-800">{t('auth.reset.invalid.title')}</h2>
            <p className="mt-1 text-sm text-clay-700">{t('auth.reset.invalid.desc')}</p>
          </div>
        </div>
        <Link to="/auth/forgot-password" className="mt-6 inline-block text-sm text-savanna-600 hover:text-savanna-700 font-semibold">
          {t('auth.login.forgot')}
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_LENGTH) return setError(t('auth.reset.tooshort'));
    if (password !== confirm) return setError(t('auth.reset.mismatch'));
    setSaving(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (err) setError(t('auth.reset.error'));
    else navigate('/dashboard', { replace: true });
  };

  return (
    <div>
      <h2 className="text-2xl font-display font-bold text-neutral-900">{t('auth.reset.title')}</h2>
      <p className="mt-2 text-sm text-neutral-500">{t('auth.reset.subtitle')}</p>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-clay-50 border border-clay-200 text-clay-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {[
          { id: 'new-password', label: t('auth.reset.new'), value: password, set: setPassword },
          { id: 'confirm-password', label: t('auth.reset.confirm'), value: confirm, set: setConfirm },
        ].map((f) => (
          <div key={f.id}>
            <label htmlFor={f.id} className="block text-sm font-medium text-neutral-700 mb-1.5">{f.label}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                id={f.id}
                type="password"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                required
                minLength={MIN_LENGTH}
                autoComplete="new-password"
                className="input-field pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>
        ))}
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? t('auth.reset.saving') : t('auth.reset.button')}
        </button>
      </form>
    </div>
  );
}
