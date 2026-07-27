'use client';

import { useRef, useEffect, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';

const SUGGESTIONS = [
  'Summarize today\'s top AI headlines',
  'What crypto news matters most right now?',
  'Explain the biggest market-moving story',
];

const DASHBOARD_CHAT_KEY = 'newsdash.ask.chatId';

type SourceButton = { type?: string; text?: string; url?: string };

function dashboardChatId(): string {
  if (typeof window === 'undefined') return 'dashboard:web';
  try {
    const existing = sessionStorage.getItem(DASHBOARD_CHAT_KEY)?.trim();
    if (existing) return existing;
    const id = `dashboard:web:${crypto.randomUUID()}`;
    sessionStorage.setItem(DASHBOARD_CHAT_KEY, id);
    return id;
  } catch {
    return 'dashboard:web';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Same Ask text Discord shows: *bold*, _italic_, and [title](url) source links. */
function askTextToHtml(text: string): string {
  let s = escapeHtml(String(text || ''));
  const links: string[] = [];
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label: string, url: string) => {
    const token = `\u0000L${links.length}\u0000`;
    links.push(
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="ai-ask-link">${label}</a>`,
    );
    return token;
  });
  s = s.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  s = s.replace(/\u0000L(\d+)\u0000/g, (_m, i: string) => links[Number(i)] || '');
  return s;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sourceButtons?: SourceButton[];
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'ask' | 'groq' | 'offline' | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async (text: string) => {
    const query = text.trim();
    if (!query || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: query }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, chatId: dashboardChatId() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMode(data.mode ?? 'ask');
      const buttons: SourceButton[] = Array.isArray(data.sourceButtons)
        ? data.sourceButtons.filter(
            (b: SourceButton) => b?.url && /^https?:\/\//i.test(b.url),
          )
        : [];
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.content,
          sourceButtons: buttons.length ? buttons.slice(0, 5) : undefined,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className={`ai-assistant-overlay ${open ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`ai-assistant-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="ai-panel-header">
          <div className="ai-title">
            <span className="ai-title-icon" aria-hidden="true">
              <Bot size={18} />
            </span>
            <div className="ai-title-text">
              <h3>AI Assistant</h3>
              <span className={`ai-mode${mode === 'offline' ? ' is-offline' : ''}`}>
                {mode === 'offline' ? 'Offline analyst' : 'NewsDash Ask'}
              </span>
            </div>
          </div>
          <button type="button" className="ai-panel-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="ai-chat-area" ref={chatRef}>
          {!hasMessages && (
            <div className="ai-suggestions">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                Ask about news, markets, or technology trends.
              </p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ai-suggestion-btn"
                  onClick={() => send(s)}
                >
                  <Sparkles size={14} style={{ marginRight: 8 }} />
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-message ${m.role} chat-anim-in`}>
              {m.role === 'assistant' ? (
                <>
                  <div
                    className="ai-ask-body"
                    dangerouslySetInnerHTML={{ __html: askTextToHtml(m.content) }}
                  />
                  {m.sourceButtons && m.sourceButtons.length > 0 ? (
                    <div className="ai-source-buttons" aria-label="Sources">
                      {m.sourceButtons.map((b, j) => (
                        <a
                          key={`${b.url}-${j}`}
                          className="ai-source-btn"
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {b.text || `Source ${j + 1}`}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                m.content
              )}
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant chat-anim-in" aria-label="Assistant is thinking">
              <span className="typing-indicator" aria-hidden="true">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          )}
        </div>

        <div className="ai-input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder="Ask me anything about the news…"
            disabled={loading}
          />
          <button
            type="button"
            className="ai-send-btn"
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <Send size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
