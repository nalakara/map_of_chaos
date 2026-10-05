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
import { reflectOnWander } from './services/aiService';
import { getDefaultContextStore } from './storage/contextStore';
import { SemanticExtractionOrchestrator } from './pipeline/extraction/extractor';
import { DeterministicSemanticExtractor } from './pipeline/extraction/deterministic';
import { DeterministicEntityResolver } from './pipeline/resolution/resolver';
import { ContextAccumulator } from './pipeline/resolution/accumulator';
import { ContextProjector } from './projection/projector';
import { projectToMapElements } from './projection/adapter';
import { Dump as DomainDump } from './domain/types';

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

  // Load semantic context from ContextStore on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const store = await getDefaultContextStore();
        const existingEntities = await store.getAllEntities();
        if (existingEntities.length > 0 && isMounted) {
          const projector = new ContextProjector();
          const projection = await projector.project(store);
          const elements = projectToMapElements(projection);
          setThings(elements.things);
          setRelationships(elements.relationships);
        }
      } catch (err) {
        console.error('Failed to load semantic context from storage:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // PRIMARY ACTION: DUMP
  // Ingests raw text into Semantic Pipeline -> Resolution -> ContextStore -> Projection -> Map
  const handleDump = async (rawText: string) => {
    setIsAnalyzing(true);
    try {
      const dumpId = `dump-${Date.now()}`;
      const store = await getDefaultContextStore();

      const domainDump: DomainDump = {
        id: dumpId,
        rawText,
        source: 'web_dock',
        createdAt: new Date().toISOString(),
        processingStatus: 'captured',
      };
      await store.dumps.saveDump(domainDump);

      const orchestrator = new SemanticExtractionOrchestrator(new DeterministicSemanticExtractor());
      const resolver = new DeterministicEntityResolver();
      const accumulator = new ContextAccumulator(store, resolver);

      const grounded = await orchestrator.extractAndGround(domainDump, store.dumps, store.entities);
      const accumulated = await accumulator.accumulate(grounded);

      // Build existing coordinates map so dragged nodes maintain their positions
      const coordMap = new Map<string, { x?: number; y?: number }>();
      things.forEach((t) => coordMap.set(t.id, { x: t.x, y: t.y }));

      // Project context
      const projector = new ContextProjector();
      const projection = await projector.project(store);
      const elements = projectToMapElements(projection, coordMap);

      setThings(elements.things);
      setRelationships(elements.relationships);

      // Create persistent dump log for UI
      const newDump: Dump = {
        id: dumpId,
        rawText,
        timestamp: new Date().toISOString(),
        extractedThingIds: accumulated.createdEntities.map((e) => e.id),
      };
      setDumps((prev) => [newDump, ...prev]);

      if (currentView !== 'map') {
        setCurrentView('map');
      }

      if (accumulated.createdEntities.length > 0) {
        setSelectedThingId(accumulated.createdEntities[0].id);
      }
    } catch (err) {
      console.error('Semantic pipeline processing error:', err);
    } finally {
      setIsAnalyzing(false);
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
  const handleResetToDemo = async () => {
    if (
      window.confirm(
        'Reset Map of Chaos to initial prototype sample data? (Coffee Calculator, Borga, Yudhan origin, etc.)'
      )
    ) {
      try {
        const store = await getDefaultContextStore();
        await store.clear();
      } catch (err) {
        console.warn('Could not clear ContextStore:', err);
      }
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
