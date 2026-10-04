import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Crown, Building2, CreditCard, Smartphone, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { openPaymentWidget, verifyTransaction } from '@/lib/kkiapay';

export default function PricingPage() {
  const { t, lang } = useI18n();
  const { user, refreshProfile } = useAuth();
  const [paying, setPaying] = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');

  const plans = [
    {
      name: t('pricing.free'), icon: Zap, price: '$0', period: t('pricing.forever'), desc: t('pricing.free.desc'),
      planKey: 'free', amount: 0,
      features: lang === 'fr'
        ? ['3 projets maximum', '10 000 lignes par jeu de données', '5 visualisations', 'AutoML de base (3 modèles)', 'Support communautaire', 'Marque Danysia sur les exports']
        : ['Up to 3 projects', 'Max 10,000 rows per dataset', '5 visualizations', 'Basic AutoML (3 model types)', 'Community support', 'Danysia branding on exports'],
      cta: t('pricing.startfree'), highlight: false, color: 'neutral',
    },
    {
      name: t('pricing.premium'), icon: Crown, price: '$29', period: t('pricing.month'), desc: t('pricing.premium.desc'),
      planKey: 'premium', amount: 2900,
      features: lang === 'fr'
        ? ['Projets et jeux de données illimités', 'AutoML complet', 'Tous les modules sectoriels', 'PNT avancée & multilingue', 'Accès API', 'Rapports white-label', 'Collaboration équipe (10 utilisateurs)', 'Support prioritaire']
        : ['Unlimited projects and datasets', 'Full AutoML suite', 'All sector-specific modules', 'Advanced NLP & multilingual support', 'API access', 'White-label reports', 'Priority support', 'Team collaboration (up to 10 users)'],
      cta: t('pricing.trial.btn'), highlight: true, color: 'savanna',
    },
    {
      name: t('pricing.enterprise'), icon: Building2, price: lang === 'fr' ? 'Sur mesure' : 'Custom', period: '', desc: t('pricing.enterprise.desc'),
      planKey: 'enterprise', amount: 0,
      features: lang === 'fr'
        ? ['Tout du plan Premium', 'Intégrations personnalisées', 'Déploiement on-premise', 'Support dédié', 'Modèles linguistiques africains personnalisés', 'Garanties SLA', 'Membres illimités', 'Tarification personnalisée']
        : ['Everything in Premium', 'Custom integrations', 'On-premise deployment option', 'Dedicated support', 'Custom African language models', 'SLA guarantees', 'Unlimited team members', 'Custom pricing'],
      cta: t('pricing.contact'), highlight: false, color: 'ocean',
    },
  ];

  const paymentMethods = lang === 'fr'
    ? [
        { name: 'MTN MoMo', desc: 'MTN Mobile Money', icon: Smartphone },
        { name: 'Orange Money', desc: 'Orange Mobile Money', icon: Smartphone },
        { name: 'Wave', desc: 'Transfert Wave', icon: Smartphone },
        { name: 'Airtel Money', desc: 'Airtel Mobile Money', icon: Smartphone },
        { name: 'Visa / Mastercard', desc: 'Carte de crédit / débit', icon: CreditCard },
      ]
    : [
        { name: 'MTN MoMo', desc: 'MTN Mobile Money', icon: Smartphone },
        { name: 'Orange Money', desc: 'Orange Mobile Money', icon: Smartphone },
        { name: 'Wave', desc: 'Wave Transfer', icon: Smartphone },
        { name: 'Airtel Money', desc: 'Airtel Mobile Money', icon: Smartphone },
        { name: 'Visa / Mastercard', desc: 'Credit / Debit Card', icon: CreditCard },
      ];

  const faqs = lang === 'fr' ? [
    { q: 'Puis-je changer de plan à tout moment ?', a: 'Oui, vous pouvez changer de plan à tout moment. Les changements prennent effet immédiatement et la facturation est proratisée.' },
    { q: 'Quels moyens de paiement sont acceptés ?', a: 'Nous acceptons le mobile money (MTN, Orange, Wave, Airtel) et les cartes bancaires (Visa, Mastercard) via Kkiapay.' },
    { q: 'Y a-t-il un essai gratuit pour Premium ?', a: 'Oui, Premium inclut un essai gratuit de 14 jours sans carte bancaire. Vous pouvez annuler à tout moment.' },
    { q: 'Proposez-vous des réductions pour les startups africaines ?', a: 'Oui, nous offrons une tarification spéciale pour les startups africaines et les ONG. Contactez notre équipe commerciale.' },
    { q: 'Puis-je exporter mes données si j\'annule ?', a: 'Absolument. Vos données vous appartiennent toujours. Vous pouvez exporter tous vos jeux de données, modèles et rapports à tout moment.' },
  ] : [
    { q: 'Can I switch plans at any time?', a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately and we prorate the billing.' },
    { q: 'What payment methods are supported?', a: 'We support mobile money (MTN, Orange, Wave, Airtel) and credit/debit cards (Visa, Mastercard) via Kkiapay.' },
    { q: 'Is there a free trial for Premium?', a: 'Yes, Premium includes a 14-day free trial with no credit card required. You can cancel anytime.' },
    { q: 'Do you offer discounts for African startups?', a: 'Yes, we offer special pricing for early-stage African startups and NGOs. Contact our sales team for details.' },
    { q: 'Can I export my data if I cancel?', a: 'Absolutely. Your data is always yours. You can export all datasets, models, and reports at any time.' },
  ];

  const handlePay = (plan: typeof plans[1]) => {
    if (plan.planKey === 'free') return;
    if (plan.planKey === 'enterprise') return;

    setPaying(plan.planKey);
    setPayStatus('idle');

    openPaymentWidget({
      amount: plan.amount,
      plan: plan.planKey,
      email: user?.email,
      fullname: user?.user_metadata?.full_name as string | undefined,
      onSuccess: async (transactionId) => {
        setPayStatus('verifying');
        try {
          await verifyTransaction(transactionId, plan.planKey);
          await refreshProfile();
          setPayStatus('success');
        } catch {
          setPayStatus('error');
        }
        setPaying(null);
      },
      onFailed: () => {
        setPayStatus('error');
        setPaying(null);
      },
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <nav className="sticky top-0 z-50 glass border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-xl">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span>Danysia</span>
          </Link>
          <Link to="/" className="btn-ghost text-sm">{t('pricing.back')}</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-neutral-900">{t('pricing.title')}</h1>
        <p className="mt-4 text-lg text-neutral-600">{t('pricing.subtitle')}</p>
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-savanna-50 border border-savanna-200 text-savanna-700 text-sm">
          <Zap className="w-4 h-4" />
          {t('pricing.trial')}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isFree = plan.planKey === 'free';
            const isEnterprise = plan.planKey === 'enterprise';
            const isPaying = paying === plan.planKey;
            return (
              <div key={plan.name} className={cn('card p-8 relative', plan.highlight && 'border-savanna-400 shadow-xl ring-1 ring-savanna-400/20 scale-[1.02]')}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-savanna-600 text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">
                    {t('pricing.popular')}
                  </div>
                )}
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                  plan.color === 'savanna' && 'bg-savanna-50 text-savanna-600',
                  plan.color === 'ocean' && 'bg-ocean-50 text-ocean-600',
                  plan.color === 'neutral' && 'bg-neutral-100 text-neutral-600',
                )}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
                <p className="text-sm text-neutral-500 mt-1">{plan.desc}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-display font-bold text-neutral-900">{plan.price}</span>
                  <span className="text-neutral-500">{plan.period}</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-neutral-700">
                      <Check className="w-4 h-4 text-forest-600 shrink-0 mt-0.5" />
                      {feat}
                    </li>
                  ))}
                </ul>

                {isFree ? (
                  <Link to="/auth/register" className={cn('mt-8 w-full text-center block', plan.highlight ? 'btn-primary' : 'btn-secondary')}>
                    {plan.cta}
                  </Link>
                ) : isEnterprise ? (
                  <a href="mailto:sales@danysia.com" className={cn('mt-8 w-full text-center block', plan.highlight ? 'btn-primary' : 'btn-secondary')}>
                    {plan.cta}
                  </a>
                ) : (
                  <button
                    onClick={() => handlePay(plan)}
                    disabled={isPaying || payStatus === 'verifying'}
                    className={cn('mt-8 w-full flex items-center justify-center gap-2', plan.highlight ? 'btn-primary' : 'btn-secondary')}
                  >
                    {isPaying && payStatus === 'idle' && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('pricing.pay.now')}...
                      </>
                    )}
                    {payStatus === 'verifying' && (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('pricing.pay.verifying')}
                      </>
                    )}
                    {payStatus !== 'verifying' && !isPaying && t('pricing.pay.now')}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {payStatus === 'success' && (
          <div className="max-w-5xl mx-auto mt-6 p-4 rounded-xl bg-forest-50 border border-forest-200 flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="w-5 h-5 text-forest-600 shrink-0" />
            <p className="text-sm text-forest-800">{t('pricing.pay.success')}</p>
          </div>
        )}
        {payStatus === 'error' && (
          <div className="max-w-5xl mx-auto mt-6 p-4 rounded-xl bg-clay-50 border border-clay-200 flex items-center gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 text-clay-600 shrink-0" />
            <p className="text-sm text-clay-700">{t('pricing.pay.failed')}</p>
          </div>
        )}
      </div>

      <div className="bg-neutral-50 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl font-display font-bold text-neutral-900 mb-2">{t('pricing.payments.title')}</h2>
          <p className="text-neutral-600 mb-8">{t('pricing.payments.subtitle')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {paymentMethods.map((pm) => {
              const Icon = pm.icon;
              return (
                <div key={pm.name} className="card p-4 flex flex-col items-center gap-2">
                  <Icon className="w-6 h-6 text-savanna-600" />
                  <div className="text-sm font-semibold text-neutral-800">{pm.name}</div>
                  <div className="text-xs text-neutral-400">{pm.desc}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs text-neutral-400">Powered by Kkiapay</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-display font-bold text-neutral-900 text-center mb-8">{t('pricing.faq.title')}</h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <div key={faq.q} className="card p-5">
              <h3 className="font-semibold text-neutral-900 mb-2">{faq.q}</h3>
              <p className="text-sm text-neutral-600">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gradient-hero text-white py-16 text-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h2 className="text-3xl font-display font-bold mb-4">{t('pricing.cta.title')}</h2>
          <p className="text-white/70 mb-8">{t('pricing.cta.subtitle')}</p>
          <Link to="/auth/register" className="inline-flex items-center gap-2 bg-white text-savanna-700 font-semibold px-8 py-3.5 rounded-xl hover:bg-neutral-100 transition-all">
            {t('pricing.cta.button')}
          </Link>
        </div>
      </div>
    </div>
  );
}
