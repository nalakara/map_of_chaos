import React, { useState } from 'react';
import { Thing, WanderEntry } from '../types';
import { Sparkles, Send, Compass, ArrowUpRight, Clock, BookOpen } from 'lucide-react';

interface WanderViewProps {
  entries: WanderEntry[];
  allThings: Thing[];
  onAddWanderEntry: (content: string) => void;
  onSelectThing: (thingId: string) => void;
  onNavigateToMap: () => void;
}

export const WanderView: React.FC<WanderViewProps> = ({
  entries,
  allThings,
  onAddWanderEntry,
  onSelectThing,
  onNavigateToMap,
}) => {
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onAddWanderEntry(content.trim());
    setContent('');
  };

  const getThing = (id: string) => allThings.find((t) => t.id === id);

  return (
    <div id="wander-view" className="w-full h-full overflow-y-auto px-4 py-8 max-w-3xl mx-auto text-slate-200">
      {/* Header */}
      <div className="mb-8 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-amber-400 uppercase tracking-wider mb-1">
          <Compass className="w-4 h-4" />
          <span>Wandering</span>
        </div>
        <h1 className="text-2xl font-serif text-white tracking-wide">
          Unstructured Thought
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          "Dump means: I have something. Wandering means: I am thinking." Speculate, ramble, explore without reaching conclusions.
        </p>
      </div>

      {/* Writing Box */}
      <form
        onSubmit={handleSubmit}
        className="mb-10 rounded-2xl bg-[#121620] border border-slate-800 p-4 shadow-xl focus-within:border-slate-600 transition"
      >
        <textarea
          id="wander-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="What are you pondering? Speculate, contradict yourself, question your assumptions..."
          className="w-full bg-transparent resize-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-sans leading-relaxed"
        />

        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 mt-2">
          <span className="text-[11px] font-mono text-slate-500">
            AI quietly reflects evidence from your active Map (no unsolicited advice).
          </span>
          <button
            type="submit"
            disabled={!content.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-mono font-medium hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <span>Record Thought</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>

      {/* Thought Stream */}
      <div className="space-y-6">
        <div className="text-xs font-mono uppercase text-slate-500 tracking-wider">
          Stream History ({entries.length})
        </div>

        {entries.length === 0 ? (
          <p className="text-xs font-mono text-slate-600 py-8 text-center border border-dashed border-slate-800 rounded-xl">
            No wandering thoughts recorded yet.
          </p>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className="p-5 rounded-xl bg-[#11141c] border border-slate-800/80 space-y-4"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(entry.timestamp).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* The User's raw rambling thought */}
              <p className="text-sm font-sans text-slate-200 leading-relaxed whitespace-pre-wrap">
                {entry.content}
              </p>

              {/* AI Map Echo / Observation (Non-judgmental, purely evidence-based) */}
              {entry.reflection && (
                <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs space-y-2.5">
                  <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-mono">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Map Evidence Echo</span>
                  </div>

                  <p className="text-slate-300 font-sans text-xs leading-relaxed italic">
                    "{entry.reflection.neutralObservation}"
                  </p>

                  {/* Surfaced nodes from the Map */}
                  {entry.reflection.surfacedThingIds.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1.5">
                        Surfaced Things on Map:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.reflection.surfacedThingIds.map((id) => {
                          const thing = getThing(id);
                          if (!thing) return null;
                          return (
                            <button
                              key={id}
                              onClick={() => {
                                onSelectThing(id);
                                onNavigateToMap();
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700/60 transition cursor-pointer"
                              title="Locate on Map"
                            >
                              <span>{thing.title || thing.description.slice(0, 20)}</span>
                              <ArrowUpRight className="w-3 h-3 text-amber-400" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
};
