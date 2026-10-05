import { Thing, Relationship } from '../types';
import { USER_SELF_ENTITY_ID } from '../pipeline/resolution/types';
import { ProjectionResult } from './types';

/**
 * Adapts pure domain ThingProjection & EdgeProjection models into the UI-level
 * Thing & Relationship interfaces expected by MapCanvas and Map components.
 */
export function projectToMapElements(
  projection: ProjectionResult,
  existingCoordinates?: Map<string, { x?: number; y?: number }>
): {
  things: Thing[];
  relationships: Relationship[];
} {
  const things: Thing[] = projection.things.map((p) => {
    const isRoot = p.entityId === USER_SELF_ENTITY_ID;
    const coords = existingCoordinates?.get(p.id);

    const uncertaintyState: Thing['uncertaintyState'] =
      p.uncertaintyBadge === 'verified'
        ? 'verified'
        : p.uncertaintyBadge === 'unverified'
        ? 'unverified'
        : 'unknown';

    return {
      id: p.id,
      title: p.title,
      description: p.summary || p.title,
      types: p.displayTypes,
      isRoot,
      uncertaintyState,
      status: 'active',
      createdAt: p.projectedAt,
      updatedAt: p.projectedAt,
      x: coords?.x ?? p.x,
      y: coords?.y ?? p.y,
      context: {
        whatIsThis: p.title,
        possibleType: p.displayTypes[0],
      },
    };
  });

  const relationships: Relationship[] = projection.edges.map((e) => {
    return {
      id: e.id,
      source: e.sourceThingId,
      target: e.targetThingId,
      label: e.label,
      type: e.style === 'solid' ? 'user_confirmed' : 'ai_suggested',
      certainty: e.style === 'solid' ? 'confirmed' : 'suggested',
      createdAt: new Date().toISOString(),
    };
  });

  return {
    things,
    relationships,
  };
}
