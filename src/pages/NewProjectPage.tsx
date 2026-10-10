import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Landmark, ShoppingBag, Sprout, HeartPulse, Truck, Database,
  ArrowRight, ArrowLeft, Check, Upload, Link2, FileSpreadsheet,
  Cloud, Globe, AlertTriangle,
} from 'lucide-react';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';
import type { Sector } from '@/types';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

export function NewProjectPage() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sector, setSector] = useState<Sector>('general');
  const [dataSource, setDataSource] = useState('');
  const [selectedSample, setSelectedSample] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const steps = [t('newproject.step1'), t('newproject.step2'), t('newproject.step3')];

  const sectors: { value: Sector; label: string; icon: typeof Landmark; desc: string; color: string }[] = [
    { value: 'finance', label: t('sector.finance.full'), icon: Landmark, desc: lang === 'fr' ? 'Scoring crédit, détection de fraude, prévision des devises' : 'Credit scoring, fraud detection, currency forecasting', color: 'savanna' },
    { value: 'commerce', label: t('sector.commerce.full'), icon: ShoppingBag, desc: lang === 'fr' ? 'Prévision des ventes, stocks, segmentation client' : 'Sales forecasting, inventory, customer segmentation', color: 'gold' },
    { value: 'agriculture', label: t('sector.agriculture.full'), icon: Sprout, desc: lang === 'fr' ? 'Rendements, météo, prévision des prix agricoles' : 'Crop yield, weather, commodity price forecasting', color: 'forest' },
    { value: 'healthcare', label: t('sector.healthcare.full'), icon: HeartPulse, desc: lang === 'fr' ? 'Prédiction d\'épidémies, analyse patients, allocation des ressources' : 'Outbreak prediction, patient analytics, resource allocation', color: 'clay' },
    { value: 'logistics', label: t('sector.logistics.full'), icon: Truck, desc: lang === 'fr' ? 'Optimisation des itinéraires, prévision de la demande, risque fournisseur' : 'Route optimization, demand forecasting, supplier risk', color: 'ocean' },
    { value: 'general', label: t('sector.general.full'), icon: Database, desc: lang === 'fr' ? 'Projet flexible pour toute tâche data science' : 'Flexible project for any data science task', color: 'neutral' },
  ];

  const dataSources = [
    { id: 'csv', label: t('newproject.datasrc.csv'), icon: Upload, desc: t('newproject.datasrc.csv.desc') },
    { id: 'excel', label: t('newproject.datasrc.excel'), icon: FileSpreadsheet, desc: t('newproject.datasrc.excel.desc') },
    { id: 'api', label: t('newproject.datasrc.api'), icon: Link2, desc: t('newproject.datasrc.api.desc') },
    { id: 'database', label: t('newproject.datasrc.database'), icon: Database, desc: t('newproject.datasrc.database.desc') },
    { id: 'sheets', label: t('newproject.datasrc.sheets'), icon: Globe, desc: t('newproject.datasrc.sheets.desc') },
    { id: 'sample', label: t('newproject.datasrc.sample'), icon: Cloud, desc: t('newproject.datasrc.sample.desc') },
  ];

  const sampleDatasets = lang === 'fr' ? [
    { id: 'momo', name: 'Transactions Mobile Money', desc: 'Données MoMo anonymisées (Afrique de l\'Ouest)', rows: '45K' },
    { id: 'cocoa', name: 'Prix des matières premières ouest-africaines', desc: 'Cacao, huile de palme, manioc (2020-2026)', rows: '1.8K' },
    { id: 'fx', name: 'Taux de change des devises africaines', desc: 'XOF, XAF, NGN, KES, GHS, ZAR historiques', rows: '12K' },
    { id: 'rainfall', name: 'Précipitations par région africaine', desc: 'Données mensuelles de précipitations', rows: '8K' },
    { id: 'ecommerce', name: 'Ventes e-commerce africaines', desc: 'Exemple de données de transactions e-commerce', rows: '128K' },
  ] : [
    { id: 'momo', name: 'Mobile Money Transactions', desc: 'Anonymized MoMo transaction data (West Africa)', rows: '45K' },
    { id: 'cocoa', name: 'West African Commodity Prices', desc: 'Cocoa, palm oil, cassava prices (2020-2026)', rows: '1.8K' },
    { id: 'fx', name: 'African Currency Exchange Rates', desc: 'XOF, XAF, NGN, KES, GHS, ZAR historical', rows: '12K' },
    { id: 'rainfall', name: 'Rainfall by African Region', desc: 'Monthly rainfall data across regions', rows: '8K' },
    { id: 'ecommerce', name: 'African E-commerce Sales', desc: 'Sample e-commerce transaction data', rows: '128K' },
  ];

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name,
          description,
          sector,
          config: { data_source: dataSource || undefined, sample: selectedSample || undefined },
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        void logActivity('project.created', 'project', data.id, { name });
        navigate(`/projects/${data.id}/data`);
      }
    } catch (err) {
      setCreateError(friendlyError(err, lang === 'fr' ? 'Échec de la création du projet' : 'Failed to create project', t));
    } finally {
      setCreating(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return name.trim().length > 0;
    return true;
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <Link to="/projects" className="text-sm text-neutral-500 hover:text-neutral-700 flex items-center gap-1 mb-6">
        <ArrowLeft className="w-4 h-4" /> {t('newproject.back')}
      </Link>

      <h1 className="text-2xl font-display font-bold text-neutral-900 mb-2">{t('newproject.title')}</h1>
      <p className="text-neutral-500 mb-8">{t('newproject.subtitle')}</p>

      <div className="flex items-center mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                step > i + 1 ? 'bg-forest-600 text-white' : step === i + 1 ? 'bg-savanna-600 text-white' : 'bg-neutral-200 text-neutral-400'
              )}>
                {step > i + 1 ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={cn('text-sm font-medium hidden sm:block', step >= i + 1 ? 'text-neutral-900' : 'text-neutral-400')}>
                {s}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-4 transition-all', step > i + 1 ? 'bg-forest-600' : 'bg-neutral-200')} />
            )}
          </div>
        ))}
      </div>

      <div className="card p-6 lg:p-8">
        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('newproject.name')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder={t('newproject.name.placeholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">{t('newproject.description')} <span className="text-neutral-400">{t('newproject.description.optional')}</span></label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field resize-none" placeholder={t('newproject.description.placeholder')} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <p className="text-sm text-neutral-500 mb-4">{t('newproject.sector.subtitle')}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {sectors.map((s) => {
                const Icon = s.icon;
                return (
                  <button key={s.value} onClick={() => setSector(s.value)} className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                    sector === s.value ? 'border-savanna-400 bg-savanna-50' : 'border-neutral-200 hover:border-neutral-300'
                  )}>
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      s.color === 'savanna' && 'bg-savanna-100 text-savanna-600',
                      s.color === 'gold' && 'bg-gold-100 text-gold-600',
                      s.color === 'forest' && 'bg-forest-100 text-forest-600',
                      s.color === 'clay' && 'bg-clay-100 text-clay-600',
                      s.color === 'ocean' && 'bg-ocean-100 text-ocean-600',
                      s.color === 'neutral' && 'bg-neutral-100 text-neutral-600',
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900 text-sm">{s.label}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{s.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in space-y-6">
            <div>
              <p className="text-sm text-neutral-500 mb-4">{t('newproject.datasource.subtitle')}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {dataSources.map((src) => {
                  const Icon = src.icon;
                  return (
                    <button key={src.id} onClick={() => setDataSource(src.id)} className={cn(
                      'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                      dataSource === src.id ? 'border-savanna-400 bg-savanna-50' : 'border-neutral-200 hover:border-neutral-300'
                    )}>
                      <Icon className="w-5 h-5 text-savanna-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-neutral-900 text-sm">{src.label}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">{src.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {dataSource === 'sample' && (
              <div className="animate-slide-up">
                <h4 className="font-semibold text-neutral-900 mb-3">{t('newproject.sample.title')}</h4>
                <div className="space-y-2">
                  {sampleDatasets.map((ds) => (
                    <button key={ds.id} onClick={() => setSelectedSample(ds.id)} className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border-2 w-full text-left transition-all',
                      selectedSample === ds.id ? 'border-savanna-400 bg-savanna-50' : 'border-neutral-200 hover:border-neutral-300'
                    )}>
                      <div className="w-8 h-8 rounded-lg bg-ocean-50 flex items-center justify-center shrink-0">
                        <Database className="w-4 h-4 text-ocean-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-neutral-900 text-sm">{ds.name}</div>
                        <div className="text-xs text-neutral-500">{ds.desc}</div>
                      </div>
                      <span className="badge-neutral shrink-0">{ds.rows} {lang === 'fr' ? 'lignes' : 'rows'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dataSource && dataSource !== 'sample' && (
              <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 text-center">
                <p className="text-sm text-neutral-500">
                  {lang === 'fr' ? 'Vous pourrez configurer votre source de données après la création du projet.' : 'You can configure your data source after the project is created.'}
                </p>
              </div>
            )}
          </div>
        )}

        {createError && (
          <div className="mt-4 p-3 rounded-lg bg-clay-50 border border-clay-200 text-sm text-clay-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {createError}
          </div>
        )}

        <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-100">
          <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="btn-ghost disabled:opacity-30">
            <ArrowLeft className="w-4 h-4" /> {t('newproject.back.btn')}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="btn-primary">
              {t('newproject.continue')} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={creating} className="btn-primary">
              {creating ? t('newproject.creating') : t('newproject.create')} <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
