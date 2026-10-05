import { type ReactNode } from 'react';
import { LogoMark } from '@/components/LogoMark';
import { Link } from 'react-router-dom';
import { Brain, BarChart3, Database, Sparkles } from 'lucide-react';
import { useI18n, type Language } from '@/context/I18nContext';
import { cn } from '@/lib/utils';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-hero relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-savanna-500 blur-3xl animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-forest-500 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <LogoMark className="w-9 h-9" />
            DAS
          </Link>

          <div className="space-y-8">
            <h1 className="text-4xl font-display font-bold leading-tight">
              {t('auth.brand.title')}
            </h1>
            <p className="text-white/70 text-lg max-w-md">
              {t('auth.brand.subtitle')}
            </p>

            <div className="grid grid-cols-2 gap-4 max-w-md">
              {[
                { icon: Sparkles, label: lang === 'fr' ? 'AutoML No-Code' : 'No-Code AutoML' },
                { icon: Database, label: lang === 'fr' ? 'Données Multi-Sources' : 'Multi-Source Data' },
                { icon: BarChart3, label: lang === 'fr' ? 'Tableaux de Bord' : 'Interactive Dashboards' },
                { icon: Brain, label: lang === 'fr' ? 'Assistant IA' : 'AI Assistant' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-2 text-sm text-white/80">
                  <f.icon className="w-4 h-4 text-savanna-400" />
                  {f.label}
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/40 text-sm">
            {t('auth.brand.trusted')}
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-6 lg:hidden">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg">
            <LogoMark className="w-8 h-8" />
            DAS
          </Link>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>

        <div className="hidden lg:flex justify-end p-6">
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">{children}</div>
        </div>
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
