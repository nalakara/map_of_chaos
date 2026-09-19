import React from 'react';
import { Thing } from '../types';
import { RotateCcw, Trash2, EyeOff, Sparkles } from 'lucide-react';

interface ErasedViewProps {
  things: Thing[];
  onRestoreThing: (thingId: string) => void;
  onPermanentDelete: (thingId: string) => void;
}

export const ErasedView: React.FC<ErasedViewProps> = ({
  things,
  onRestoreThing,
  onPermanentDelete,
}) => {
  const erasedThings = things.filter((t) => t.status === 'erased');

  return (
    <div id="erased-view" className="w-full h-full overflow-y-auto px-4 py-8 max-w-3xl mx-auto text-slate-200">
      {/* Header */}
      <div className="mb-8 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 uppercase tracking-wider mb-1">
          <EyeOff className="w-4 h-4" />
          <span>Erased</span>
        </div>
        <h1 className="text-2xl font-serif text-white tracking-wide">
          Outside Active World
        </h1>
        <p className="text-xs font-mono text-slate-400 mt-1">
          Things removed from your active Map. Always reversible — restore anytime.
        </p>
      </div>

      {erasedThings.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl p-8">
          <p className="text-sm font-mono text-slate-500">
            No Things currently erased. All captured items remain in your active world.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {erasedThings.map((thing) => (
            <div
              key={thing.id}
              className="p-4 rounded-xl border border-slate-800 bg-[#11141c] flex items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200 text-sm">
                    {thing.title || 'Untitled Thing'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {thing.types[0] || 'thing'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs font-sans line-clamp-1">
                  {thing.description}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onRestoreThing(thing.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs transition cursor-pointer border border-slate-700"
                  title="Restore to Active Map"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span>Restore to Map</span>
                </button>
                <button
                  onClick={() => onPermanentDelete(thing.id)}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition cursor-pointer"
                  title="Permanently Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
