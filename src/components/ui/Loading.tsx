import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export function LoadingSpinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <Loader2 className={`animate-spin text-savanna-500 ${className}`} style={{ width: size, height: size }} />;
}

export function FullPageLoader() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center animate-pulse-slow">
          <LoadingSpinner size={28} className="text-white" />
        </div>
        <p className="text-neutral-500 text-sm">{t('common.loading.app')}</p>
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-6 space-y-4">
      <div className="h-4 w-1/3 shimmer-bg rounded" />
      <div className="h-8 w-2/3 shimmer-bg rounded" />
      <div className="h-3 w-full shimmer-bg rounded" />
      <div className="h-3 w-1/2 shimmer-bg rounded" />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-clay-100 flex items-center justify-center mb-4">
        <span className="text-2xl">!</span>
      </div>
      <p className="text-neutral-700 font-medium mb-1">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary mt-4">
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4 text-neutral-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-neutral-800 mb-1">{title}</h3>
      {description && <p className="text-neutral-500 text-sm max-w-md mb-4">{description}</p>}
      {action}
    </div>
  );
}
