import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  Sparkles,
  Store,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { useI18n, type Language } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', labelKey: 'app.dashboard', icon: LayoutDashboard },
  { path: '/projects', labelKey: 'app.projects', icon: FolderKanban },
  { path: '/assistant', labelKey: 'app.ai', icon: Sparkles },
  { path: '/marketplace', labelKey: 'app.marketplace', icon: Store },
  { path: '/settings', labelKey: 'app.settings', icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const { lang, setLang, t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname.startsWith(path);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-white border-r border-neutral-200 flex flex-col transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-5 border-b border-neutral-200">
          <Logo />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all',
                  isActive(item.path)
                    ? 'bg-savanna-50 text-savanna-700'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                )}
              >
                <Icon className="w-5 h-5" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        {/* Upgrade card */}
        {profile?.plan === 'free' && (
          <div className="p-4">
            <div className="rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 p-4 text-white">
              <p className="font-semibold text-sm mb-1">{t('app.upgrade.title')}</p>
              <p className="text-xs text-white/80 mb-3">{t('app.upgrade.desc')}</p>
              <Link
                to="/pricing"
                className="block text-center bg-white/20 hover:bg-white/30 rounded-lg py-2 text-xs font-semibold transition-colors"
              >
                {t('app.upgrade.button')}
              </Link>
            </div>
          </div>
        )}

        {/* User menu */}
        <div className="p-4 border-t border-neutral-200 relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-xl hover:bg-neutral-100 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-savanna-400 to-clay-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {(profile?.full_name || user?.email || '?')[0].toUpperCase()}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl border border-neutral-200 shadow-lg py-1 z-50">
                <Link
                  to="/settings"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100"
                >
                  <Settings className="w-4 h-4" /> {t('app.settings')}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-clay-600 hover:bg-neutral-100 w-full"
                >
                  <LogOut className="w-4 h-4" /> {t('settings.security.signout')}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-neutral-900/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (mobile) */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-neutral-200 px-4 h-14 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-neutral-600">
            <Menu className="w-6 h-6" />
          </button>
          <Logo className="text-lg" />
          <div className="flex items-center gap-2">
            <LangSwitcher lang={lang} setLang={setLang} />
          </div>
        </header>

        {/* Top bar (desktop) */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-200 px-6 h-14 items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <span className="badge-savanna">{t('app.plan')}: {profile?.plan || 'free'}</span>
          </div>
          <div className="flex items-center gap-3">
            <LangSwitcher lang={lang} setLang={setLang} />
            <Link to="/projects/new" className="btn-primary text-sm py-2 px-4">
              <FolderKanban className="w-4 h-4" /> {t('app.newproject')}
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function LangSwitcher({ lang, setLang }: { lang: Language; setLang: (l: Language) => void }) {
  return (
    <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
      {(['fr', 'en'] as Language[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
            lang === l ? 'bg-white text-savanna-600 shadow-sm' : 'text-neutral-500'
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
