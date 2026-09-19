import React, { useState } from 'react';
import { Thing, Relationship, ThingType, UncertaintyState } from '../types';
import {
  X,
  Sparkles,
  Link as LinkIcon,
  Trash2,
  Check,
  AlertCircle,
  HelpCircle,
  Edit3,
  Plus,
  ArrowUpRight,
  EyeOff,
} from 'lucide-react';

interface ThingDetailDrawerProps {
  thing: Thing;
  allThings: Thing[];
  relationships: Relationship[];
  onClose: () => void;
  onUpdateThing: (updated: Thing) => void;
  onConfirmAiRelationship: (relationshipId: string) => void;
  onRemoveRelationship: (relationshipId: string) => void;
  onAddRelationship: (targetId: string, label?: string) => void;
  onEraseThing: (thingId: string) => void;
  onSelectOtherThing: (thingId: string) => void;
}

const TYPE_OPTIONS: ThingType[] = [
  'project',
  'idea',
  'desire',
  'concern',
  'problem',
  'question',
  'person',
  'place',
  'physical object',
  'application',
  'file',
  'thought',
  'unfinished thought',
  'vague observation',
  'unknown',
];

export const ThingDetailDrawer: React.FC<ThingDetailDrawerProps> = ({
  thing,
  allThings,
  relationships,
  onClose,
  onUpdateThing,
  onConfirmAiRelationship,
  onRemoveRelationship,
  onAddRelationship,
  onEraseThing,
  onSelectOtherThing,
}) => {
  const [isEditingContext, setIsEditingContext] = useState(
    thing.uncertaintyState === 'unknown' || !thing.context?.whatIsThis
  );
  const [whatIsThisInput, setWhatIsThisInput] = useState(thing.context?.whatIsThis || '');
  const [selectedTypeInput, setSelectedTypeInput] = useState<string>(
    thing.context?.possibleType || thing.types[0] || 'unknown'
  );
  const [notesInput, setNotesInput] = useState(thing.context?.notes || '');
  const [isAddingRel, setIsAddingRel] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relLabel, setRelLabel] = useState('');

  // Relationships involving this Thing
  const thingRelationships = relationships.filter(
    (r) => r.source === thing.id || r.target === thing.id
  );

  const getOtherThing = (rel: Relationship) => {
    const otherId = rel.source === thing.id ? rel.target : rel.source;
    return allThings.find((t) => t.id === otherId);
  };

  const handleSaveContext = () => {
    const isStillUnknown = selectedTypeInput === 'unknown' && !whatIsThisInput.trim();
    const updated: Thing = {
      ...thing,
      types: selectedTypeInput ? [selectedTypeInput as ThingType] : thing.types,
      uncertaintyState: isStillUnknown ? 'unknown' : 'verified',
      context: {
        whatIsThis: whatIsThisInput.trim(),
        possibleType: selectedTypeInput,
        notes: notesInput.trim(),
        isUnknown: isStillUnknown,
      },
      updatedAt: new Date().toISOString(),
    };
    onUpdateThing(updated);
    setIsEditingContext(false);
  };

  const handleLeaveUnknown = () => {
    const updated: Thing = {
      ...thing,
      uncertaintyState: 'unknown',
      context: {
        ...thing.context,
        isUnknown: true,
        notes: 'Intentionally left unknown. Uncertainty tolerated.',
      },
      updatedAt: new Date().toISOString(),
    };
    onUpdateThing(updated);
    setIsEditingContext(false);
  };

  const handleAcceptAiSuggestion = () => {
    if (!thing.aiInterpretation) return;
    const updated: Thing = {
      ...thing,
      types: thing.aiInterpretation.detectedTypes || thing.types,
      uncertaintyState: 'verified',
      description: thing.description, // Original description remains intact!
      updatedAt: new Date().toISOString(),
    };
    onUpdateThing(updated);
  };

  const handleDismissAiSuggestion = () => {
    const updated: Thing = {
      ...thing,
      aiInterpretation: undefined,
      updatedAt: new Date().toISOString(),
    };
    onUpdateThing(updated);
  };

  const handleCreateRel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!relTargetId) return;
    onAddRelationship(relTargetId, relLabel.trim() || undefined);
    setIsAddingRel(false);
    setRelTargetId('');
    setRelLabel('');
  };

  // Available other things to connect to
  const connectableThings = allThings.filter(
    (t) =>
      t.id !== thing.id &&
      t.status === 'active' &&
      !thingRelationships.some((r) => r.source === t.id || r.target === t.id)
  );

  return (
    <aside
      id="thing-detail-drawer"
      className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-[#0f1219]/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl z-40 flex flex-col text-slate-200 overflow-y-auto"
    >
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 sticky top-0 bg-[#0f1219]/90 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase text-slate-400 tracking-wider">Thing</span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
              thing.isRoot
                ? 'bg-white/10 text-white border border-white/30'
                : thing.uncertaintyState === 'unknown'
                ? 'bg-amber-950/40 text-amber-400 border border-amber-800/40'
                : thing.uncertaintyState === 'unverified'
                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                : 'bg-emerald-950/30 text-emerald-400 border border-emerald-800/30'
            }`}
          >
            {thing.isRoot ? 'Origin Node' : `State: ${thing.uncertaintyState}`}
          </span>
        </div>
        <button
          id="close-drawer-btn"
          onClick={onClose}
          className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-6 flex-1">
        {/* Title and Description */}
        <div>
          <h2 className="text-2xl font-serif text-white tracking-wide font-normal">
            {thing.title || 'Untitled Thing'}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {thing.types.map((type) => (
              <span
                key={type}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800/80 text-slate-300 border border-slate-700/50"
              >
                #{type}
              </span>
            ))}
          </div>
        </div>

        {/* Root Node Notice */}
        {thing.isRoot && (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono text-slate-400 leading-relaxed">
            <p className="text-white font-medium mb-1">Origin Anchor</p>
            {thing.description}
          </div>
        )}

        {/* ORIGINAL HUMAN DUMP — Always preserved intact! */}
        {!thing.isRoot && (
          <div className="rounded-xl border border-slate-800 bg-[#121620] p-4">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs font-mono text-slate-400">
              <span className="text-slate-300 font-semibold uppercase tracking-wider">
                Original Human Input
              </span>
              <span className="text-[10px] text-slate-500">Immutable record</span>
            </div>
            <p className="text-sm font-sans text-slate-200 leading-relaxed whitespace-pre-wrap selection:bg-slate-700">
              {thing.originalDumpText || thing.description}
            </p>
          </div>
        )}

        {/* AI INTERPRETATION (Distinguished from human input) */}
        {!thing.isRoot && thing.aiInterpretation && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                AI Interpretation
              </span>
              <span className="text-[10px] text-amber-500/80">Suggestion, not a fact</span>
            </div>

            {thing.aiInterpretation.summary && (
              <p className="text-xs text-slate-300 italic font-sans leading-relaxed">
                "{thing.aiInterpretation.summary}"
              </p>
            )}

            {thing.aiInterpretation.contextQuestion && (
              <div className="text-xs text-amber-300/90 bg-amber-950/30 p-2.5 rounded-lg border border-amber-900/30">
                <span className="font-mono font-medium block text-amber-400 mb-0.5">
                  Context Question:
                </span>
                {thing.aiInterpretation.contextQuestion}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAcceptAiSuggestion}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-mono transition cursor-pointer"
              >
                <Check className="w-3 h-3" />
                <span>Accept Suggestion</span>
              </button>
              <button
                onClick={handleDismissAiSuggestion}
                className="flex items-center gap-1 px-2.5 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono transition cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Dismiss</span>
              </button>
            </div>
          </div>
        )}

        {/* LIGHTWEIGHT CONTEXTUAL FORM */}
        {!thing.isRoot && (
          <div className="rounded-xl border border-slate-800/80 bg-[#121620] p-4 space-y-4">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300 font-semibold uppercase tracking-wider">
                Context Clarification
              </span>
              <button
                onClick={() => setIsEditingContext(!isEditingContext)}
                className="text-slate-400 hover:text-amber-300 flex items-center gap-1 text-[11px]"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isEditingContext ? 'Cancel' : 'Edit Context'}</span>
              </button>
            </div>

            {isEditingContext ? (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    What is this?
                  </label>
                  <input
                    type="text"
                    value={whatIsThisInput}
                    onChange={(e) => setWhatIsThisInput(e.target.value)}
                    placeholder="e.g. coffee brewing calculator or research note"
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Possible type:
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {[
                      'project',
                      'idea',
                      'application',
                      'person',
                      'place',
                      'thought',
                      'unknown',
                    ].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedTypeInput(type)}
                        className={`px-2 py-1 rounded text-[10px] font-mono transition capitalize cursor-pointer ${
                          selectedTypeInput === type
                            ? 'bg-amber-500 text-black font-semibold'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">
                    Anything else? (Optional)
                  </label>
                  <input
                    type="text"
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Fragmented thoughts, details..."
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/60"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleSaveContext}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-mono font-medium hover:bg-amber-400 transition cursor-pointer"
                  >
                    Save Context
                  </button>
                  <button
                    onClick={handleLeaveUnknown}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono transition cursor-pointer"
                  >
                    Leave Unknown
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs space-y-2 text-slate-300">
                {thing.context?.whatIsThis ? (
                  <div>
                    <span className="text-slate-500 font-mono text-[11px] block">Clarification:</span>
                    <p>{thing.context.whatIsThis}</p>
                  </div>
                ) : (
                  <p className="text-slate-500 italic text-[11px]">
                    No contextual clarification added yet. (Unknown is valid)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* RELATIONSHIPS */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1 border-b border-slate-800">
            <span className="text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5" />
              Relationships ({thingRelationships.length})
            </span>
            {!thing.isRoot && (
              <button
                onClick={() => setIsAddingRel(!isAddingRel)}
                className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Connect</span>
              </button>
            )}
          </div>

          {/* Add relationship form */}
          {isAddingRel && (
            <form
              onSubmit={handleCreateRel}
              className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5"
            >
              <label className="block text-[11px] font-mono text-slate-400">
                Connect to existing Thing:
              </label>
              <select
                value={relTargetId}
                onChange={(e) => setRelTargetId(e.target.value)}
                className="w-full rounded bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
              >
                <option value="">Select a Thing...</option>
                {connectableThings.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title || t.description.slice(0, 30)}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={relLabel}
                onChange={(e) => setRelLabel(e.target.value)}
                placeholder="Relationship label (e.g., uses, part of, sparked)"
                className="w-full rounded bg-slate-800 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={!relTargetId}
                  className="px-2.5 py-1 rounded bg-amber-500 text-black text-xs font-mono font-medium disabled:opacity-50 cursor-pointer"
                >
                  Create Connection
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingRel(false)}
                  className="px-2.5 py-1 rounded text-slate-400 text-xs font-mono hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* List of active relationships */}
          {thingRelationships.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              Isolated node. Zero relationships. (The mess is the data).
            </p>
          ) : (
            <div className="space-y-2">
              {thingRelationships.map((rel) => {
                const otherThing = getOtherThing(rel);
                if (!otherThing) return null;
                const isAi = rel.type === 'ai_suggested';

                return (
                  <div
                    key={rel.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      isAi
                        ? 'bg-amber-950/20 border-amber-900/40 text-amber-200'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onSelectOtherThing(otherThing.id)}
                          className="font-medium text-white hover:text-amber-400 flex items-center gap-1 cursor-pointer"
                        >
                          <span>{otherThing.title || otherThing.description.slice(0, 20)}</span>
                          <ArrowUpRight className="w-3 h-3 opacity-60" />
                        </button>
                        {isAi && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono">
                            AI suggested
                          </span>
                        )}
                      </div>
                      {rel.label && (
                        <p className="text-[10px] font-mono text-slate-400">"{rel.label}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAi && (
                        <button
                          onClick={() => onConfirmAiRelationship(rel.id)}
                          className="px-2 py-0.5 rounded bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 text-[10px] font-mono transition cursor-pointer"
                          title="Confirm this connection"
                        >
                          Confirm
                        </button>
                      )}
                      <button
                        onClick={() => onRemoveRelationship(rel.id)}
                        className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                        title="Remove link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drawer Footer Actions */}
      {!thing.isRoot && (
        <div className="p-4 border-t border-slate-800/80 bg-[#0c0e14] flex items-center justify-between">
          <button
            id="erase-thing-btn"
            onClick={() => onEraseThing(thing.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 transition cursor-pointer"
            title="Move to Erased (Reversible)"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Move to Erased</span>
          </button>
          <span className="text-[10px] font-mono text-slate-600">
            Reversible anytime
          </span>
        </div>
      )}
    </aside>
  );
};
