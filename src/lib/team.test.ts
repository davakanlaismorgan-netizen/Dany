import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { isValidEmail, teamErrorKey } from '@/lib/team';

describe('isValidEmail', () => {
  it('accepte une adresse correcte et ignore les espaces autour', () => {
    expect(isValidEmail(' a@b.co ')).toBe(true);
  });
  it('refuse les adresses sans @, avec espace ou trop longues', () => {
    expect(isValidEmail('abc')).toBe(false);
    expect(isValidEmail('a b@c.d')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
});

describe('teamErrorKey', () => {
  const k = (message: string) => teamErrorKey({ message });
  it('traduit les erreurs de la base en clés i18n (jamais de texte technique)', () => {
    expect(k('team_limit')).toBe('team.err.limit');
    expect(k('duplicate key value violates unique constraint')).toBe('team.err.duplicate');
    expect(k('violates check constraint "team_members_email_check"')).toBe('team.err.invalid_email');
    expect(k('email_not_confirmed')).toBe('team.err.email_not_confirmed');
    expect(k('invitation_not_found')).toBe('team.err.invitation_not_found');
    expect(k('already_member')).toBe('team.err.already_member');
    expect(k('new row violates row-level security policy')).toBe('team.err.plan');
  });
  it('erreur inconnue ou valeur inattendue : message générique', () => {
    expect(k('boom 10.0.0.1')).toBe('team.err.unknown');
    expect(teamErrorKey(null)).toBe('team.err.unknown');
    expect(teamErrorKey('x')).toBe('team.err.unknown');
  });
});
