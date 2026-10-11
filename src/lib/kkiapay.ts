import {
  openKkiapayWidget,
  addSuccessListener,
  addFailedListener,
  addKkiapayCloseListener,
  removeKkiapayListener,
  type ListenerData,
} from 'kkiapay';
import { supabase } from '@/lib/supabase';

const KKIAPAY_PUBLIC_KEY = import.meta.env.VITE_KKIAPAY_PUBLIC_KEY as string | undefined;
const KKIAPAY_SANDBOX = import.meta.env.VITE_KKIAPAY_SANDBOX === 'true';

// L'enum CountryCode de kkiapay n'est pas exporté : on dérive le type depuis la signature du widget.
type KkiapayCountries = NonNullable<Parameters<typeof openKkiapayWidget>[0]['countries']>;
const KKIAPAY_COUNTRIES = ['SN', 'CI', 'BJ', 'TG', 'NE'] as unknown as KkiapayCountries;

export interface KkiapayPaymentOptions {
  amount: number;
  // Identifiant de l'utilisateur, transmis à KKiaPay (partnerId) : permet au webhook serveur
  // de rattacher le paiement au bon compte même si l'onglet est fermé.
  userId: string;
  fullname?: string;
  email?: string;
  phone?: string;
  onSuccess?: (transactionId: string) => void;
  onFailed?: () => void;
  onClose?: () => void;
}

// KKiaPay ne permet pas de retirer l'écouteur de fermeture : on n'en enregistre qu'un seul,
// qui délègue au dernier gestionnaire fourni (sinon ils s'accumuleraient à chaque ouverture).
let closeHandler: (() => void) | null = null;
let closeListenerRegistered = false;

export function openPaymentWidget(options: KkiapayPaymentOptions) {
  if (!KKIAPAY_PUBLIC_KEY) {
    throw new Error('VITE_KKIAPAY_PUBLIC_KEY is not configured');
  }

  closeHandler = options.onClose ?? null;
  if (!closeListenerRegistered) {
    addKkiapayCloseListener(() => closeHandler?.());
    closeListenerRegistered = true;
  }

  openKkiapayWidget({
    amount: options.amount,
    api_key: KKIAPAY_PUBLIC_KEY,
    sandbox: KKIAPAY_SANDBOX,
    fullname: options.fullname,
    email: options.email,
    phone: options.phone,
    partnerId: options.userId,
    theme: '#df8429',
    position: 'center',
    countries: KKIAPAY_COUNTRIES,
  });

  addSuccessListener((data: ListenerData) => {
    removeKkiapayListener('success');
    removeKkiapayListener('failed');
    options.onSuccess?.(data.transactionId);
  });

  addFailedListener(() => {
    removeKkiapayListener('success');
    removeKkiapayListener('failed');
    options.onFailed?.();
  });
}

export type VerifyErrorCode =
  | 'unauthorized'
  | 'invalid_request'
  | 'payment_not_successful'
  | 'amount_mismatch'
  | 'already_used'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'server_error'
  | 'network';

export class VerifyError extends Error {
  constructor(public code: VerifyErrorCode) {
    super(code);
  }
}

const KNOWN_CODES: VerifyErrorCode[] = [
  'unauthorized', 'invalid_request', 'payment_not_successful', 'amount_mismatch',
  'already_used', 'provider_unavailable', 'rate_limited', 'server_error',
];

// Demande au serveur de confirmer le paiement auprès de KKiaPay. Le client n'envoie que la
// référence de transaction : le plan et le montant sont déterminés côté serveur.
export async function verifyTransaction(
  transactionId: string,
): Promise<{ plan: string; expiresAt: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new VerifyError('unauthorized');

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-kkiapay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ transactionId }),
    });
  } catch {
    throw new VerifyError('network');
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.verified !== true) {
    const code = KNOWN_CODES.find((c) => c === body.error) ?? 'server_error';
    throw new VerifyError(code);
  }
  return { plan: String(body.plan), expiresAt: body.expires_at ?? null };
}
