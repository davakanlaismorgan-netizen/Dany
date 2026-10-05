import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { openPaymentWidget, verifyTransaction, VerifyError } from '@/lib/kkiapay';
import { PREMIUM_PRICE_XOF } from '@/lib/plans';

export type CheckoutStatus =
  | 'idle'
  | 'paying'        // widget KKiaPay ouvert
  | 'verifying'     // paiement effectué, confirmation serveur en cours
  | 'success'
  | 'failed'        // paiement refusé / annulé / montant invalide
  | 'unverified'    // payé, mais confirmation impossible pour l'instant (réseau, serveur) : réessayable
  | 'already_used'; // référence déjà utilisée sur un autre compte

// Flux d'achat Premium partagé par la page Tarifs et les Paramètres.
export function useCheckout() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<CheckoutStatus>('idle');
  const [reference, setReference] = useState<string | null>(null);

  const verify = useCallback(async (transactionId: string) => {
    setReference(transactionId);
    setStatus('verifying');
    try {
      await verifyTransaction(transactionId);
      await refreshProfile();
      setStatus('success');
    } catch (err) {
      if (err instanceof VerifyError && err.code === 'already_used') setStatus('already_used');
      else if (err instanceof VerifyError && ['payment_not_successful', 'amount_mismatch'].includes(err.code)) setStatus('failed');
      else setStatus('unverified');
    }
  }, [refreshProfile]);

  const start = useCallback((opts?: { phone?: string }) => {
    if (!user) {
      // Pas de paiement sans compte : on ramène l'utilisateur ici après connexion.
      navigate('/auth/login', { state: { from: '/pricing' } });
      return;
    }
    setReference(null);
    setStatus('paying');
    try {
      openPaymentWidget({
        amount: PREMIUM_PRICE_XOF,
        userId: user.id,
        email: user.email,
        fullname: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined),
        phone: opts?.phone,
        onSuccess: (transactionId) => { void verify(transactionId); },
        onFailed: () => setStatus('failed'),
        // Fermeture du widget sans paiement : on revient à l'état initial (sans écraser un succès).
        onClose: () => setStatus((s) => (s === 'paying' ? 'idle' : s)),
      });
    } catch {
      setStatus('failed');
    }
  }, [user, profile?.full_name, navigate, verify]);

  const retry = useCallback(() => {
    if (reference) void verify(reference);
  }, [reference, verify]);

  return { status, reference, start, retry, busy: status === 'paying' || status === 'verifying' };
}
