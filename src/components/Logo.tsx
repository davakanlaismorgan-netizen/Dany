import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/LogoMark';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-display font-bold text-xl ${className}`}>
      <LogoMark className="w-9 h-9 drop-shadow-sm" />
      <span className="text-neutral-900">DAS</span>
    </Link>
  );
}
