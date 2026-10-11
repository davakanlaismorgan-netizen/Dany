import type { KeyboardEvent } from 'react';

// Rend un élément non natif (div) activable au clavier comme un bouton : Entrée ou Espace.
export function onActivate(handler: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  };
}
