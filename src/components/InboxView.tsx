import React from 'react';
import { Thing, Relationship } from '../types';
import { Sparkles, ArrowRight, HelpCircle, Eye, AlertCircle, Clock } from 'lucide-react';

interface InboxViewProps {
  things: Thing[];
  onSelectThing: (thingId: string) => void;
  onNavigateToMap: () => void;
}

export const InboxView: React.FC<InboxViewProps> = ({
  things,
  onSelectThing,
  onNavigateToMap,
}) => {
  // Recent active things (excluding root node)
  const recentThings = things
    .filter((t) => !t.isRoot && t.status === 'active')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div id="inbox-view" className="w-full h-full overflow-y-auto px-4 py-8 max-w-4xl mx-auto text-slate-200">
      {/* View Header */}
      <div className="mb-8 border-b border-slate-800 pb-5">
        <h1 className="text-2xl font-serif text-white tracking-wide">
          Recent Arrivals
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          Things that recently entered my world. Not a mandatory processing queue.
        </p>
      </div>

      {recentThings.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl p-8">
          <p className="text-sm font-mono text-slate-500">
            No Things have entered your world yet.
          </p>
          <button
            onClick={onNavigateToMap}
            className="mt-4 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-mono transition cursor-pointer"
          >
            Return to Map to Dump
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {recentThings.map((thing) => {
            const hasContextQuestion = !!thing.aiInterpretation?.contextQuestion;
            const isUnknown = thing.uncertaintyState === 'unknown';

            return (
              <div
                key={thing.id}
                className="rounded-xl border border-slate-800 bg-[#121620]/90 hover:border-slate-700 transition p-5 shadow-lg space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-medium text-white">
                        {thing.title || 'Untitled Thing'}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          isUnknown
                            ? 'bg-amber-950/40 text-amber-400 border border-amber-900/40'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isUnknown ? 'Unknown Context' : thing.uncertaintyState}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {thing.types.map((type) => (
                        <span
                          key={type}
                          className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/60"
                        >
                          #{type}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => onSelectThing(thing.id)}
                    className="flex items-center gap-1 text-xs font-mono text-amber-400 hover:text-amber-300 px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 transition cursor-pointer shrink-0"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Original Human Input preview */}
                <p className="text-xs text-slate-300 font-sans leading-relaxed line-clamp-2 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60">
                  {thing.originalDumpText || thing.description}
                </p>

                {/* AI Interpretation preview if available */}
                {thing.aiInterpretation && (
                  <div className="text-[11px] text-slate-400 flex items-start gap-2 pt-1 border-t border-slate-800/60">
                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      {thing.aiInterpretation.summary ||
                        thing.aiInterpretation.contextQuestion}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(thing.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span>{thing.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
