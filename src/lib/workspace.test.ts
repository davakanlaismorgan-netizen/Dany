import { describe, expect, it } from 'vitest';
import { accessFor } from '@/lib/workspace';

describe('accessFor', () => {
  it('propriétaire : tous les droits', () => {
    expect(accessFor('u1', 'u1', null)).toEqual({ ownerId: 'u1', role: 'owner', canWrite: true, isOwner: true });
  });
  it('éditeur : écrit, mais n’est pas propriétaire', () => {
    expect(accessFor('o', 'u1', 'editor')).toEqual({ ownerId: 'o', role: 'editor', canWrite: true, isOwner: false });
  });
  it('viewer : lecture seule', () => {
    expect(accessFor('o', 'u1', 'viewer')).toMatchObject({ role: 'viewer', canWrite: false, isOwner: false });
  });
  it('rôle inconnu ou absent : lecture seule (refus par défaut)', () => {
    expect(accessFor('o', 'u1', null)).toMatchObject({ role: 'viewer', canWrite: false });
  });
});
