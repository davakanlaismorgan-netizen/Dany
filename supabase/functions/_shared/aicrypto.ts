// Chiffrement des clés API LLM des utilisateurs : AES-256-GCM, clé maîtresse dans le secret Supabase
// AI_KEY_ENCRYPTION_SECRET (32 octets en base64). Le texte chiffré est lié à l'utilisateur (données
// authentifiées = identifiant) : recopié sur un autre compte, il ne se déchiffre plus.
// Format : v1.<iv base64url>.<texte chiffré base64url>

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64u = (b: Uint8Array): string => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const unb64u = (s: string): Uint8Array<ArrayBuffer> => {
  const t = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export class CryptoConfigError extends Error {}

/** Importe la clé maîtresse. Lève CryptoConfigError si le secret est absent ou n'a pas 32 octets. */
export async function importMasterKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new CryptoConfigError("missing");
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = unb64u(secret.trim());
  } catch {
    throw new CryptoConfigError("not_base64");
  }
  if (raw.length !== 32) throw new CryptoConfigError("bad_length");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptKey(master: CryptoKey, userId: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(userId) }, master, enc.encode(plaintext)),
  );
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}

/** Renvoie null si le texte est invalide, altéré, ou appartient à un autre utilisateur. */
export async function decryptKey(master: CryptoKey, userId: string, stored: string): Promise<string | null> {
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64u(parts[1]), additionalData: enc.encode(userId) },
      master,
      unb64u(parts[2]),
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}
