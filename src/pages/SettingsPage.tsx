import { useState } from 'react';
import {
  User, Building2, Mail, Phone, Globe, CreditCard, Users,
  Bell, Shield, Save, Check, Crown, Zap, Plus, Trash2,
  Lock, LogOut, AlertTriangle, Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useI18n, type Language } from '@/context/I18nContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useCheckout } from '@/hooks/useCheckout';
import { CheckoutBanner } from '@/components/CheckoutBanner';
import { formatXof, PREMIUM_PRICE_XOF } from '@/lib/plans';

const tabs = [
  { id: 'profile', labelKey: 'settings.profile', icon: User },
  { id: 'billing', labelKey: 'settings.billing', icon: CreditCard },
  { id: 'team', labelKey: 'settings.team', icon: Users },
  { id: 'notifications', labelKey: 'settings.notifications', icon: Bell },
  { id: 'security', labelKey: 'settings.security', icon: Shield },
];

const notifItems = [
  { key: 'model', labelKey: 'settings.notif.model', descKey: 'settings.notif.model.desc', channels: ['Email', 'WhatsApp'] },
  { key: 'report', labelKey: 'settings.notif.report', descKey: 'settings.notif.report.desc', channels: ['Email'] },
  { key: 'data', labelKey: 'settings.notif.data', descKey: 'settings.notif.data.desc', channels: ['Email', 'WhatsApp'] },
  { key: 'weekly', labelKey: 'settings.notif.weekly', descKey: 'settings.notif.weekly.desc', channels: ['Email'] },
  { key: 'team', labelKey: 'settings.notif.team', descKey: 'settings.notif.team.desc', channels: ['Email'] },
];

const countries = [
  { code: 'SN', label: 'Senegal' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'KE', label: 'Kenya' },
  { code: 'GH', label: 'Ghana' },
  { code: 'CI', label: 'Ivory Coast' },
  { code: 'ZA', label: 'South Africa' },
  { code: 'EG', label: 'Egypt' },
  { code: 'MA', label: 'Morocco' },
  { code: 'ET', label: 'Ethiopia' },
  { code: 'TZ', label: 'Tanzania' },
];

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { profile, user, signOut, refreshProfile, planExpiresAt } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [company, setCompany] = useState(profile?.company || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [country, setCountry] = useState(profile?.country || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Delete account state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  // Notification prefs state
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    model: true, report: true, data: true, weekly: false, team: false,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const checkout = useCheckout();

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      company,
      phone,
      country,
      preferred_language: lang,
    }).eq('id', profile?.id);
    if (error) {
      setSaveError(lang === 'fr' ? 'Échec de l\'enregistrement. Réessayez.' : 'Failed to save. Please try again.');
    } else {
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError(t('auth.reset.tooshort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(lang === 'fr' ? 'Les mots de passe ne correspondent pas' : 'Passwords do not match');
      return;
    }
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete account');
      }
      await signOut();
      navigate('/');
    } catch {
      setDeleteError(true);
      setDeleting(false);
    }
  };

  const handleUpgrade = () => checkout.start({ phone: phone || undefined });

  const handleSaveNotifs = async () => {
    setNotifSaving(true);
    const { data: existing } = await supabase
      .from('notification_preferences')
      .select('id')
      .eq('user_id', profile?.id)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase.from('notification_preferences').update({
        model_training: notifPrefs.model,
        report_generated: notifPrefs.report,
        data_quality: notifPrefs.data,
        weekly_summary: notifPrefs.weekly,
        team_activity: notifPrefs.team,
      }).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('notification_preferences').insert({
        model_training: notifPrefs.model,
        report_generated: notifPrefs.report,
        data_quality: notifPrefs.data,
        weekly_summary: notifPrefs.weekly,
        team_activity: notifPrefs.team,
      }));
    }
    if (!error) {
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    }
    setNotifSaving(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-display font-bold text-neutral-900 mb-6">{t('settings.title')}</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-56 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                    activeTab === tab.id
                      ? 'bg-savanna-50 text-savanna-700'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <div className="card p-6 space-y-5 animate-fade-in">
              <div>
                <h2 className="font-semibold text-neutral-900">{t('settings.profile.title')}</h2>
                <p className="text-sm text-neutral-500 mt-1">{t('settings.profile.desc')}</p>
              </div>

              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-savanna-400 to-clay-500 flex items-center justify-center text-white font-bold text-xl">
                  {(fullName || user?.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <button className="btn-secondary text-sm">{t('settings.avatar')}</button>
                  <p className="text-xs text-neutral-400 mt-1">{t('settings.avatar.desc')}</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('settings.fullname')}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-field pl-10" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('settings.email')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input value={user?.email || ''} disabled className="input-field pl-10 bg-neutral-50 text-neutral-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('settings.company')}</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input value={company} onChange={(e) => setCompany(e.target.value)} className="input-field pl-10" placeholder="Your organization" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('settings.phone')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field pl-10" placeholder="+221 77 123 4567" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('settings.country')}</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <select value={country} onChange={(e) => setCountry(e.target.value)} className="input-field pl-10">
                      <option value="">{t('settings.country.select')}</option>
                      {countries.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('settings.language')}</label>
                  <div className="flex items-center bg-neutral-100 rounded-xl p-0.5 w-fit">
                    {(['fr', 'en'] as Language[]).map((l) => (
                      <button
                        key={l}
                        onClick={() => setLang(l)}
                        className={cn(
                          'px-4 py-2 text-sm font-semibold rounded-lg transition-all',
                          lang === l ? 'bg-white text-savanna-600 shadow-sm' : 'text-neutral-500'
                        )}
                      >
                        {l === 'fr' ? 'Français' : 'English'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-neutral-100">
                <button onClick={handleSave} disabled={saving} className="btn-primary">
                  {saving ? t('settings.saving') : t('settings.save')} {!saving && <Save className="w-4 h-4" />}
                </button>
                {saved && (
                  <span className="badge-forest animate-fade-in">
                    <Check className="w-3 h-3" /> {t('settings.saved')}
                  </span>
                )}
                {saveError && (
                  <span className="text-sm text-clay-600">{saveError}</span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-4 animate-fade-in">
              {/* Current plan */}
              <div className="card p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-neutral-900">{t('settings.currentplan')}</h2>
                    <p className="text-sm text-neutral-500 mt-1">{t('settings.currentplan.desc')}</p>
                  </div>
                  <span className={cn('badge', profile?.plan === 'free' ? 'badge-neutral' : 'badge-savanna')}>
                    {profile?.plan === 'free' && <Zap className="w-3 h-3" />}
                    {profile?.plan === 'premium' && <Crown className="w-3 h-3" />}
                    {(profile?.plan || 'free').charAt(0).toUpperCase() + (profile?.plan || 'free').slice(1)}
                  </span>
                </div>

                {profile?.plan === 'free' ? (
                  <div className="p-4 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 text-white">
                    <h3 className="font-semibold mb-1">{t('settings.upgrade.title')}</h3>
                    <p className="text-sm text-white/80 mb-3">{t('settings.upgrade.desc')}</p>
                    <button
                      onClick={handleUpgrade}
                      disabled={checkout.busy}
                      className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                    >
                      {checkout.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                      {checkout.status === 'verifying' ? t('pricing.pay.verifying') : t('pricing.pay.now')}
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-neutral-900 capitalize">{profile?.plan} Plan</p>
                        <p className="text-sm text-neutral-500">
                          {formatXof(PREMIUM_PRICE_XOF, lang)}{t('pricing.month')}
                          {planExpiresAt && ` · ${t('settings.plan.valid_until')} ${new Date(planExpiresAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US')}`}
                        </p>
                      </div>
                      <button onClick={handleUpgrade} disabled={checkout.busy} className="btn-secondary text-sm">
                        {checkout.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                        {t('settings.plan.renew')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {['success', 'failed', 'unverified', 'already_used'].includes(checkout.status) && (
                <CheckoutBanner status={checkout.status} reference={checkout.reference} onRetry={checkout.retry} />
              )}

            </div>
          )}

          {activeTab === 'team' && (
            <div className="card p-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-neutral-900">{t('settings.team.title')}</h2>
                  <p className="text-sm text-neutral-500 mt-1">{t('settings.team.desc')}</p>
                </div>
                <button className="btn-primary text-sm">
                  <Plus className="w-4 h-4" /> {t('settings.team.invite')}
                </button>
              </div>

              <div className="space-y-2">
                {[
                  { name: profile?.full_name || 'You', email: user?.email || '', role: 'Admin', status: 'active' },
                  { name: 'Aminata Diallo', email: 'aminata@example.com', role: 'Analyst', status: 'active' },
                  { name: 'Kwame Mensah', email: 'kwame@example.com', role: 'Viewer', status: 'pending' },
                ].map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-savanna-400 to-clay-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                      {m.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-800">{m.name}</p>
                      <p className="text-xs text-neutral-400 truncate">{m.email}</p>
                    </div>
                    <span className={cn('badge', m.role === 'Admin' ? 'badge-savanna' : m.role === 'Analyst' ? 'badge-ocean' : 'badge-neutral')}>
                      {m.role}
                    </span>
                    <span className={cn('badge', m.status === 'active' ? 'badge-forest' : 'badge-gold')}>
                      {m.status}
                    </span>
                    {i > 0 && (
                      <button className="btn-ghost p-2 text-clay-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {profile?.plan === 'free' && (
                <div className="mt-4 p-4 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-800">
                  {t('settings.upgrade.desc')}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="card p-6 animate-fade-in">
              <h2 className="font-semibold text-neutral-900 mb-1">{t('settings.notifications.title')}</h2>
              <p className="text-sm text-neutral-500 mb-4">{t('settings.notifications.desc')}</p>

              <div className="space-y-3">
                {notifItems.map((n) => (
                  <div key={n.key} className="flex items-start justify-between p-4 rounded-xl border border-neutral-200">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-neutral-800">{t(n.labelKey)}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{t(n.descKey)}</p>
                      <div className="flex gap-2 mt-2">
                        {n.channels.map((c) => (
                          <span key={c} className="badge-neutral">{c}</span>
                        ))}
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifPrefs[n.key]}
                        onChange={(e) => setNotifPrefs(prev => ({ ...prev, [n.key]: e.target.checked }))}
                        aria-label={t(n.labelKey)}
                        className="sr-only peer"
                      />
                      {/* Le curseur est un pseudo-élément : l'ancien enfant ne pouvait pas réagir à peer-checked (il ne bougeait pas) */}
                      <div className="relative w-11 h-6 bg-neutral-200 rounded-full peer-checked:bg-savanna-500 peer-focus-visible:ring-2 peer-focus-visible:ring-savanna-400 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow-sm after:transition-transform peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-4 mt-2 border-t border-neutral-100">
                <button onClick={handleSaveNotifs} disabled={notifSaving} className="btn-primary">
                  {notifSaving ? t('settings.saving') : t('settings.save')} {!notifSaving && <Save className="w-4 h-4" />}
                </button>
                {notifSaved && (
                  <span className="badge-forest animate-fade-in">
                    <Check className="w-3 h-3" /> {t('settings.saved')}
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4 animate-fade-in">
              <div className="card p-6">
                <h2 className="font-semibold text-neutral-900 mb-1">{t('settings.security.password')}</h2>
                <p className="text-sm text-neutral-500 mb-4">{t('settings.security.password.desc')}</p>
                <div className="space-y-3 max-w-md">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                      placeholder={t('settings.security.new')}
                      className="input-field pl-10"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                      placeholder={t('settings.security.confirm')}
                      className="input-field pl-10"
                    />
                  </div>
                  {passwordError && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-clay-50 border border-clay-200 text-sm text-clay-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {passwordError}
                    </div>
                  )}
                  {passwordSuccess && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-forest-50 border border-forest-200 text-sm text-forest-700">
                      <Check className="w-4 h-4 shrink-0" />
                      {lang === 'fr' ? 'Mot de passe mis à jour avec succès.' : 'Password updated successfully.'}
                    </div>
                  )}
                  <button
                    onClick={handleChangePassword}
                    disabled={passwordSaving || !newPassword || !confirmPassword}
                    className="btn-primary"
                  >
                    {passwordSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {t('settings.security.update')}
                  </button>
                </div>
              </div>

              <div className="card p-6">
                <h2 className="font-semibold text-neutral-900 mb-1">{t('settings.security.danger')}</h2>
                <p className="text-sm text-neutral-500 mb-4">{t('settings.security.danger.desc')}</p>
                {deleteError && <p role="alert" className="mb-3 text-sm text-clay-600">{t('settings.security.delete.error')}</p>}
                <div className="flex gap-3">
                  <button onClick={() => signOut()} className="btn-secondary text-clay-600 hover:bg-clay-50">
                    <LogOut className="w-4 h-4" /> {t('settings.security.signout')}
                  </button>
                  {!deleteConfirm ? (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="btn-secondary text-clay-600 hover:bg-clay-50 border-clay-200"
                    >
                      <Trash2 className="w-4 h-4" /> {t('settings.security.delete')}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                        className="btn-primary bg-clay-600 hover:bg-clay-700 border-clay-600"
                      >
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                        {t('common.delete')}
                      </button>
                      <button onClick={() => setDeleteConfirm(false)} className="btn-ghost text-sm">
                        {t('common.cancel')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
