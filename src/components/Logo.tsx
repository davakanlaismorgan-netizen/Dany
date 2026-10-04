import { Link } from 'react-router-dom';
import { Brain } from 'lucide-react';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 font-display font-bold text-xl ${className}`}>
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center shadow-md">
        <Brain className="w-5 h-5 text-white" />
      </div>
      <span className="text-neutral-900">Danysia</span>
    </Link>
  );
}
