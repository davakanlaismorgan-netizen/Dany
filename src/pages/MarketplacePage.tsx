import { useState } from 'react';
import {
  Search, Info, Landmark, ShoppingBag, Sprout,
  HeartPulse, Truck, Database,
} from 'lucide-react';
import { marketplaceTemplates } from '@/lib/marketplaceCatalog';
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

      <div role="note" className="p-3 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-800 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" /> {t('demo.marketplace')}
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
              <div key={tpl.id} className="card p-5">
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
                </div>
                <h3 className="font-semibold text-neutral-900 mb-1">{tpl.name}</h3>
                <p className="text-sm text-neutral-500 line-clamp-2 mb-3">{tpl.desc}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tpl.tags.map((tag) => (
                    <span key={tag} className="badge-neutral">{tag}</span>
                  ))}
                </div>
                <div className="pt-3 border-t border-neutral-100"><span className="badge-neutral">{t('common.soon')}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
