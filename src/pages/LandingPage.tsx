import { LogoMark } from '@/components/LogoMark';
import { formatXof, PREMIUM_PRICE_XOF } from '@/lib/plans';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  BarChart3,
  Database,
  Sparkles,
  Workflow,
  Globe,
  Zap,
  MessageSquare,
  Check,
  ArrowRight,
  Menu,
  X,
  Landmark,
  ShoppingBag,
  Sprout,
  HeartPulse,
  Truck,
} from 'lucide-react';
import { useI18n, type Language } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export function LandingPage() {
  const { lang, setLang, t } = useI18n();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const sectors = [
    { icon: Landmark, name: t('sector.finance.full'), color: 'savanna', descKey: 'sector.finance.desc', features: [
      { en: 'Alternative data credit scoring', fr: 'Scoring crédit avec données alternatives' },
      { en: 'Loan default prediction', fr: 'Prédiction de défaut de prêt' },
      { en: 'MoMo transaction analysis', fr: 'Analyse transactions MoMo' },
      { en: 'FX rate forecasting (XOF, NGN, KES)', fr: 'Prévision taux de change (XOF, NGN, KES)' },
    ]},
    { icon: ShoppingBag, name: t('sector.commerce.full'), color: 'gold', descKey: 'sector.commerce.desc', features: [
      { en: 'Ramadan & harvest-aware forecasting', fr: 'Prévision Ramadan & récoltes' },
      { en: 'Inventory optimization', fr: 'Optimisation des stocks' },
      { en: 'Informal market segmentation', fr: 'Segmentation marchés informels' },
      { en: 'Dynamic pricing', fr: 'Tarification dynamique' },
    ]},
    { icon: Sprout, name: t('sector.agriculture.full'), color: 'forest', descKey: 'sector.agriculture.desc', features: [
      { en: 'Crop yield prediction', fr: 'Prédiction des rendements' },
      { en: 'Rainfall & temperature integration', fr: 'Intégration pluie & température' },
      { en: 'Commodity price forecasting', fr: 'Prévision prix des matières' },
      { en: 'Soil analytics', fr: 'Analyse des sols' },
    ]},
    { icon: HeartPulse, name: t('sector.healthcare.full'), color: 'clay', descKey: 'sector.healthcare.desc', features: [
      { en: 'Outbreak prediction', fr: 'Prédiction d\'épidémies' },
      { en: 'Patient data analytics', fr: 'Analyse données patients' },
      { en: 'Resource allocation', fr: 'Allocation des ressources' },
      { en: 'Supply optimization', fr: 'Optimisation des fournitures' },
    ]},
    { icon: Truck, name: t('sector.logistics.full'), color: 'ocean', descKey: 'sector.logistics.desc', features: [
      { en: 'Route optimization', fr: 'Optimisation des itinéraires' },
      { en: 'Demand forecasting', fr: 'Prévision de la demande' },
      { en: 'Supplier risk scoring', fr: 'Score de risque fournisseur' },
      { en: 'Fleet analytics', fr: 'Analyse de flotte' },
    ]},
  ];

  const sectorDescs: Record<string, { en: string; fr: string }> = {
    'sector.finance.desc': { en: 'Credit scoring for unbanked populations, mobile money analytics, currency forecasting.', fr: 'Scoring crédit pour les non-bancarisés, analyse mobile money, prévision des devises.' },
    'sector.commerce.desc': { en: 'Sales forecasting with African seasonality, inventory optimization, price optimization.', fr: 'Prévision des ventes avec saisonnalité africaine, optimisation des stocks et des prix.' },
    'sector.agriculture.desc': { en: 'Crop yield prediction, weather integration, commodity price forecasting.', fr: 'Prédiction des rendements, intégration météo, prévision des prix agricoles.' },
    'sector.healthcare.desc': { en: 'Disease outbreak prediction, patient analytics, clinic resource optimization.', fr: 'Prédiction d\'épidémies, analyse patients, optimisation des ressources de cliniques.' },
    'sector.logistics.desc': { en: 'Route optimization, demand forecasting, supplier risk analysis.', fr: 'Optimisation des itinéraires, prévision de la demande, analyse des risques fournisseurs.' },
  };

  const features = [
    { icon: Workflow, title: t('landing.feature.nocode.title'), desc: t('landing.feature.nocode.desc') },
    { icon: Sparkles, title: t('landing.feature.automl.title'), desc: t('landing.feature.automl.desc') },
    { icon: Database, title: t('landing.feature.data.title'), desc: t('landing.feature.data.desc') },
    { icon: BarChart3, title: t('landing.feature.dash.title'), desc: t('landing.feature.dash.desc') },
    { icon: MessageSquare, title: t('landing.feature.ai.title'), desc: t('landing.feature.ai.desc') },
    { icon: Globe, title: t('landing.feature.africa.title'), desc: t('landing.feature.africa.desc') },
  ];

  const plans = [
    {
      name: t('pricing.free'), price: formatXof(0, lang), period: t('pricing.forever'), desc: t('pricing.free.desc'),
      features: lang === 'fr' ? ['3 projets', '10K lignes par jeu de données', '5 visualisations', 'AutoML de base (3 modèles)', 'Support communautaire', 'Marque DAS'] : ['3 projects', '10K rows per dataset', '5 visualizations', 'Basic AutoML (3 models)', 'Community support', 'DAS branding'],
      cta: t('pricing.startfree'), highlight: false,
    },
    {
      name: t('pricing.premium'), price: formatXof(PREMIUM_PRICE_XOF, lang), period: t('pricing.month'), desc: t('pricing.premium.desc'),
      features: lang === 'fr' ? ['Projets illimités', 'AutoML complet', 'Tous les modules sectoriels', 'PNT avancée & multilingue', 'Accès API', 'Rapports white-label', 'Collaboration équipe (10 utilisateurs)', 'Support prioritaire'] : ['Unlimited projects', 'Full AutoML suite', 'All sector modules', 'Advanced NLP & multilingual', 'API access', 'White-label reports', 'Team collaboration (10 users)', 'Priority support'],
      cta: t('pricing.trial.btn'), highlight: true,
    },
    {
      name: t('pricing.enterprise'), price: lang === 'fr' ? 'Sur mesure' : 'Custom', period: '', desc: t('pricing.enterprise.desc'),
      features: lang === 'fr' ? ['Intégrations personnalisées', 'Déploiement on-premise', 'Modèles linguistiques personnalisés', 'Support dédié', 'Garanties SLA', 'Tarification personnalisée'] : ['Custom integrations', 'On-premise deployment', 'Custom language models', 'Dedicated support', 'SLA guarantees', 'Custom pricing'],
      cta: t('pricing.contact'), highlight: false,
    },
  ];

  const steps = [
    { step: '01', icon: Database, title: t('landing.howitworks.step1.title'), desc: t('landing.howitworks.step1.desc') },
    { step: '02', icon: Workflow, title: t('landing.howitworks.step2.title'), desc: t('landing.howitworks.step2.desc') },
    { step: '03', icon: Sparkles, title: t('landing.howitworks.step3.title'), desc: t('landing.howitworks.step3.desc') },
    { step: '04', icon: BarChart3, title: t('landing.howitworks.step4.title'), desc: t('landing.howitworks.step4.desc') },
  ];

  const stats = [
    { label: t('landing.stats.ml'), value: '50+' },
    { label: t('landing.stats.langs'), value: '6' },
    { label: t('landing.stats.sectors'), value: '5' },
    { label: t('landing.stats.sources'), value: '10+' },
  ];

  const footerCols = lang === 'fr'
    ? [
        { title: t('landing.footer.product'), links: ['Fonctionnalités', 'Tarifs', 'Marketplace', 'Docs API'] },
        { title: t('landing.footer.company'), links: ['À propos', 'Blog', 'Carrières', 'Contact'] },
        { title: t('landing.footer.legal'), links: ['Confidentialité', 'Conditions', 'Sécurité', 'Conformité'] },
      ]
    : [
        { title: t('landing.footer.product'), links: ['Features', 'Pricing', 'Marketplace', 'API Docs'] },
        { title: t('landing.footer.company'), links: ['About', 'Blog', 'Careers', 'Contact'] },
        { title: t('landing.footer.legal'), links: ['Privacy', 'Terms', 'Security', 'Compliance'] },
      ];

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 glass border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <LogoMark className="w-9 h-9" />
            <span className="text-neutral-900">DAS</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="nav-link">{t('nav.features')}</a>
            <a href="#sectors" className="nav-link">{t('nav.sectors')}</a>
            <Link to="/pricing" className="nav-link">{t('nav.pricing')}</Link>
            <Link to="/marketplace" className="nav-link">{t('nav.marketplace')}</Link>
          </div>

          <div className="flex items-center gap-3">
            <LangSwitcher lang={lang} setLang={setLang} />
            {user ? (
              <Link to="/dashboard" className="btn-primary text-sm hidden sm:flex">{t('app.dashboard')}</Link>
            ) : (
              <>
                <Link to="/auth/login" className="nav-link text-sm hidden sm:block">{t('nav.signin')}</Link>
                <Link to="/auth/register" className="btn-primary text-sm hidden sm:flex">{t('nav.getstarted')}</Link>
              </>
            )}
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 -mr-2">
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-neutral-200 px-4 py-4 space-y-3">
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block nav-link">{t('nav.features')}</a>
            <a href="#sectors" onClick={() => setMobileMenuOpen(false)} className="block nav-link">{t('nav.sectors')}</a>
            <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="block nav-link">{t('nav.pricing')}</Link>
            <Link to="/marketplace" onClick={() => setMobileMenuOpen(false)} className="block nav-link">{t('nav.marketplace')}</Link>
            {!user && (
              <div className="pt-3 border-t border-neutral-200 space-y-2">
                <Link to="/auth/login" className="block btn-secondary w-full">{t('nav.signin')}</Link>
                <Link to="/auth/register" className="block btn-primary w-full">{t('nav.getstarted')}</Link>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-hero opacity-95" />
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-20 left-1/4 w-72 h-72 rounded-full bg-savanna-500 blur-3xl animate-float" />
          <div className="absolute bottom-10 right-1/4 w-96 h-96 rounded-full bg-forest-500 blur-3xl animate-float" style={{ animationDelay: '3s' }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white/90 text-sm mb-6 animate-fade-in">
            <Zap className="w-4 h-4 text-gold-400" />
            {t('hero.badge')}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white leading-tight max-w-4xl mx-auto animate-slide-up">
            {t('hero.title')}
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-white/70 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.1s' }}>
            {t('hero.subtitle2')}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/auth/register" className="btn-primary text-base px-8 py-3.5">
              {t('hero.cta')}
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/10 transition-all">
              {t('hero.demo')}
            </a>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-display font-bold text-gradient-savanna">{stat.value}</div>
                <div className="text-sm text-white/60 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted by */}
      <section className="py-12 bg-neutral-50 border-y border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <p className="text-center text-sm text-neutral-500 mb-6">
            {t('landing.trusted')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 text-neutral-400 font-display font-bold text-lg">
            <span>Ecobank</span>
            <span>MTN Group</span>
            <span>Jumia</span>
            <span>Orange</span>
            <span>Wave</span>
            <span>Flutterwave</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
              {t('landing.features.title')}
            </h2>
            <p className="mt-4 text-lg text-neutral-600">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card card-hover p-6">
                <div className="w-12 h-12 rounded-xl bg-savanna-50 flex items-center justify-center mb-4">
                  <f.icon className="w-6 h-6 text-savanna-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">{f.title}</h3>
                <p className="text-sm text-neutral-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section id="sectors" className="py-24 bg-neutral-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-savanna-500 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-forest-500 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">
              {t('landing.sectors.title')}
            </h2>
            <p className="mt-4 text-lg text-white/60">
              {t('landing.sectors.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sectors.map((s) => (
              <div
                key={s.name}
                className="group rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/10 transition-all duration-200 hover:-translate-y-1"
              >
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors',
                  s.color === 'savanna' && 'bg-savanna-500/20 text-savanna-400',
                  s.color === 'gold' && 'bg-gold-500/20 text-gold-400',
                  s.color === 'forest' && 'bg-forest-500/20 text-forest-400',
                  s.color === 'clay' && 'bg-clay-500/20 text-clay-400',
                  s.color === 'ocean' && 'bg-ocean-500/20 text-ocean-400',
                )}>
                  <s.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{s.name}</h3>
                <p className="text-sm text-white/60 mb-4">{sectorDescs[s.descKey]?.[lang]}</p>
                <ul className="space-y-2">
                  {s.features.map((feat) => (
                    <li key={feat.en} className="flex items-start gap-2 text-sm text-white/70">
                      <Check className="w-4 h-4 text-forest-400 shrink-0 mt-0.5" />
                      {feat[lang]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
              {t('landing.howitworks.title')}
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={s.step} className="relative">
                {i < 3 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-full h-0.5 border-t-2 border-dashed border-neutral-300" />
                )}
                <div className="card p-6 relative z-10">
                  <div className="text-xs font-mono font-bold text-savanna-500 mb-3">{s.step}</div>
                  <div className="w-10 h-10 rounded-lg bg-savanna-50 flex items-center justify-center mb-3">
                    <s.icon className="w-5 h-5 text-savanna-600" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1">{s.title}</h3>
                  <p className="text-sm text-neutral-600">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section id="pricing" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-neutral-900">
              {t('landing.pricing.title')}
            </h2>
            <p className="mt-4 text-lg text-neutral-600">
              {t('landing.pricing.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((p) => (
              <div
                key={p.name}
                className={cn(
                  'card p-8 relative',
                  p.highlight && 'border-savanna-400 shadow-lg ring-1 ring-savanna-400/20'
                )}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-savanna-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    {t('pricing.popular')}
                  </div>
                )}
                <h3 className="text-lg font-semibold text-neutral-900">{p.name}</h3>
                <p className="text-sm text-neutral-500 mt-1">{p.desc}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-display font-bold text-neutral-900">{p.price}</span>
                  <span className="text-neutral-500">{p.period}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-neutral-700">
                      <Check className="w-4 h-4 text-forest-600 shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth/register"
                  className={cn(
                    'mt-8 w-full text-center',
                    p.highlight ? 'btn-primary' : 'btn-secondary'
                  )}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-neutral-500">
              {t('landing.pricing.methods')}{' '}
              <span className="font-medium text-neutral-700">Stripe, MTN MoMo, Orange Money, Wave, Airtel Money</span>
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-gradient-hero text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-savanna-500 blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold">
            {t('landing.cta.title')}
          </h2>
          <p className="mt-4 text-lg text-white/70">
            {t('landing.cta.subtitle')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth/register" className="btn-primary text-base px-8 py-3.5">
              {t('landing.cta.button')}
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link to="/pricing" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/10 transition-all">
              {t('landing.cta.viewpricing')}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-neutral-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 font-display font-bold text-xl mb-3">
                <LogoMark className="w-9 h-9" />
                DAS
              </div>
              <p className="text-sm text-white/50">
                {t('landing.footer.desc')}
              </p>
            </div>

            {footerCols.map((col) => (
              <div key={col.title}>
                <h4 className="font-semibold text-sm mb-3">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="text-sm text-white/50 hover:text-white transition-colors">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-white/40">© 2026 DAS. {lang === 'fr' ? 'Tous droits réservés.' : 'All rights reserved.'}</p>
            <div className="flex items-center gap-4 text-sm text-white/40">
              <span>EN · FR · AR · SW</span>
            </div>
          </div>
        </div>
      </footer>
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
