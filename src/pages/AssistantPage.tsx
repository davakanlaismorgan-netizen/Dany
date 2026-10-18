import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Send, Trash2, Plus, BarChart3, Database, MessageSquare, Brain, Loader2, KeyRound, ShieldCheck, Lightbulb, TrendingDown } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/lib/report';
import {
  AI_PROVIDERS, MAX_MESSAGE_CHARS, assistantErrorCode, deleteAiKey, deleteConversation, getAiKeyStatus, listAnalysedDatasets,
  listConversations, listProjects, loadConversation, saveAiKey, sendAssistantMessage,
  type AiKeyStatus, type AiProvider, type ConversationItem,
} from '@/lib/assistant';
import type { ChatMessage } from '@/types';

const PROMPTS = [
  { icon: BarChart3, key: 'assistant.prompt.summary', color: 'ocean' },
  { icon: Database, key: 'assistant.prompt.quality', color: 'forest' },
  { icon: Lightbulb, key: 'assistant.prompt.model', color: 'gold' },
  { icon: TrendingDown, key: 'assistant.prompt.next', color: 'clay' },
] as const;

export default function AssistantPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [datasetId, setDatasetId] = useState('');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [keyStatus, setKeyStatus] = useState<AiKeyStatus | null>(null);
  const [keyLoaded, setKeyLoaded] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; limit: number } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth' }); }, [messages, sending]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([listProjects(), getAiKeyStatus()])
      .then(([p, k]) => {
        if (!alive) return;
        setProjects(p);
        setProjectId((cur) => cur || p[0]?.id || '');
        setKeyStatus(k);
        setKeyLoaded(true);
      })
      .catch((err) => {
        reportError(err, { where: 'AssistantPage.init' });
        if (alive) { setError(t('assistant.err.load')); setKeyLoaded(true); }
      });
    return () => { alive = false; };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProjectData = useCallback(async (pid: string) => {
    try {
      const [d, c] = await Promise.all([listAnalysedDatasets(pid), listConversations(pid)]);
      setDatasets(d);
      setConversations(c);
    } catch (err) {
      reportError(err, { where: 'AssistantPage.project' });
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    setDatasetId('');
    setActiveConvId(null);
    setMessages([]);
    void loadProjectData(projectId);
  }, [projectId, loadProjectData]);

  async function handleSaveKey() {
    setSavingKey(true);
    setError(null);
    setNotice(null);
    const res = await saveAiKey(provider, apiKey.trim());
    setSavingKey(false);
    if (!res.ok) { setError(t(`assistant.err.${assistantErrorCode(res.code)}`)); return; }
    setApiKey(''); // la clé ne reste pas en mémoire de l'écran
    setKeyStatus({ provider, last4: res.last4 });
    setEditingKey(false);
    setNotice(t('assistant.key.saved'));
  }

  async function handleDeleteKey() {
    if (!user || !window.confirm(t('assistant.key.delete.confirm'))) return;
    try {
      await deleteAiKey(user.id);
      setKeyStatus(null);
      setNotice(null);
    } catch (err) {
      reportError(err, { where: 'AssistantPage.deleteKey' });
      setError(t('assistant.err.unknown'));
    }
  }

  async function handleSend(prompt?: string) {
    const text = (prompt ?? input).trim();
    if (!text || sending || !projectId) return;
    setError(null);
    setNotice(null);
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: new Date().toISOString() }]);
    setInput('');
    const res = await sendAssistantMessage({ projectId, datasetId: datasetId || null, conversationId: activeConvId, message: text, lang });
    setSending(false);
    if (!res.ok) {
      setMessages((prev) => prev.slice(0, -1)); // le message n'a pas été traité : on le rend à l'utilisateur
      setInput(text);
      const code = assistantErrorCode(res.code);
      if (code === 'no_key' || code === 'key_unreadable') setKeyStatus(null);
      setError(t(`assistant.err.${code}`));
      return;
    }
    const d = res.data;
    setMessages((prev) => [...prev, { role: 'assistant', content: d.reply, timestamp: new Date().toISOString() }]);
    setQuota({ remaining: d.remaining, limit: d.limit });
    if (d.conversationId) setActiveConvId(d.conversationId);
    if (!d.saved) setNotice(t('assistant.notsaved'));
    void loadProjectData(projectId);
  }

  async function selectConversation(id: string) {
    setError(null);
    try {
      setMessages(await loadConversation(id));
      setActiveConvId(id);
    } catch (err) {
      reportError(err, { where: 'AssistantPage.select' });
      setError(t('assistant.err.unknown'));
    }
  }

  async function removeConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
    } catch (err) {
      reportError(err, { where: 'AssistantPage.deleteConv' });
      setError(t('assistant.err.unknown'));
    }
  }

  const needsKey = keyLoaded && (!keyStatus || editingKey);

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <aside className="w-72 shrink-0 bg-white border-r border-neutral-200 hidden lg:flex flex-col">
        <div className="p-4 border-b border-neutral-200">
          <button type="button" onClick={() => { setActiveConvId(null); setMessages([]); setError(null); }} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> {t('assistant.newconv')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-2 mb-2">{t('assistant.recent')}</p>
          {conversations.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-8">{t('assistant.none')}</p>
          ) : conversations.map((c) => (
            <div key={c.id} className={cn('flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 transition-colors group', activeConvId === c.id && 'bg-savanna-50')}>
              <button type="button" onClick={() => void selectConversation(c.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <MessageSquare className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-neutral-800 truncate">{c.title}</span>
                  <span className="block text-xs text-neutral-400">{timeAgo(c.updated_at, lang)}</span>
                </span>
              </button>
              <button type="button" aria-label={t('assistant.conv.delete')} onClick={(e) => void removeConversation(c.id, e)} className="opacity-0 group-hover:opacity-100 focus:opacity-100">
                <Trash2 className="w-3.5 h-3.5 text-neutral-400 hover:text-clay-500" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0">
        <header className="flex flex-wrap items-center gap-3 px-6 py-4 bg-white border-b border-neutral-200">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="mr-auto">
            <h1 className="font-semibold text-neutral-900">{t('assistant.title')}</h1>
            <p className="text-xs text-neutral-500">{t('assistant.subtitle')}</p>
          </div>
          {projects.length > 0 && (
            <>
              <label className="text-xs text-neutral-500 flex items-center gap-2">
                {t('assistant.project')}
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input-field w-auto py-1.5 text-sm">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="text-xs text-neutral-500 flex items-center gap-2">
                {t('assistant.dataset')}
                <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="input-field w-auto py-1.5 text-sm">
                  <option value="">{t('assistant.dataset.latest')}</option>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            </>
          )}
          {quota && <span className="badge-neutral" title={t('assistant.quota.title')}>{quota.remaining} / {quota.limit} {t('assistant.quota.unit')}</span>}
        </header>

        {error && <div role="alert" className="mx-6 mt-4 p-3 rounded-xl bg-clay-50 border border-clay-200 text-sm text-clay-700">{error}</div>}
        {notice && <div role="status" className="mx-6 mt-4 p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-sm text-neutral-700">{notice}</div>}

        {keyLoaded && projects.length === 0 && (
          <div className="m-6 p-5 card text-sm text-neutral-600">
            {t('assistant.noprojects')} <Link to="/projects/new" className="text-savanna-700 underline">{t('assistant.noprojects.cta')}</Link>
          </div>
        )}

        {needsKey && projects.length > 0 && (
          <div className="m-6 p-5 card max-w-xl">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2"><KeyRound className="w-4 h-4" /> {t('assistant.key.title')}</h2>
            <p className="text-sm text-neutral-600 mt-2">{t('assistant.key.desc')}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
              <div>
                <label htmlFor="ai-provider" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('assistant.key.provider')}</label>
                <select id="ai-provider" value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)} className="input-field">
                  {AI_PROVIDERS.map((p) => <option key={p} value={p}>{t(`assistant.provider.${p}`)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ai-key" className="block text-sm font-medium text-neutral-700 mb-1.5">{t('assistant.key.input')}</label>
                <input id="ai-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="input-field" autoComplete="off" spellCheck={false} maxLength={300} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary" disabled={savingKey || apiKey.trim().length < 20} onClick={() => void handleSaveKey()}>
                {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {t('assistant.key.save')}
              </button>
              {editingKey && <button type="button" className="btn-secondary" onClick={() => { setEditingKey(false); setApiKey(''); }}>{t('assistant.key.cancel')}</button>}
            </div>
            <p className="text-xs text-neutral-500 mt-3">{t('assistant.key.privacy')}</p>
          </div>
        )}

        {keyStatus && !editingKey && projects.length > 0 && (
          <>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6 bg-neutral-50">
              {messages.length === 0 && (
                <div className="max-w-3xl space-y-4">
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 text-sm leading-relaxed">{t('assistant.default')}</div>
                  <div>
                    <p className="text-xs text-neutral-400 mb-2">{t('assistant.try')}</p>
                    <div className="flex flex-wrap gap-2">
                      {PROMPTS.map(({ icon: Icon, key, color }) => (
                        <button key={key} type="button" disabled={sending} onClick={() => void handleSend(t(key))}
                          className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all hover:shadow-sm',
                            color === 'clay' && 'border-clay-200 bg-clay-50 text-clay-700', color === 'ocean' && 'border-ocean-200 bg-ocean-50 text-ocean-700',
                            color === 'gold' && 'border-gold-200 bg-gold-50 text-gold-700', color === 'forest' && 'border-forest-200 bg-forest-50 text-forest-700')}>
                          <Icon className="w-4 h-4" /> {t(key)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={cn('flex gap-3 max-w-3xl', msg.role === 'user' && 'ml-auto flex-row-reverse')}>
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', msg.role === 'assistant' ? 'bg-gradient-to-br from-savanna-500 to-clay-500' : 'bg-neutral-200')}>
                    {msg.role === 'assistant' ? <Sparkles className="w-5 h-5 text-white" /> : <span className="text-sm font-bold text-neutral-600">U</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn('rounded-2xl p-4', msg.role === 'assistant' ? 'bg-white border border-neutral-200' : 'bg-savanna-600 text-white')}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 px-1">{timeAgo(msg.timestamp, lang)}</p>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex gap-3 max-w-3xl" role="status" aria-label={t('assistant.thinking')}>
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-white" /></div>
                  <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex items-center gap-2">
                    {[0, 150, 300].map((d) => <span key={d} className="w-2 h-2 rounded-full bg-savanna-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="p-4 bg-white border-t border-neutral-200">
              <div className="flex items-end gap-2 max-w-3xl mx-auto">
                <textarea
                  value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={MAX_MESSAGE_CHARS}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder={t('assistant.placeholder')} aria-label={t('assistant.placeholder')}
                  className="input-field resize-none flex-1 min-h-[44px] max-h-32"
                />
                <button type="button" onClick={() => void handleSend()} disabled={!input.trim() || sending} aria-label={t('assistant.send')} className="btn-primary p-2.5 shrink-0">
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-neutral-400 text-center mt-2">{t('assistant.disclaimer')}</p>
              <p className="text-xs text-neutral-500 text-center mt-1">
                {t(`assistant.provider.${keyStatus.provider}`)} …{keyStatus.last4} ·{' '}
                <button type="button" className="underline" onClick={() => { setProvider(keyStatus.provider); setEditingKey(true); }}>{t('assistant.key.replace')}</button> ·{' '}
                <button type="button" className="underline" onClick={() => void handleDeleteKey()}>{t('assistant.key.delete')}</button>
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
