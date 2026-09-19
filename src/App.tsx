import React, { useState, useEffect } from 'react';
import { Thing, Relationship, Dump, WanderEntry, ViewMode } from './types';
import {
  INITIAL_THINGS,
  INITIAL_RELATIONSHIPS,
  INITIAL_DUMPS,
  INITIAL_WANDERS,
  ROOT_NODE_ID,
} from './data/initialData';
import { Header } from './components/Header';
import { MapCanvas } from './components/MapCanvas';
import { DumpBox } from './components/DumpBox';
import { ThingDetailDrawer } from './components/ThingDetailDrawer';
import { InboxView } from './components/InboxView';
import { WanderView } from './components/WanderView';
import { ErasedView } from './components/ErasedView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { analyzeDumpLocally, reflectOnWander } from './services/aiService';

const STORAGE_KEYS = {
  THINGS: 'map_of_chaos_things_v1',
  RELATIONSHIPS: 'map_of_chaos_relationships_v1',
  DUMPS: 'map_of_chaos_dumps_v1',
  WANDERS: 'map_of_chaos_wanders_v1',
};

export default function App() {
  // Load state from localStorage or initialize with prototype data
  const [things, setThings] = useState<Thing[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THINGS);
      return saved ? JSON.parse(saved) : INITIAL_THINGS;
    } catch {
      return INITIAL_THINGS;
    }
  });

  const [relationships, setRelationships] = useState<Relationship[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RELATIONSHIPS);
      return saved ? JSON.parse(saved) : INITIAL_RELATIONSHIPS;
    } catch {
      return INITIAL_RELATIONSHIPS;
    }
  });

  const [dumps, setDumps] = useState<Dump[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DUMPS);
      return saved ? JSON.parse(saved) : INITIAL_DUMPS;
    } catch {
      return INITIAL_DUMPS;
    }
  });

  const [wanders, setWanders] = useState<WanderEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WANDERS);
      return saved ? JSON.parse(saved) : INITIAL_WANDERS;
    } catch {
      return INITIAL_WANDERS;
    }
  });

  const [currentView, setCurrentView] = useState<ViewMode>('map');
  const [selectedThingId, setSelectedThingId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THINGS, JSON.stringify(things));
    } catch (e) {
      console.error('Storage sync error', e);
    }
  }, [things]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.RELATIONSHIPS, JSON.stringify(relationships));
    } catch (e) {
      console.error('Storage sync error', e);
    }
  }, [relationships]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DUMPS, JSON.stringify(dumps));
    } catch (e) {
      console.error('Storage sync error', e);
    }
  }, [dumps]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WANDERS, JSON.stringify(wanders));
    } catch (e) {
      console.error('Storage sync error', e);
    }
  }, [wanders]);

  // Selected thing object
  const selectedThing = things.find((t) => t.id === selectedThingId) || null;

  // Counts for navigation badges
  const inboxCount = things.filter(
    (t) => !t.isRoot && t.status === 'active' && t.uncertaintyState !== 'verified'
  ).length;

  const erasedCount = things.filter((t) => t.status === 'erased').length;

  // PRIMARY ACTION: DUMP
  // Write -> Save immediately. No categorization required.
  const handleDump = (rawText: string) => {
    setIsAnalyzing(true);

    const dumpId = `dump-${Date.now()}`;
    const analysis = analyzeDumpLocally(rawText, things);

    const newThings: Thing[] = [];
    const newRelationships: Relationship[] = [];

    analysis.suggestedThings.forEach((suggested, index) => {
      const thingId = `thing-${Date.now()}-${index}`;

      // Calculate organic offset from center
      const angle = Math.random() * Math.PI * 2;
      const distance = 140 + Math.random() * 160;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      const createdThing: Thing = {
        id: thingId,
        title: suggested.title,
        description: suggested.description,
        originalDumpId: dumpId,
        originalDumpText: rawText, // Preserved forever
        types: suggested.types,
        uncertaintyState: suggested.uncertaintyState,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aiInterpretation: {
          summary: suggested.summary,
          detectedTypes: suggested.types,
          contextQuestion: suggested.contextQuestion,
          suggestedRelationships: suggested.suggestedRelationships,
        },
        context: {
          isUnknown: suggested.uncertaintyState === 'unknown',
          whatIsThis: suggested.uncertaintyState === 'unknown' ? '' : suggested.title,
          possibleType: suggested.types[0],
          notes: '',
        },
        x,
        y,
      };

      newThings.push(createdThing);

      // If suggested relationships were generated
      if (suggested.suggestedRelationships) {
        suggested.suggestedRelationships.forEach((rel) => {
          newRelationships.push({
            id: `rel-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            source: thingId,
            target: rel.targetThingId,
            label: rel.reason,
            type: 'ai_suggested',
            certainty: rel.certainty,
            createdAt: new Date().toISOString(),
          });
        });
      }
    });

    // Create persistent dump log
    const newDump: Dump = {
      id: dumpId,
      rawText,
      timestamp: new Date().toISOString(),
      extractedThingIds: newThings.map((t) => t.id),
    };

    setDumps((prev) => [newDump, ...prev]);
    setThings((prev) => [...prev, ...newThings]);
    setRelationships((prev) => [...prev, ...newRelationships]);

    setIsAnalyzing(false);

    // If on another view, return to Map so Yudhan can see where it appeared
    if (currentView !== 'map') {
      setCurrentView('map');
    }

    // Automatically focus on the primary newly created thing
    if (newThings.length > 0) {
      setSelectedThingId(newThings[0].id);
    }
  };

  // Update a Thing's details (clarification, context, etc.)
  const handleUpdateThing = (updated: Thing) => {
    setThings((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  // Position update when user drags a node
  const handleUpdateThingPosition = (id: string, x: number, y: number) => {
    setThings((prev) =>
      prev.map((t) => (t.id === id ? { ...t, x, y } : t))
    );
  };

  // Confirm AI-suggested relationship into solid human relationship
  const handleConfirmAiRelationship = (relationshipId: string) => {
    setRelationships((prev) =>
      prev.map((r) =>
        r.id === relationshipId
          ? { ...r, type: 'user_confirmed', certainty: 'confirmed' }
          : r
      )
    );
  };

  // Remove a relationship
  const handleRemoveRelationship = (relationshipId: string) => {
    setRelationships((prev) => prev.filter((r) => r.id !== relationshipId));
  };

  // Add human-confirmed connection
  const handleAddRelationship = (targetId: string, label?: string) => {
    if (!selectedThingId) return;
    const newRel: Relationship = {
      id: `rel-user-${Date.now()}`,
      source: selectedThingId,
      target: targetId,
      label,
      type: 'user_confirmed',
      certainty: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    setRelationships((prev) => [...prev, newRel]);
  };

  // ERASED: Reversible removal from active world
  const handleEraseThing = (thingId: string) => {
    setThings((prev) =>
      prev.map((t) => (t.id === thingId ? { ...t, status: 'erased' } : t))
    );
    if (selectedThingId === thingId) {
      setSelectedThingId(null);
    }
  };

  // Restore Thing from Erased back to active Map
  const handleRestoreThing = (thingId: string) => {
    setThings((prev) =>
      prev.map((t) => (t.id === thingId ? { ...t, status: 'active' } : t))
    );
    setSelectedThingId(thingId);
    setCurrentView('map');
  };

  // Permanently delete a Thing
  const handlePermanentDelete = (thingId: string) => {
    setThings((prev) => prev.filter((t) => t.id !== thingId));
    setRelationships((prev) =>
      prev.filter((r) => r.source !== thingId && r.target !== thingId)
    );
  };

  // WANDERING: Record unstructured thoughts & let AI echo evidence from Map
  const handleAddWanderEntry = (content: string) => {
    const reflection = reflectOnWander(content, things);
    const newEntry: WanderEntry = {
      id: `wander-${Date.now()}`,
      content,
      timestamp: new Date().toISOString(),
      reflection,
    };
    setWanders((prev) => [newEntry, ...prev]);
  };

  // Reset to prototype sample state
  const handleResetToDemo = () => {
    if (
      window.confirm(
        'Reset Map of Chaos to initial prototype sample data? (Coffee Calculator, Borga, Yudhan origin, etc.)'
      )
    ) {
      setThings(INITIAL_THINGS);
      setRelationships(INITIAL_RELATIONSHIPS);
      setDumps(INITIAL_DUMPS);
      setWanders(INITIAL_WANDERS);
      setSelectedThingId(null);
      setCurrentView('map');
      localStorage.removeItem(STORAGE_KEYS.THINGS);
      localStorage.removeItem(STORAGE_KEYS.RELATIONSHIPS);
      localStorage.removeItem(STORAGE_KEYS.DUMPS);
      localStorage.removeItem(STORAGE_KEYS.WANDERS);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0c0e12] text-slate-100 font-sans">
      {/* Primary Navigation Header */}
      <Header
        currentView={currentView}
        onSelectView={(view) => {
          setCurrentView(view);
          if (view !== 'map') {
            setSelectedThingId(null);
          }
        }}
        inboxCount={inboxCount}
        erasedCount={erasedCount}
        onResetToDemo={handleResetToDemo}
      />

      {/* Main View Area */}
      <main className="flex-1 relative overflow-hidden">
        {/* MAP VIEW (The primary central screen) */}
        {currentView === 'map' && (
          <div className="w-full h-full relative">
            <MapCanvas
              things={things}
              relationships={relationships}
              selectedThingId={selectedThingId}
              onSelectThing={setSelectedThingId}
              onUpdateThingPosition={handleUpdateThingPosition}
            />

            {/* Persistent Floating Dump Dock */}
            <div className="absolute bottom-6 inset-x-0 pointer-events-none flex justify-center">
              <div className="pointer-events-auto w-full max-w-2xl px-4">
                <DumpBox onDump={handleDump} isAnalyzing={isAnalyzing} />
              </div>
            </div>
          </div>
        )}

        {/* INBOX VIEW */}
        {currentView === 'inbox' && (
          <InboxView
            things={things}
            onSelectThing={(id) => {
              setSelectedThingId(id);
              setCurrentView('map');
            }}
            onNavigateToMap={() => setCurrentView('map')}
          />
        )}

        {/* WANDER VIEW */}
        {currentView === 'wander' && (
          <WanderView
            entries={wanders}
            allThings={things}
            onAddWanderEntry={handleAddWanderEntry}
            onSelectThing={(id) => {
              setSelectedThingId(id);
              setCurrentView('map');
            }}
            onNavigateToMap={() => setCurrentView('map')}
          />
        )}

        {/* ERASED VIEW */}
        {currentView === 'erased' && (
          <ErasedView
            things={things}
            onRestoreThing={handleRestoreThing}
            onPermanentDelete={handlePermanentDelete}
          />
        )}

        {/* THING DETAIL SIDE DRAWER (Opens when a node is selected) */}
        {selectedThing && currentView === 'map' && (
          <ThingDetailDrawer
            thing={selectedThing}
            allThings={things}
            relationships={relationships}
            onClose={() => setSelectedThingId(null)}
            onUpdateThing={handleUpdateThing}
            onConfirmAiRelationship={handleConfirmAiRelationship}
            onRemoveRelationship={handleRemoveRelationship}
            onAddRelationship={handleAddRelationship}
            onEraseThing={handleEraseThing}
            onSelectOtherThing={setSelectedThingId}
          />
        )}
      </main>

      {/* PWA Offline indicator */}
      <OfflineIndicator />
    </div>
  );
}
