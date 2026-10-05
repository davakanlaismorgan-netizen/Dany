import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, Eye, EyeOff, Building2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

export default function RegisterPage() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agree, setAgree] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) {
      setError(t('auth.register.terms') + ' ' + t('auth.register.terms.terms'));
      return;
    }
    setError('');
    setLoading(true);
    const { error: err, needsEmailConfirmation } = await signUp(email, password, fullName, company);
    setLoading(false);
    if (err) {
      setError(err);
    } else if (needsEmailConfirmation) {
      setConfirmationSent(true);
    } else {
      navigate('/dashboard');
    }
  };

  if (confirmationSent) {
    return (
      <div>
        <div role="status" className="flex items-start gap-3 p-4 rounded-xl bg-forest-50 border border-forest-200">
          <CheckCircle2 className="w-5 h-5 text-forest-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-forest-900">{t('auth.register.confirm.title')}</h2>
            <p className="mt-1 text-sm text-forest-800">{t('auth.register.confirm.desc')}</p>
          </div>
        </div>
        <Link to="/auth/login" className="mt-6 inline-block text-sm text-savanna-600 hover:text-savanna-700 font-semibold">
          {t('auth.register.signin')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-display font-bold text-neutral-900">{t('auth.register.title')}</h2>
      <p className="mt-2 text-sm text-neutral-500">{t('auth.register.subtitle')}</p>

      {error && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-clay-50 border border-clay-200 text-clay-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('auth.register.fullname')}</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="input-field pl-10"
              placeholder="Aminata Diallo"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('auth.register.email')}</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field pl-10"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('auth.register.company')} <span className="text-neutral-400">{t('auth.register.company.optional')}</span></label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="input-field pl-10"
              placeholder={t('auth.register.company')}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('auth.register.password')}</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="input-field pl-10 pr-10"
              placeholder={t('auth.register.password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="rounded border-neutral-300 text-savanna-600 focus:ring-savanna-400 mt-0.5"
          />
          {t('auth.register.terms')}{' '}
          <a href="#" className="text-savanna-600 hover:text-savanna-700 font-medium">{t('auth.register.terms.terms')}</a> {t('auth.register.terms.and')}{' '}
          <a href="#" className="text-savanna-600 hover:text-savanna-700 font-medium">{t('auth.register.terms.privacy')}</a>
        </label>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t('auth.register.creating') : t('auth.register.button')}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        {t('auth.register.haveaccount')}{' '}
        <Link to="/auth/login" className="text-savanna-600 hover:text-savanna-700 font-semibold">
          {t('auth.register.signin')}
        </Link>
      </p>
    </div>
  );
}
