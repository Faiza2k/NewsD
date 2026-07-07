'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ArrowRight, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORIES } from '@/lib/feeds/registry';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CommandItem {
  id: string;
  label: string;
  icon: string;
  category: string;
  action: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const commands: CommandItem[] = [
    {
      id: 'home',
      label: 'Go to Overview',
      icon: '⚡',
      category: 'Navigation',
      action: () => { router.push('/'); onClose(); },
    },
    ...CATEGORIES.map((cat) => ({
      id: cat.id,
      label: `Go to ${cat.name}`,
      icon: cat.icon,
      category: 'Navigation',
      action: () => { router.push(`/${cat.id}`); onClose(); },
    })),
    {
      id: 'cybersecurity',
      label: 'Go to Cybersecurity',
      icon: '🛡️',
      category: 'Navigation',
      action: () => { router.push('/cybersecurity'); onClose(); },
    },
    {
      id: 'cloud-devops',
      label: 'Go to Cloud & DevOps',
      icon: '☁️',
      category: 'Navigation',
      action: () => { router.push('/cloud-devops'); onClose(); },
    },
    {
      id: 'forex',
      label: 'Go to Forex Market',
      icon: '💱',
      category: 'Navigation',
      action: () => { router.push('/forex'); onClose(); },
    },
    {
      id: 'gold',
      label: 'Go to Gold & Metals',
      icon: '🥇',
      category: 'Navigation',
      action: () => { router.push('/gold'); onClose(); },
    },
    {
      id: 'refresh',
      label: 'Refresh all feeds',
      icon: '🔄',
      category: 'Actions',
      action: () => { window.location.reload(); onClose(); },
    },
  ];

  const filtered = query
    ? commands.filter(cmd =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.category.toLowerCase().includes(query.toLowerCase())
    )
    : commands;

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [filtered, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'var(--bg-overlay)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-2xl overflow-hidden animate-scale-in"
        style={{
          background: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-xl)',
          border: '1px solid var(--border-default)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}>
          <Search className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, navigate..."
            className="flex-1 text-[15px] bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-2 px-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                No results found
              </p>
            </div>
          ) : (
            <>
              {filtered.map((cmd, index) => (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors',
                    index === selectedIndex ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'
                  )}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="text-base w-6 text-center flex-shrink-0">{cmd.icon}</span>
                  <span className="flex-1 text-[13px] font-medium"
                    style={{ color: 'var(--text-primary)' }}>
                    {cmd.label}
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {cmd.category}
                  </span>
                  {index === selectedIndex && (
                    <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                  )}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 px-5 py-3 border-t"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-tertiary)' }}>
          <div className="flex items-center gap-1.5">
            <kbd className="text-[9px] font-mono px-1 py-0.5 rounded"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>↑↓</kbd>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Navigate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="text-[9px] font-mono px-1 py-0.5 rounded"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>↵</kbd>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Select</span>
          </div>
        </div>
      </div>
    </div>
  );
}
