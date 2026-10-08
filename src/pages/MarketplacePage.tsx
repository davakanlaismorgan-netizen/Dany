import { onActivate } from '@/lib/a11y';
import { useState } from 'react';
import {
  Search, Download, Star, Landmark, ShoppingBag, Sprout,
  HeartPulse, Truck, Database, Check, ArrowRight,
} from 'lucide-react';
import { marketplaceTemplates } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';

const sectorIcons: Record<string, typeof Landmark> = {
  finance: Landmark, commerce: ShoppingBag, agriculture: Sprout,
  healthcare: HeartPulse, logistics: Truck, general: Database,
};

const sectorColors: Record<string, string> = {
  finance: 'savanna', commerce: 'gold', agriculture: 'forest',
  healthcare: 'clay', logistics: 'ocean', general: 'neutral',
};

export default function MarketplacePage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);

  const filters = [
    { value: 'all', label: t('marketplace.all') },
    { value: 'finance', label: t('sector.finance') },
    { value: 'commerce', label: t('sector.commerce') },
    { value: 'agriculture', label: t('sector.agriculture') },
    { value: 'healthcare', label: t('sector.healthcare') },
    { value: 'logistics', label: t('sector.logistics') },
  ];

  const filtered = marketplaceTemplates.filter((tpl) => {
    const q = search.toLowerCase();
    const matchesSearch = q === '' ||
      tpl.name.toLowerCase().includes(q) ||
      tpl.desc.toLowerCase().includes(q) ||
      tpl.tags.some(tag => tag.toLowerCase().includes(q));
    const matchesFilter = filter === 'all' || tpl.sector === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-neutral-900">{t('marketplace.title')}</h1>
        <p className="text-neutral-500 mt-1">{t('marketplace.subtitle')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('marketplace.search')} className="input-field pl-10" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
            filter === f.value ? 'bg-savanna-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300'
          )}>{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-neutral-500">{t('marketplace.empty')}</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((tpl) => {
            const Icon = sectorIcons[tpl.sector] || Database;
            const color = sectorColors[tpl.sector] || 'neutral';
            return (
              <div key={tpl.id} role="button" tabIndex={0} aria-pressed={selected === tpl.id} onClick={() => setSelected(selected === tpl.id ? null : tpl.id)} onKeyDown={onActivate(() => setSelected(selected === tpl.id ? null : tpl.id))} className="card card-hover p-5 cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center',
                    color === 'savanna' && 'bg-savanna-50 text-savanna-600',
                    color === 'gold' && 'bg-gold-50 text-gold-600',
                    color === 'forest' && 'bg-forest-50 text-forest-600',
                    color === 'clay' && 'bg-clay-50 text-clay-600',
                    color === 'ocean' && 'bg-ocean-50 text-ocean-600',
                    color === 'neutral' && 'bg-neutral-100 text-neutral-600',
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-neutral-500">
                    <Star className="w-3.5 h-3.5 text-gold-500 fill-gold-500" />
                    {tpl.rating}
                  </div>
                </div>
                <h3 className="font-semibold text-neutral-900 mb-1">{tpl.name}</h3>
                <p className="text-sm text-neutral-500 line-clamp-2 mb-3">{tpl.desc}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tpl.tags.map((tag) => (
                    <span key={tag} className="badge-neutral">{tag}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-neutral-100">
                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> {tpl.downloads.toLocaleString()} {t('marketplace.downloads')}
                  </span>
                  {selected === tpl.id ? (
                    <span className="badge-forest"><Check className="w-3 h-3" /> {t('marketplace.selected')}</span>
                  ) : (
                    <span className="text-xs text-savanna-600 font-medium flex items-center gap-1">
                      {t('marketplace.usetemplate')} <ArrowRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed bottom-6 right-6 card p-4 shadow-xl animate-slide-up flex items-center gap-4 max-w-md">
          <div className="w-10 h-10 rounded-xl bg-savanna-50 flex items-center justify-center shrink-0">
            <Check className="w-5 h-5 text-savanna-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-neutral-900">{t('marketplace.selected.title')}</p>
            <p className="text-xs text-neutral-500">{t('marketplace.selected.desc')}</p>
          </div>
          <a href="/projects/new" className="btn-primary text-sm py-2 shrink-0">
            {t('marketplace.create')}
          </a>
        </div>
      )}
    </div>
  );
}
