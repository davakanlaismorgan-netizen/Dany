import { describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { onActivate } from './a11y';

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

describe('onActivate', () => {
  it('déclenche sur Entrée et Espace, ignore les autres touches', () => {
    const fn = vi.fn();
    const handler = onActivate(fn);
    handler(key('Enter'));
    handler(key(' '));
    handler(key('a'));
    handler(key('Tab'));
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('empêche le défilement par défaut de la barre Espace', () => {
    const e = key(' ');
    onActivate(() => {})(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });
});
