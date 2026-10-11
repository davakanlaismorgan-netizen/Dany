import { Link, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useI18n } from '@/context/I18nContext';
import { COMPANY_ADDRESS, COMPANY_NAME, COMPANY_REGISTRATION, CONTACT_EMAIL, LEGAL_REVIEWED } from '@/lib/config';
import { getLegalDoc, isLegalSlug, LEGAL_SLUGS } from '@/lib/legalContent';
import NotFoundPage from '@/pages/NotFoundPage';

export default function LegalPage() {
  const { slug } = useParams();
  const { t, lang, setLang } = useI18n();
  if (!isLegalSlug(slug)) return <NotFoundPage />;

  const doc = getLegalDoc(slug, lang, {
    company: COMPANY_NAME ?? 'DAS',
    address: COMPANY_ADDRESS,
    registration: COMPANY_REGISTRATION,
    email: CONTACT_EMAIL,
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo />
          <button type="button" onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            {lang === 'fr' ? 'EN' : 'FR'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {!LEGAL_REVIEWED && (
          <div role="note" className="mb-8 flex items-start gap-3 p-4 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-800">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{t('legal.draft')}</p>
          </div>
        )}
        <h1 className="text-3xl font-display font-bold text-neutral-900">{doc.title}</h1>
        {doc.sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-lg font-semibold text-neutral-900">{s.heading}</h2>
            {s.paragraphs.map((p) => (
              <p key={p} className="mt-2 text-neutral-700 leading-relaxed">{p}</p>
            ))}
          </section>
        ))}
      </main>

      <footer className="border-t border-neutral-200">
        <nav aria-label={t('landing.footer.legal')} className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {LEGAL_SLUGS.map((s) => (
            <Link key={s} to={`/legal/${s}`} aria-current={s === slug ? 'page' : undefined} className={s === slug ? 'font-semibold text-neutral-900' : 'text-neutral-500 hover:text-neutral-900'}>
              {t(`legal.${s}`)}
            </Link>
          ))}
          <Link to="/" className="ml-auto text-savanna-600 hover:text-savanna-700 font-medium">{t('legal.home')}</Link>
        </nav>
      </footer>
    </div>
  );
}
