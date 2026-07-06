'use client';

import { useState, useRef, useEffect } from 'react';

const SUGGESTIONS = [
  'Summarize today\'s top AI headlines',
  'What crypto news matters most right now?',
  'Explain the biggest market-moving story',
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

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
        body: JSON.stringify({ messages: [{ role: 'user', content: query }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
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
          <h3>🤖 AI Assistant</h3>
          <button type="button" className="ai-panel-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="ai-chat-area" ref={chatRef}>
          {messages.length === 0 && (
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
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-message ${m.role}`}>
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant">Thinking…</div>
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
            ➔
          </button>
        </div>
      </aside>
    </>
  );
}
