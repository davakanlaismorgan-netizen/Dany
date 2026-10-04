import {
  openKkiapayWidget,
  addSuccessListener,
  addFailedListener,
  removeKkiapayListener,
  type ListenerData,
} from 'kkiapay';

const KKIAPAY_PUBLIC_KEY = import.meta.env.VITE_KKIAPAY_PUBLIC_KEY || 'xxxxxxx';
const KKIAPAY_SANDBOX = import.meta.env.VITE_KKIAPAY_SANDBOX === 'true';

// L'enum CountryCode de kkiapay n'est pas exporté : on dérive le type depuis la signature du widget.
type KkiapayCountries = NonNullable<Parameters<typeof openKkiapayWidget>[0]['countries']>;
const KKIAPAY_COUNTRIES = ['SN', 'CI', 'BJ', 'TG', 'NE'] as unknown as KkiapayCountries;

export interface KkiapayPaymentOptions {
  amount: number;
  fullname?: string;
  email?: string;
  phone?: string;
  plan: string;
  onSuccess?: (transactionId: string) => void;
  onFailed?: () => void;
}

export function openPaymentWidget(options: KkiapayPaymentOptions) {
  openKkiapayWidget({
    amount: options.amount,
    api_key: KKIAPAY_PUBLIC_KEY,
    sandbox: KKIAPAY_SANDBOX,
    fullname: options.fullname,
    email: options.email,
    phone: options.phone,
    theme: '#d97706',
    position: 'center',
    countries: KKIAPAY_COUNTRIES,
    data: { plan: options.plan },
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

export async function verifyTransaction(transactionId: string, plan: string): Promise<boolean> {
  const { supabase } = await import('@/lib/supabase');
  const { data: { session } } = await supabase.auth.getSession();

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-kkiapay`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ transactionId, plan }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Verification failed');
  }

  const result = await response.json();
  return result.verified === true;
}
