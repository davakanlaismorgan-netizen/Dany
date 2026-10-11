import { useId } from 'react';

// Marque DAS : un « D » dont la panse contient trois barres de données croissantes.
// Mêmes couleurs que la charte (savanna -> clay). Le fichier public/favicon.svg en est la copie statique.
export function LogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  const gradientId = `das-g-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="DAS" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="8" y1="4" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#df8429" />
          <stop offset="1" stopColor="#e45a2b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gradientId})`} />
      <path d="M16 14 H29 A18 18 0 0 1 29 50 H16 Z" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <rect x="22" y="34" width="4" height="8" rx="1.2" fill="#fff" />
      <rect x="28.5" y="29" width="4" height="13" rx="1.2" fill="#fff" />
      <rect x="35" y="24" width="4" height="18" rx="1.2" fill="#fff" />
    </svg>
  );
}
