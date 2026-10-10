// Réglages de l'éditeur, fournis par variables d'environnement (voir .env.example).
const env = import.meta.env;
const optional = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export const CONTACT_EMAIL = optional(env.VITE_CONTACT_EMAIL);
export const COMPANY_NAME = optional(env.VITE_COMPANY_NAME);
export const COMPANY_ADDRESS = optional(env.VITE_COMPANY_ADDRESS);
export const COMPANY_REGISTRATION = optional(env.VITE_COMPANY_REGISTRATION);
// Les pages légales affichent « version provisoire » tant que VITE_LEGAL_REVIEWED n'est pas « true ».
export const LEGAL_REVIEWED = env.VITE_LEGAL_REVIEWED === 'true';
