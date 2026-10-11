import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/context/I18nContext';
import LegalPage from '@/pages/legal/LegalPage';

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/legal/:slug" element={<LegalPage />} />
          <Route path="*" element={<div>other</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe('LegalPage', () => {
  it.each(['terms', 'privacy', 'notice'])('affiche %s avec un titre et le bandeau provisoire', (slug) => {
    renderAt(`/legal/${slug}`);
    expect(screen.getAllByRole('heading').length).toBeGreaterThan(2);
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('marque le lien courant dans la navigation légale', () => {
    renderAt('/legal/privacy');
    const current = document.querySelector('[aria-current="page"]');
    expect(current?.getAttribute('href')).toBe('/legal/privacy');
  });

  it('un slug inconnu ne rend aucune page légale', () => {
    renderAt('/legal/hack');
    expect(screen.queryByRole('note')).toBeNull();
  });
});
