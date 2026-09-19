import React, { useState, useRef } from 'react';
import { Sparkles, ArrowRight, CornerDownLeft } from 'lucide-react';

interface DumpBoxProps {
  onDump: (rawText: string) => void;
  isAnalyzing?: boolean;
}

export const DumpBox: React.FC<DumpBoxProps> = ({ onDump, isAnalyzing = false }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onDump(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-adjust height
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`;
  };

  return (
    <div
      id="dump-capture-dock"
      className="w-full max-w-2xl mx-auto px-4 z-30"
    >
      <form
        onSubmit={handleSubmit}
        className="relative bg-[#131720]/95 backdrop-blur-md rounded-xl border border-slate-700/60 shadow-2xl p-2 transition focus-within:border-slate-500 focus-within:ring-1 focus-within:ring-amber-500/30"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            id="dump-text-input"
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="What's here?"
            className="w-full resize-none bg-transparent px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans leading-relaxed min-h-[40px] max-h-[140px]"
          />

          <button
            type="submit"
            id="dump-submit-btn"
            disabled={!text.trim() || isAnalyzing}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-semibold tracking-wider transition uppercase cursor-pointer shrink-0 ${
              text.trim()
                ? 'bg-amber-500 text-black hover:bg-amber-400 active:scale-95 shadow-md shadow-amber-500/20'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            title="Dump into your world (Enter)"
          >
            {isAnalyzing ? (
              <>
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Seeing...</span>
              </>
            ) : (
              <>
                <span>DUMP</span>
                <CornerDownLeft className="w-3.5 h-3.5 opacity-80" />
              </>
            )}
          </button>
        </div>

        {/* Quiet footnote explaining the philosophy */}
        <div className="flex items-center justify-between px-3 pt-1.5 text-[10px] font-mono text-slate-500 border-t border-slate-800/60 mt-1">
          <span>Write → Save immediately. No categorization required.</span>
          <span className="hidden sm:inline text-slate-600">Enter to dump • Shift+Enter for new line</span>
        </div>
      </form>
    </div>
  );
};
