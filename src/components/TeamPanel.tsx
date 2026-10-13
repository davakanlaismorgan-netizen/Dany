import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { reportError } from '@/lib/report';
import {
  MAX_TEAM_PREMIUM, acceptInvitation, declineInvitation, inviteMember, isValidEmail, leaveTeam,
  listInvitations, listMembers, listWorkspaces, removeMember, teamErrorKey, updateMemberRole,
  type Invitation, type TeamMember, type TeamRole, type Workspace,
} from '@/lib/team';
import { ErrorState } from '@/components/ui/Loading';

const ROLES: TeamRole[] = ['viewer', 'editor'];

export function TeamPanel() {
  const { t } = useI18n();
  const { user, profile } = useAuth();
  const isFree = (profile?.plan ?? 'free') === 'free';
  const isEnterprise = profile?.plan === 'enterprise';

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('viewer');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const [m, i, w] = await Promise.all([listMembers(user.id), listInvitations(), listWorkspaces()]);
      setMembers(m);
      setInvitations(i);
      setWorkspaces(w);
    } catch (err) {
      reportError(err, { where: 'TeamPanel.load' });
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Exécute une action, affiche une erreur lisible en cas d'échec, puis recharge les listes.
  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      reportError(err, { where: `TeamPanel.${key.split(':')[0]}` });
      setError(t(teamErrorKey(err)));
    } finally {
      setBusy(null);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError(t('team.err.invalid_email'));
      return;
    }
    if (email.trim().toLowerCase() === (user?.email ?? '').toLowerCase()) {
      setError(t('team.err.self'));
      return;
    }
    setInviting(true);
    await run('invite', async () => {
      await inviteMember(email, role);
      setEmail('');
    });
    setInviting(false);
  }

  if (loadFailed) return <ErrorState message={t('team.err.load')} onRetry={() => void load()} />;

  const limit = isEnterprise ? null : MAX_TEAM_PREMIUM;

  return (
    <div className="space-y-6">
      {invitations.length > 0 && (
        <section className="card p-6" aria-labelledby="team-invitations">
          <h2 id="team-invitations" className="font-semibold text-neutral-900">{t('team.invitations.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1 mb-4">{t('team.invitations.desc')}</p>
          <ul className="space-y-2">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-neutral-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{inv.owner_name || inv.owner_email}</p>
                  <p className="text-xs text-neutral-400 truncate">{inv.owner_email}</p>
                </div>
                <span className="badge-neutral">{t(`team.role.${inv.role}`)}</span>
                <button
                  type="button"
                  className="btn-primary text-sm py-2"
                  disabled={busy !== null}
                  onClick={() => run(`accept:${inv.id}`, () => acceptInvitation(inv.id))}
                >
                  {busy === `accept:${inv.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {t('team.accept')}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm py-2"
                  disabled={busy !== null}
                  onClick={() => run(`decline:${inv.id}`, () => declineInvitation(inv.id))}
                >
                  <X className="w-4 h-4" /> {t('team.decline')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6" aria-labelledby="team-members">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="team-members" className="font-semibold text-neutral-900">{t('settings.team.title')}</h2>
            <p className="text-sm text-neutral-500 mt-1">{t('settings.team.desc')}</p>
          </div>
          {!isFree && (
            <span className="badge-neutral shrink-0" title={t('team.count.label')}>
              {members.length}{limit ? ` / ${limit}` : ''}
            </span>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-700">{error}</div>
        )}

        {isFree ? (
          <div className="mb-4 p-4 rounded-xl bg-gold-50 border border-gold-200 text-sm text-gold-800">
            <p className="font-medium">{t('team.free.title')}</p>
            <p className="mt-1">{t('team.free.desc')}</p>
            <Link to="/pricing" className="btn-primary text-sm py-2 mt-3 inline-flex">{t('team.free.cta')}</Link>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end" noValidate>
            <div>
              <label htmlFor="team-email" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('team.email.label')}</label>
              <input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="collegue@exemple.com"
                className="input-field"
                autoComplete="off"
                maxLength={254}
              />
            </div>
            <div>
              <label htmlFor="team-role" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('team.role.label')}</label>
              <select id="team-role" value={role} onChange={(e) => setRole(e.target.value as TeamRole)} className="input-field">
                {ROLES.map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={inviting || !email.trim()}>
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t('settings.team.invite')}
            </button>
          </form>
        )}

        {!isFree && <p className="text-xs text-neutral-500 mb-4">{t('team.hint')}</p>}

        <ul className="space-y-2">
          <li className="flex items-center gap-3 p-3 rounded-xl border border-neutral-200">
            <Avatar label={profile?.full_name || user?.email || '?'} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">{profile?.full_name || user?.email}</p>
              <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
            </div>
            <span className="badge-savanna">{t('team.role.owner')}</span>
          </li>
          {loading && members.length === 0 && <li className="text-sm text-neutral-400 px-1">…</li>}
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-neutral-200">
              <Avatar label={m.member_email} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">{m.member_email}</p>
                <span className={m.status === 'accepted' ? 'badge-forest' : 'badge-gold'}>{t(`team.status.${m.status}`)}</span>
              </div>
              <select
                aria-label={t('team.role.label')}
                value={m.role}
                disabled={busy !== null}
                onChange={(e) => run(`role:${m.id}`, () => updateMemberRole(m.id, e.target.value as TeamRole))}
                className="input-field w-auto py-1.5 text-sm"
              >
                {ROLES.map((r) => <option key={r} value={r}>{t(`team.role.${r}`)}</option>)}
              </select>
              <button
                type="button"
                className="btn-ghost p-2 text-clay-600"
                aria-label={`${t('team.remove')} ${m.member_email}`}
                disabled={busy !== null}
                onClick={() => {
                  if (window.confirm(t('team.remove.confirm'))) void run(`remove:${m.id}`, () => removeMember(m.id));
                }}
              >
                {busy === `remove:${m.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </li>
          ))}
        </ul>
        {!loading && members.length === 0 && !isFree && (
          <p className="text-sm text-neutral-500 mt-3">{t('team.empty')}</p>
        )}
      </section>

      {workspaces.length > 0 && (
        <section className="card p-6" aria-labelledby="team-joined">
          <h2 id="team-joined" className="font-semibold text-neutral-900 mb-4">{t('team.joined.title')}</h2>
          <ul className="space-y-2">
            {workspaces.map((w) => (
              <li key={w.owner_id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-neutral-200">
                <Avatar label={w.owner_name || w.owner_email || '?'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 truncate">{w.owner_name || w.owner_email}</p>
                  <p className="text-xs text-neutral-400 truncate">{w.owner_email}</p>
                </div>
                <span className="badge-neutral">{t(`team.role.${w.role}`)}</span>
                <button
                  type="button"
                  className="btn-secondary text-sm py-2"
                  disabled={busy !== null || !user}
                  onClick={() => {
                    if (user && window.confirm(t('team.leave.confirm'))) void run(`leave:${w.owner_id}`, () => leaveTeam(w.owner_id, user.id));
                  }}
                >
                  {t('team.leave')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="w-9 h-9 rounded-full bg-gradient-to-br from-savanna-400 to-clay-500 flex items-center justify-center text-white text-sm font-semibold shrink-0"
    >
      {(label[0] ?? '?').toUpperCase()}
    </div>
  );
}
