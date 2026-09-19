import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3Force from 'd3-force';
import { useGesture } from '@use-gesture/react';
import { Thing, Relationship } from '../types';
import { ROOT_NODE_ID } from '../data/initialData';
import { Plus, Minus, RotateCcw, Target, Sparkles, AlertCircle } from 'lucide-react';

interface MapCanvasProps {
  things: Thing[];
  relationships: Relationship[];
  selectedThingId: string | null;
  onSelectThing: (thingId: string | null) => void;
  onUpdateThingPosition?: (id: string, x: number, y: number) => void;
}

interface GraphNode extends d3Force.SimulationNodeDatum {
  id: string;
  thing: Thing;
  degree: number;
  radius: number;
  isIsolated: boolean;
}

interface GraphLink extends d3Force.SimulationLinkDatum<GraphNode> {
  id: string;
  relationship: Relationship;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  things,
  relationships,
  selectedThingId,
  onSelectThing,
  onUpdateThingPosition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 });
  const [transform, setTransform] = useState({ x: 500, y: 350, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // Active things only (status === 'active')
  const activeThings = useMemo(
    () => things.filter((t) => t.status === 'active'),
    [things]
  );

  // Active relationships between active things
  const activeThingIds = useMemo(
    () => new Set(activeThings.map((t) => t.id)),
    [activeThings]
  );

  const activeRelationships = useMemo(() => {
    return relationships.filter(
      (r) => activeThingIds.has(r.source) && activeThingIds.has(r.target)
    );
  }, [relationships, activeThingIds]);

  // Calculate degrees for node sizing
  const degreeMap = useMemo(() => {
    const map: Record<string, number> = {};
    activeThings.forEach((t) => (map[t.id] = 0));
    activeRelationships.forEach((r) => {
      map[r.source] = (map[r.source] || 0) + 1;
      map[r.target] = (map[r.target] || 0) + 1;
    });
    return map;
  }, [activeThings, activeRelationships]);

  // Simulation nodes and links
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const simulationRef = useRef<d3Force.Simulation<GraphNode, GraphLink> | null>(null);

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
        // Initial center
        setTransform((prev) => {
          if (prev.x === 500 && prev.y === 350) {
            return { x: width / 2, y: height / 2, k: 1 };
          }
          return prev;
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initialize and run d3-force simulation
  useEffect(() => {
    if (activeThings.length === 0) return;

    // Preserve existing positions if available
    const existingNodeMap = new Map(nodes.map((n) => [n.id, n]));

    const graphNodes: GraphNode[] = activeThings.map((t) => {
      const existing = existingNodeMap.get(t.id);
      const degree = degreeMap[t.id] || 0;
      const isIsolated = degree === 0 && !t.isRoot;
      // Size: Yudhan is 28, others range 14 - 24 based on connections
      const radius = t.isRoot ? 28 : Math.max(14, Math.min(26, 14 + degree * 2.5));

      return {
        id: t.id,
        thing: t,
        degree,
        radius,
        isIsolated,
        x: existing?.x ?? t.x ?? (t.isRoot ? 0 : (Math.random() - 0.5) * 350),
        y: existing?.y ?? t.y ?? (t.isRoot ? 0 : (Math.random() - 0.5) * 350),
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        fx: t.isRoot ? 0 : existing?.fx ?? null,
        fy: t.isRoot ? 0 : existing?.fy ?? null,
      };
    });

    const nodeById = new Map(graphNodes.map((n) => [n.id, n]));

    const graphLinks: GraphLink[] = [];
    activeRelationships.forEach((r) => {
      const sourceNode = nodeById.get(r.source);
      const targetNode = nodeById.get(r.target);
      if (sourceNode && targetNode) {
        graphLinks.push({
          id: r.id,
          relationship: r,
          source: sourceNode,
          target: targetNode,
        });
      }
    });

    // Build simulation
    // - Strong link distance for human-confirmed links, looser distance for AI-suggested
    // - Repulsion so nodes don't overlap
    // - Allow isolated nodes to float freely without forced center pull
    const linkForce = d3Force
      .forceLink<GraphNode, GraphLink>(graphLinks)
      .id((d) => d.id)
      .distance((d) => (d.relationship.type === 'ai_suggested' ? 140 : 100))
      .strength((d) => (d.relationship.type === 'ai_suggested' ? 0.3 : 0.7));

    const chargeForce = d3Force
      .forceManyBody<GraphNode>()
      .strength((d) => (d.thing.isRoot ? -350 : d.isIsolated ? -120 : -220))
      .distanceMax(450);

    const collisionForce = d3Force
      .forceCollide<GraphNode>()
      .radius((d) => d.radius + 18)
      .iterations(2);

    const sim = d3Force
      .forceSimulation<GraphNode>(graphNodes)
      .force('link', linkForce)
      .force('charge', chargeForce)
      .force('collision', collisionForce)
      .alphaDecay(0.025);

    // Root anchor: pin Yudhan strictly to coordinate (0, 0)
    const rootNode = graphNodes.find((n) => n.thing.isRoot);
    if (rootNode) {
      rootNode.fx = 0;
      rootNode.fy = 0;
    }

    sim.on('tick', () => {
      setNodes([...graphNodes]);
      setLinks([...graphLinks]);
    });

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [activeThings.length, activeRelationships.length, degreeMap]);

  // Stable refs for gesture callbacks
  const nodesRef = useRef<GraphNode[]>(nodes);
  nodesRef.current = nodes;
  const onSelectThingRef = useRef(onSelectThing);
  onSelectThingRef.current = onSelectThing;
  const onUpdateThingPositionRef = useRef(onUpdateThingPosition);
  onUpdateThingPositionRef.current = onUpdateThingPosition;
  const selectedThingIdRef = useRef(selectedThingId);
  selectedThingIdRef.current = selectedThingId;

  // React-use-gesture: unified pinch-to-zoom, two-finger panning, single-finger panning, and node dragging
  useGesture(
    {
      onDrag: ({ first, active, last, delta, memo, tap, event, xy }) => {
        const evt = event as any;
        // If 2 or more touches are active, yield to onPinch for fluid 2-finger zoom/pan
        if (
          (evt?.touches && evt.touches.length > 1) ||
          (evt?.pointerType === 'touch' && evt?.isPrimary === false)
        ) {
          return memo;
        }

        const target = event.target as Element | null;
        const nodeElement = target?.closest('[data-node-id]') as SVGElement | null;
        const nodeId = nodeElement?.getAttribute('data-node-id');

        if (first) {
          if (nodeId) {
            const node = nodesRef.current.find((n) => n.id === nodeId);
            if (node) {
              draggedNodeRef.current = node;
              const rect = containerRef.current?.getBoundingClientRect();
              const pointerX = xy[0] - (rect?.left || 0);
              const pointerY = xy[1] - (rect?.top || 0);
              const worldX = (pointerX - transformRef.current.x) / transformRef.current.k;
              const worldY = (pointerY - transformRef.current.y) / transformRef.current.k;
              node.fx = worldX;
              node.fy = worldY;
              simulationRef.current?.alphaTarget(0.2).restart();
              return { mode: 'node', node, hasMoved: false };
            }
          }
          setIsPanning(true);
          return { mode: 'pan', hasMoved: false };
        }

        if (active && memo) {
          if (memo.mode === 'node' && memo.node) {
            const n = memo.node;
            const rect = containerRef.current?.getBoundingClientRect();
            const pointerX = xy[0] - (rect?.left || 0);
            const pointerY = xy[1] - (rect?.top || 0);
            const worldX = (pointerX - transformRef.current.x) / transformRef.current.k;
            const worldY = (pointerY - transformRef.current.y) / transformRef.current.k;
            n.fx = worldX;
            n.fy = worldY;
            simulationRef.current?.alpha(0.2).restart();
            memo.hasMoved = true;
            return memo;
          }

          if (memo.mode === 'pan') {
            setTransform((prev) => ({
              ...prev,
              x: prev.x + delta[0],
              y: prev.y + delta[1],
            }));
            memo.hasMoved = true;
            return memo;
          }
        }

        if (last && memo) {
          if (memo.mode === 'node' && memo.node) {
            const n = memo.node;
            if (!n.thing.isRoot) {
              n.fx = null;
              n.fy = null;
              if (
                memo.hasMoved &&
                onUpdateThingPositionRef.current &&
                n.x !== undefined &&
                n.y !== undefined
              ) {
                onUpdateThingPositionRef.current(n.id, Math.round(n.x), Math.round(n.y));
              }
            }
            simulationRef.current?.alphaTarget(0);
            draggedNodeRef.current = null;
          } else if (memo.mode === 'pan') {
            setIsPanning(false);
            if (tap || !memo.hasMoved) {
              // Tapped on canvas background -> deselect
              onSelectThingRef.current(null);
            }
          }
        }

        return memo;
      },

      onPinch: ({ first, active, offset: [scale], origin: [ox, oy], da: [dist], memo, event }) => {
        if (event.cancelable) {
          event.preventDefault();
        }

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return memo;

        const currentOriginX = ox - rect.left;
        const currentOriginY = oy - rect.top;

        if (first) {
          const worldCenterX = (currentOriginX - transformRef.current.x) / transformRef.current.k;
          const worldCenterY = (currentOriginY - transformRef.current.y) / transformRef.current.k;
          return {
            worldCenterX,
            worldCenterY,
            startK: transformRef.current.k,
            startScale: scale,
            startDist: dist || 1,
          };
        }

        if (!memo) return memo;

        // Optical zoom calculation supporting both mobile multi-touch pinch and trackpad pinch
        const scaleRatio =
          dist > 0 && memo.startDist > 0 ? dist / memo.startDist : scale / (memo.startScale || 1);
        const newK = Math.max(0.2, Math.min(3.5, memo.startK * scaleRatio));

        // Center zoom & two-finger pan simultaneously around touch midpoint
        const newX = currentOriginX - memo.worldCenterX * newK;
        const newY = currentOriginY - memo.worldCenterY * newK;

        setTransform({
          k: newK,
          x: newX,
          y: newY,
        });

        return memo;
      },

      onWheel: ({ event, delta: [, dy] }) => {
        if (event.ctrlKey) return; // Allow pinch handler to manage ctrlKey trackpad pinch
        if (event.cancelable) event.preventDefault();

        const zoomFactor = dy < 0 ? 1.08 : 0.92;
        const newK = Math.max(0.2, Math.min(3.5, transformRef.current.k * zoomFactor));

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = (event as WheelEvent).clientX - rect.left;
        const mouseY = (event as WheelEvent).clientY - rect.top;

        const currentK = transformRef.current.k;
        const newX = mouseX - (mouseX - transformRef.current.x) * (newK / currentK);
        const newY = mouseY - (mouseY - transformRef.current.y) * (newK / currentK);

        setTransform({ x: newX, y: newY, k: newK });
      },
    },
    {
      target: containerRef,
      eventOptions: { passive: false },
      drag: {
        filterTaps: true,
        preventScroll: true,
      },
      pinch: {
        scaleBounds: { min: 0.2, max: 3.5 },
      },
    }
  );

  const zoomIn = () => {
    setTransform((prev) => {
      const newK = Math.min(3.5, prev.k * 1.25);
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      return {
        k: newK,
        x: cx - (cx - prev.x) * (newK / prev.k),
        y: cy - (cy - prev.y) * (newK / prev.k),
      };
    });
  };

  const zoomOut = () => {
    setTransform((prev) => {
      const newK = Math.max(0.2, prev.k * 0.8);
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      return {
        k: newK,
        x: cx - (cx - prev.x) * (newK / prev.k),
        y: cy - (cy - prev.y) * (newK / prev.k),
      };
    });
  };

  const centerOnYudhan = () => {
    setTransform({
      x: dimensions.width / 2,
      y: dimensions.height / 2,
      k: 1,
    });
  };

  // Helper to color nodes based on types or uncertainty
  const getNodeFill = (node: GraphNode) => {
    if (node.thing.isRoot) return '#ffffff';
    if (node.thing.uncertaintyState === 'unknown') return '#334155';
    const primaryType = node.thing.types[0];
    switch (primaryType) {
      case 'project':
        return '#38bdf8'; // Sky blue
      case 'application':
        return '#818cf8'; // Indigo
      case 'idea':
        return '#34d399'; // Emerald
      case 'concern':
        return '#f87171'; // Coral red
      case 'question':
        return '#fbbf24'; // Amber
      case 'place':
        return '#fb923c'; // Orange
      case 'collection':
        return '#c084fc'; // Purple
      default:
        return '#94a3b8'; // Slate
    }
  };

  // Connected node IDs to highlighted selection
  const selectedNeighborIds = useMemo(() => {
    if (!selectedThingId) return new Set<string>();
    const set = new Set<string>();
    set.add(selectedThingId);
    activeRelationships.forEach((r) => {
      if (r.source === selectedThingId) set.add(r.target);
      if (r.target === selectedThingId) set.add(r.source);
    });
    return set;
  }, [selectedThingId, activeRelationships]);

  return (
    <div
      ref={containerRef}
      id="map-canvas-container"
      className="relative w-full h-full select-none overflow-hidden bg-[#0c0e12] cursor-grab active:cursor-grabbing touch-none"
      style={{ touchAction: 'none' }}
    >
      {/* Background cartographic grid */}
      <svg
        id="map-background"
        className="w-full h-full absolute inset-0 pointer-events-auto"
      >
        <defs>
          <pattern
            id="carto-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${transform.x % 48},${transform.y % 48}) scale(${transform.k})`}
          >
            <circle cx="24" cy="24" r="0.8" fill="#1e293b" />
          </pattern>
          <radialGradient id="yudhan-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="url(#carto-grid)"
          className="pointer-events-none"
        />

        {/* Transformed world layer */}
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
          {/* Subtle concentric guide circles radiating gently from Yudhan */}
          <circle cx="0" cy="0" r="120" fill="none" stroke="#171d28" strokeWidth="1" strokeDasharray="3 6" />
          <circle cx="0" cy="0" r="260" fill="none" stroke="#131922" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="0" cy="0" r="420" fill="none" stroke="#0f141c" strokeWidth="1" strokeDasharray="6 12" />

          {/* Relationships / Links */}
          <g id="map-links">
            {links.map((link) => {
              const sourceNode = typeof link.source === 'object' ? link.source : null;
              const targetNode = typeof link.target === 'object' ? link.target : null;
              if (!sourceNode || !targetNode || sourceNode.x === undefined || targetNode.x === undefined) {
                return null;
              }

              const isAi = link.relationship.type === 'ai_suggested';
              const isSelected =
                selectedThingId &&
                (link.relationship.source === selectedThingId || link.relationship.target === selectedThingId);
              const isDimmed = selectedThingId && !isSelected;

              // Intermediate curve or straight line
              const x1 = sourceNode.x ?? 0;
              const y1 = sourceNode.y ?? 0;
              const x2 = targetNode.x ?? 0;
              const y2 = targetNode.y ?? 0;

              return (
                <g key={link.id} className="transition-opacity duration-300">
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={
                      isSelected
                        ? isAi
                          ? '#f59e0b'
                          : '#ffffff'
                        : isAi
                        ? '#d97706'
                        : '#334155'
                    }
                    strokeWidth={isSelected ? 2.5 : isAi ? 1.5 : 1.2}
                    strokeDasharray={isAi ? '5 5' : undefined}
                    strokeOpacity={isDimmed ? 0.15 : isSelected ? 1 : isAi ? 0.75 : 0.6}
                  />

                  {/* AI suggestion label tag if highlighted or hovered */}
                  {isAi && (isSelected || transform.k > 0.9) && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 5}
                      textAnchor="middle"
                      fill="#f59e0b"
                      fontSize="9"
                      fontFamily="monospace"
                      opacity={isDimmed ? 0.2 : 0.85}
                      className="pointer-events-none select-none"
                    >
                      [suggested link]
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Nodes */}
          <g id="map-nodes">
            {nodes.map((node) => {
              if (node.x === undefined || node.y === undefined) return null;
              const isRoot = node.thing.isRoot;
              const isSelected = selectedThingId === node.id;
              const isNeighbor = selectedNeighborIds.has(node.id);
              const isDimmed = selectedThingId !== null && !isNeighbor;
              const isUnknown = node.thing.uncertaintyState === 'unknown';
              const isIsolated = node.isIsolated;

              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer transition-opacity duration-200"
                  opacity={isDimmed ? 0.25 : 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectThing(node.id === selectedThingId ? null : node.id);
                  }}
                >
                  {/* Selection / Focus Halo */}
                  {isSelected && (
                    <circle
                      r={node.radius + 10}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      className="animate-spin-slow"
                    />
                  )}

                  {/* Root Yudhan glow */}
                  {isRoot && (
                    <>
                      <circle r="46" fill="url(#yudhan-glow)" />
                      <circle
                        r="34"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="1.2"
                        strokeOpacity="0.4"
                        strokeDasharray="4 4"
                      />
                    </>
                  )}

                  {/* Isolated node subtle dashed boundary (the mess is the data!) */}
                  {isIsolated && (
                    <circle
                      r={node.radius + 6}
                      fill="none"
                      stroke="#475569"
                      strokeWidth="1"
                      strokeDasharray="2 3"
                      strokeOpacity="0.6"
                    />
                  )}

                  {/* Main Node Body */}
                  <circle
                    r={node.radius}
                    fill={isRoot ? '#0c0e12' : '#141720'}
                    stroke={getNodeFill(node)}
                    strokeWidth={isRoot ? 3 : isSelected ? 2.5 : isUnknown ? 1.5 : 2}
                    strokeDasharray={isUnknown ? '3 3' : undefined}
                    filter={isSelected ? 'url(#node-glow)' : undefined}
                  />

                  {/* Root node center core */}
                  {isRoot && (
                    <circle r="8" fill="#ffffff" />
                  )}

                  {/* Isolated or Unknown marker icon */}
                  {isUnknown && !isRoot && (
                    <text
                      y="4"
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                      className="pointer-events-none"
                    >
                      ?
                    </text>
                  )}

                  {/* Node Label */}
                  <text
                    y={node.radius + 14}
                    textAnchor="middle"
                    fill={isRoot ? '#ffffff' : isSelected ? '#f8fafc' : '#cbd5e1'}
                    fontSize={isRoot ? '13' : '11'}
                    fontFamily={isRoot ? 'Cinzel, serif' : 'Plus Jakarta Sans, sans-serif'}
                    fontWeight={isRoot ? '700' : isSelected ? '600' : '400'}
                    letterSpacing={isRoot ? '0.15em' : '0.02em'}
                    className="pointer-events-none select-none drop-shadow-sm"
                  >
                    {node.thing.title || node.thing.description.slice(0, 24)}
                  </text>

                  {/* Secondary type / uncertainty subscript (visible when zoomed or selected) */}
                  {(isSelected || transform.k > 0.85) && !isRoot && (
                    <text
                      y={node.radius + 26}
                      textAnchor="middle"
                      fill={isUnknown ? '#ef4444' : '#64748b'}
                      fontSize="8.5"
                      fontFamily="JetBrains Mono, monospace"
                      className="pointer-events-none select-none opacity-80"
                    >
                      {isUnknown
                        ? 'context: unknown'
                        : node.thing.types[0] || 'thing'}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Map Control HUD (Minimalist, calm, unobtrusive, mobile-optimized) */}
      <div className="absolute bottom-28 sm:bottom-6 right-4 sm:right-6 flex flex-col gap-2 sm:gap-1.5 z-20">
        <button
          id="map-zoom-in-btn"
          onClick={zoomIn}
          className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg sm:rounded-md bg-[#12161f]/90 hover:bg-[#1e2433] active:scale-95 border border-slate-700 sm:border-slate-800 text-slate-200 sm:text-slate-300 flex items-center justify-center transition shadow-lg cursor-pointer touch-manipulation"
          title="Zoom In"
        >
          <Plus className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>
        <button
          id="map-zoom-out-btn"
          onClick={zoomOut}
          className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg sm:rounded-md bg-[#12161f]/90 hover:bg-[#1e2433] active:scale-95 border border-slate-700 sm:border-slate-800 text-slate-200 sm:text-slate-300 flex items-center justify-center transition shadow-lg cursor-pointer touch-manipulation"
          title="Zoom Out"
        >
          <Minus className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>
        <button
          id="map-center-yudhan-btn"
          onClick={centerOnYudhan}
          className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg sm:rounded-md bg-[#12161f]/90 hover:bg-[#1e2433] active:scale-95 border border-slate-700 sm:border-slate-800 text-slate-200 sm:text-slate-300 flex items-center justify-center transition shadow-lg cursor-pointer touch-manipulation"
          title="Center on Yudhan (Origin Anchor)"
        >
          <Target className="w-5 h-5 sm:w-4 sm:h-4" />
        </button>
      </div>

      {/* Subdued map status legend */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 bg-[#0c0e12]/80 backdrop-blur-xs px-3 py-1.5 rounded border border-slate-800/60">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white ring-2 ring-white/30" />
            <span className="text-slate-300">Yudhan (Origin)</span>
          </span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-slate-500" />
            <span>Human connection</span>
          </span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-amber-400" />
            <span className="text-amber-400/90">AI suggested</span>
          </span>
          <span className="text-slate-700">|</span>
          <span>{activeThings.length} Things visible</span>
        </div>
      </div>
    </div>
  );
};
