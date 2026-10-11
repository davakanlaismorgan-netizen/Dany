import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/report';
import { LEGAL_VERSION } from '@/lib/legalContent';
import type { Plan, Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  // Fin de validité du plan payant (null pour le plan gratuit ou un plan sans échéance).
  planExpiresAt: string | null;
  signUp: (email: string, password: string, fullName: string, company?: string) => Promise<{ error: string | null; needsEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null);

  async function loadProfile(userId: string) {
    // Le plan n'est plus une colonne modifiable de profiles : il vient de l'abonnement,
    // calculé côté base avec sa date d'expiration (current_plan), et jamais du navigateur.
    const [profileRes, planRes, subscriptionRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.rpc('current_plan'),
      supabase.from('subscriptions').select('current_period_end').eq('user_id', userId).maybeSingle(),
    ]);

    if (profileRes.error) {
      reportError(profileRes.error, { where: 'loadProfile.profiles' });
      return;
    }
    if (planRes.error) reportError(planRes.error, { where: 'loadProfile.current_plan' });

    const rawPlan = planRes.data as string | null;
    const plan: Plan = rawPlan === 'premium' || rawPlan === 'enterprise' ? rawPlan : 'free';
    setProfile(profileRes.data ? { ...(profileRes.data as Omit<Profile, 'plan'>), plan } : null);
    setPlanExpiresAt(plan === 'free' ? null : (subscriptionRes.data?.current_period_end as string | null) ?? null);
  }

  // Utilisateur dont le profil est déjà chargé : évite de tout recharger à chaque renouvellement
  // de jeton ou retour sur l'onglet (événement SIGNED_IN répété par Supabase).
  const loadedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    // Source unique : onAuthStateChange émet INITIAL_SESSION au démarrage (avec ou sans session),
    // ce qui rend un getSession() séparé inutile (il doublait toutes les requêtes).
    const { data: authListener } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (!s?.user) {
        loadedUserId.current = null;
        setProfile(null);
        setPlanExpiresAt(null);
        setLoading(false);
        return;
      }
      if (event !== 'USER_UPDATED' && loadedUserId.current === s.user.id) return;

      const userId = s.user.id;
      loadedUserId.current = userId;
      // Aucun appel Supabase attendu dans ce callback (risque d'interblocage documenté par
      // Supabase) : le chargement est planifié, et loading repasse toujours à false.
      setTimeout(() => {
        loadProfile(userId)
          .catch((err) => reportError(err, { where: 'loadProfile' }))
          .finally(() => { if (active) setLoading(false); });
      }, 0);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string, company?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // accepted_terms/terms_version : le serveur horodate l'acceptation (profiles.terms_accepted_at)
        data: { full_name: fullName, company: company || undefined, accepted_terms: true, terms_version: LEGAL_VERSION },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) return { error: error.message };
    // Pas de session = confirmation de l'email requise par Supabase Auth.
    if (data.user && data.session) {
      await loadProfile(data.user.id);
    }
    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setPlanExpiresAt(null);
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, planExpiresAt, signUp, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
