import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Paperclip, Mic, Trash2, Plus,
  TrendingDown, Lightbulb, BarChart3, Database,
  MessageSquare, Brain, Loader2,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { useI18n } from '@/context/I18nContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  insights?: { type: string; text: string }[];
}

const suggestedPrompts = [
  { icon: TrendingDown, text: 'Why did sales drop 23% in Q3?', color: 'clay' },
  { icon: BarChart3, text: 'Show me a summary of my mobile money data', color: 'ocean' },
  { icon: Lightbulb, text: 'What model should I use for credit scoring?', color: 'gold' },
  { icon: Database, text: 'Profile my latest dataset for anomalies', color: 'forest' },
];

const mockResponses: Record<string, { content: string; insights?: { type: string; text: string }[] }> = {
  default: {
    content: "I'm Danysia AI, your data science assistant. I can help you analyze data, build models, generate insights, and answer questions about your projects. What would you like to explore?",
  },
  sales: {
    content: "Based on your Lagos Retail Sales dataset, I've identified the key factors behind the 23% Q3 sales decline:\n\n1. **Seasonal dip**: August-September corresponds to the post-harvest low season in Lagos markets, historically showing 15-20% lower demand.\n\n2. **Reduced foot traffic**: Transaction count dropped 18% compared to Q2, suggesting fewer store visits.\n\n3. **Currency pressure**: NGN depreciation against USD increased import costs, leading to higher prices and reduced purchasing power.\n\n**Recommendation**: Focus on promotions for essential goods and consider inventory rebalancing for Q4 holiday demand.",
    insights: [
      { type: 'warning', text: 'Sales down 23% in Q3 — seasonal + economic factors' },
      { type: 'tip', text: 'Prepare Q4 holiday inventory now to capture rebound' },
    ],
  },
  momo: {
    content: "Here's a summary of your Mobile Money Transactions dataset (Q3 2026):\n\n- **Total transactions**: 45,230 (↑ 12% vs Q2)\n- **Average transaction value**: 8,420 XOF\n- **Peak day**: September 15 (1,847 transactions)\n- **Top corridors**: Dakar→Thiès (32%), Dakar→Saint-Louis (18%)\n- **Anomalies detected**: 47 potentially fraudulent transactions flagged\n\nThe data shows healthy growth with concentrated activity in urban corridors. I recommend building an anomaly detection model to monitor the flagged transactions.",
    insights: [
      { type: 'info', text: 'Transaction volume growing 12% quarter-over-quarter' },
      { type: 'warning', text: '47 anomalous transactions need review' },
    ],
  },
  credit: {
    content: "For credit scoring with alternative data, I recommend the following approach:\n\n**Best algorithm**: Gradient Boosting Classifier (typically achieves 88-93% accuracy on mobile money data)\n\n**Key features to include:**\n- Mobile money transaction frequency & amounts\n- Airtime usage patterns\n- Account balance trends\n- Days since last transaction\n- Network diversity (unique counterparties)\n\n**Why not deep learning?** Your dataset size (45K rows) favors tree-based models. Neural networks would need 10x more data to outperform.\n\nI can set up an AutoML pipeline that automatically tests Gradient Boosting, Random Forest, and Logistic Regression, then selects the best performer.",
    insights: [
      { type: 'tip', text: 'Gradient Boosting is optimal for this dataset size' },
      { type: 'info', text: 'Alternative data features are strong predictors' },
    ],
  },
  anomalies: {
    content: "I've analyzed your dataset for anomalies. Here's what I found:\n\n**Data Quality Report:**\n- Missing values: 2.3% (mostly in `receiver_phone` column)\n- Duplicates: 227 rows (0.5%)\n- Outliers: 12 transactions with amounts > 3 standard deviations\n- Data type issues: `timestamp` column has 3 non-standard date formats\n\n**Recommendations:**\n1. Impute missing `receiver_phone` values with 'UNKNOWN'\n2. Remove duplicate rows\n3. Investigate the 12 outlier transactions manually\n4. Standardize the `timestamp` column format\n\nWould you like me to create a data cleaning pipeline to handle these automatically?",
    insights: [
      { type: 'warning', text: '12 outlier transactions require investigation' },
      { type: 'tip', text: 'Auto-cleaning pipeline can fix most issues' },
    ],
  },
};

function getResponse(prompt: string): { content: string; insights?: { type: string; text: string }[] } {
  const lower = prompt.toLowerCase();
  if (lower.includes('sales') || lower.includes('drop') || lower.includes('decline')) return mockResponses.sales;
  if (lower.includes('mobile money') || lower.includes('momo') || lower.includes('summary')) return mockResponses.momo;
  if (lower.includes('credit') || lower.includes('model') || lower.includes('scoring')) return mockResponses.credit;
  if (lower.includes('anomal') || lower.includes('profile') || lower.includes('dataset')) return mockResponses.anomalies;
  return { content: `I understand you're asking about "${prompt}". This is a demo response — in the full version, I'd analyze your actual data and provide specific insights. Try asking about sales trends, mobile money data, model recommendations, or anomaly detection!` };
}

export default function AssistantPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: t('assistant.default'),
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<{ id: string; title: string; time: string }[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null);
  const [loadingConvId, setLoadingConvId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!user) return;
    async function loadConversations() {
      const { data } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);
      setConversations((data ?? []).map(c => ({ id: c.id, title: c.title, time: c.updated_at })));
      setLoadingConvs(false);
    }
    loadConversations();
  }, [user]);

  const persistMessages = useCallback(async (msgs: Message[], convId: string | null, title?: string) => {
    if (!user || msgs.length <= 1) return;
    const convTitle = title || msgs.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Conversation';
    if (convId) {
      await supabase.from('ai_conversations').update({
        messages: msgs,
        title: convTitle,
        updated_at: new Date().toISOString(),
      }).eq('id', convId);
      return convId;
    } else {
      const { data } = await supabase.from('ai_conversations').insert({
        messages: msgs,
        title: convTitle,
      }).select().single();
      if (data) {
        setActiveConvId(data.id);
        setConversations(prev => [{ id: data.id, title: convTitle, time: data.updated_at }, ...prev]);
        return data.id;
      }
    }
    return convId;
  }, [user]);

  const handleSend = (prompt?: string) => {
    const text = prompt || input.trim();
    if (!text) return;

    const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const response = getResponse(text);
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date().toISOString(),
        insights: response.insights,
      };
      setMessages(prev => [...prev, assistantMsg]);
      const allMsgs = [...messages, userMsg, assistantMsg];
      void persistMessages(allMsgs, activeConvId, undefined);
      setLoading(false);
    }, 1200);
  };

  const newConversation = () => {
    setMessages([{
      role: 'assistant',
      content: t('assistant.default'),
      timestamp: new Date().toISOString(),
    }]);
    setActiveConvId(null);
  };

  const selectConversation = async (convId: string) => {
    setLoadingConvId(convId);
    const { data } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', convId)
      .maybeSingle();
    if (data && data.messages) {
      setMessages(data.messages as Message[]);
      setActiveConvId(convId);
    }
    setLoadingConvId(null);
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingConvId(convId);
    try {
      await supabase.from('ai_conversations').delete().eq('id', convId);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeConvId === convId) {
        newConversation();
      }
    } catch {
      // ignore
    } finally {
      setDeletingConvId(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar - conversations */}
      <div className="w-72 shrink-0 bg-white border-r border-neutral-200 hidden lg:flex flex-col">
        <div className="p-4 border-b border-neutral-200">
          <button onClick={newConversation} className="btn-primary w-full">
            <Plus className="w-4 h-4" /> {t('assistant.newconv')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-2 mb-2">{t('assistant.recent')}</p>
          {loadingConvs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-neutral-300 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-8">{lang === 'fr' ? 'Aucune conversation' : 'No conversations yet'}</p>
          ) : conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => selectConversation(c.id)}
              className={cn('flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-neutral-100 transition-colors text-left group', activeConvId === c.id && 'bg-savanna-50')}
            >
              <MessageSquare className="w-4 h-4 text-neutral-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800 truncate">{c.title}</p>
                <p className="text-xs text-neutral-400">{timeAgo(c.time, lang)}</p>
              </div>
              {loadingConvId === c.id ? (
                <Loader2 className="w-3.5 h-3.5 text-savanna-500 animate-spin" />
              ) : deletingConvId === c.id ? (
                <Loader2 className="w-3.5 h-3.5 text-clay-500 animate-spin" />
              ) : (
                <Trash2 onClick={(e) => deleteConversation(c.id, e)} className="w-3.5 h-3.5 text-neutral-300 opacity-0 group-hover:opacity-100 hover:text-clay-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-neutral-200">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-neutral-900">{t('assistant.title')}</h1>
            <p className="text-xs text-neutral-500">{t('assistant.subtitle')}</p>
          </div>
          <span className="badge-forest ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-forest-500" /> {t('assistant.online')}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6 bg-neutral-50">
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-3 max-w-3xl', msg.role === 'user' && 'ml-auto flex-row-reverse')}>
              <div className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                msg.role === 'assistant' ? 'bg-gradient-to-br from-savanna-500 to-clay-500' : 'bg-neutral-200'
              )}>
                {msg.role === 'assistant' ? <Sparkles className="w-5 h-5 text-white" /> : <span className="text-sm font-bold text-neutral-600">U</span>}
              </div>
              <div className={cn('flex-1 min-w-0', msg.role === 'user' && 'flex justify-end')}>
                <div className={cn(
                  'rounded-2xl p-4',
                  msg.role === 'assistant' ? 'bg-white border border-neutral-200' : 'bg-savanna-600 text-white'
                )}>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                  {/* Insights */}
                  {msg.insights && (
                    <div className="mt-3 space-y-2 pt-3 border-t border-neutral-100">
                      {msg.insights.map((insight, j) => (
                        <div
                          key={j}
                          className={cn(
                            'flex items-start gap-2 p-2.5 rounded-lg text-xs',
                            insight.type === 'warning' && 'bg-clay-50 text-clay-700',
                            insight.type === 'tip' && 'bg-forest-50 text-forest-700',
                            insight.type === 'info' && 'bg-ocean-50 text-ocean-700',
                          )}
                        >
                          {insight.type === 'warning' && <TrendingDown className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                          {insight.type === 'tip' && <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                          {insight.type === 'info' && <BarChart3 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                          {insight.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-neutral-400 mt-1 px-1">{timeAgo(msg.timestamp, lang)}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 max-w-3xl">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-savanna-500 to-clay-500 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="bg-white border border-neutral-200 rounded-2xl p-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-savanna-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-savanna-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-savanna-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested prompts */}
        {messages.length <= 1 && (
          <div className="px-6 pb-4 bg-neutral-50">
            <p className="text-xs text-neutral-400 mb-2">{t('assistant.try')}</p>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((p, i) => {
                const Icon = p.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleSend(p.text)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all hover:shadow-sm',
                      p.color === 'clay' && 'border-clay-200 bg-clay-50 text-clay-700 hover:bg-clay-100',
                      p.color === 'ocean' && 'border-ocean-200 bg-ocean-50 text-ocean-700 hover:bg-ocean-100',
                      p.color === 'gold' && 'border-gold-200 bg-gold-50 text-gold-700 hover:bg-gold-100',
                      p.color === 'forest' && 'border-forest-200 bg-forest-50 text-forest-700 hover:bg-forest-100',
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {p.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 bg-white border-t border-neutral-200">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <button className="btn-ghost p-2.5 shrink-0">
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={t('assistant.placeholder')}
              className="input-field resize-none flex-1 min-h-[44px] max-h-32"
              style={{ height: 'auto' }}
            />
            <button className="btn-ghost p-2.5 shrink-0">
              <Mic className="w-5 h-5" />
            </button>
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="btn-primary p-2.5 shrink-0"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-neutral-400 text-center mt-2">
            {t('assistant.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
