// Adresse de contact commerciale (plan Entreprise). Définie via VITE_CONTACT_EMAIL ;
// si elle est absente, le bouton « Contacter les ventes » reste désactivé.
export const CONTACT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || null;
