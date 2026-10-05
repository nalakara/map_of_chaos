import { Claim, Entity, ThingProjection, EdgeProjection } from '../domain/types';
import { USER_SELF_ENTITY_ID } from '../pipeline/resolution/types';
import { IContextStore } from '../storage/contextStore';
import { ProjectionResult } from './types';

/**
 * ContextProjector - Pure deterministic projection of accumulated semantic context
 * Transforms ContextStore persistent Entities and relational Claims into ThingProjection
 * and EdgeProjection view models without inventing relationships or semantic interpretations.
 */
export class ContextProjector {
  /**
   * Projects entities and claims from context arrays.
   * Pure, synchronous, and deterministic.
   */
  projectFromContext(entities: Entity[], claims: Claim[]): ProjectionResult {
    const timestamp = new Date().toISOString();

    // 1. Sort entities deterministically by ID
    const sortedEntities = [...entities].sort((a, b) => a.id.localeCompare(b.id));

    // 2. Project Entities to ThingProjection
    const thingProjections: ThingProjection[] = [];
    const thingMap = new Map<string, ThingProjection>();

    for (const entity of sortedEntities) {
      const isRoot = entity.id === USER_SELF_ENTITY_ID;

      // Determine display types from semantic context and claims
      let displayTypes: string[];
      if (isRoot) {
        displayTypes = ['person', 'origin'];
      } else {
        const entityClaims = claims.filter(
          (c) =>
            c.subjectEntityId === entity.id ||
            (c.objectValue.type === 'entity_id' && c.objectValue.value === entity.id)
        );
        const isBusiness = entityClaims.some(
          (c) =>
            c.predicate === 'operates_business' ||
            c.qualifiers?.category === 'business_line' ||
            c.predicate === 'focuses_on_domain' ||
            c.predicate === 'operates_in_sector'
        );

        if (isBusiness) {
          displayTypes = ['company'];
        } else if (
          entity.associatedHandles.length > 0 ||
          (entity as { typeHint?: string }).typeHint === 'social_handle'
        ) {
          displayTypes = ['social_handle'];
        } else if ((entity as { typeHint?: string }).typeHint) {
          displayTypes = [(entity as { typeHint?: string }).typeHint as string];
        } else {
          displayTypes = ['concept'];
        }
      }

      // Determine uncertainty badge
      let uncertaintyBadge: ThingProjection['uncertaintyBadge'];
      if (entity.epistemicStatus === 'verified') {
        uncertaintyBadge = 'verified';
      } else if (entity.resolutionStatus === 'ambiguous') {
        uncertaintyBadge = 'ambiguous';
      } else if (entity.epistemicStatus === 'unverified') {
        uncertaintyBadge = 'unverified';
      } else {
        uncertaintyBadge = 'unknown';
      }

      // Create ThingProjection with stable identity = entity.id
      const thing: ThingProjection = {
        id: entity.id,
        entityId: entity.id,
        title: entity.canonicalName,
        displayTypes,
        uncertaintyBadge,
        isProjected: true,
        projectionReason: isRoot ? 'user_pinned' : 'isolated_presence',
        radius: isRoot ? 28 : 14,
        degree: 0,
        projectedAt: timestamp,
      };

      thingProjections.push(thing);
      thingMap.set(entity.id, thing);
    }

    // 3. Project Relational Claims to EdgeProjection
    const edgeProjections: EdgeProjection[] = [];
    let skippedEdgesCount = 0;

    // Filter active, non-rejected claims sorted deterministically
    const activeClaims = claims
      .filter((c) => c.status === 'active' && c.reviewState !== 'rejected')
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const claim of activeClaims) {
      // Must be a relational claim pointing to an entity_id
      if (claim.objectValue.type !== 'entity_id' || typeof claim.objectValue.value !== 'string') {
        continue;
      }

      const sourceThing = thingMap.get(claim.subjectEntityId);
      const targetThing = thingMap.get(claim.objectValue.value);

      // S-2.2 & Phase 3 Rule: DO NOT invent nodes or edges if endpoints are not resolved entities
      if (!sourceThing || !targetThing) {
        skippedEdgesCount++;
        continue;
      }

      // Prohibit self-referential cycles from inflating degrees unless required
      const isSolid =
        claim.sourceOrigin === 'human_stated' ||
        claim.reviewState === 'human_confirmed';

      const edge: EdgeProjection = {
        id: `edge-${claim.id}`,
        claimId: claim.id,
        sourceThingId: claim.subjectEntityId,
        targetThingId: claim.objectValue.value,
        label: claim.predicate,
        style: isSolid ? 'solid' : 'dashed',
        isVisible: true,
      };

      edgeProjections.push(edge);

      // Increment degrees
      sourceThing.degree++;
      targetThing.degree++;
    }

    // 4. Update degrees, salience, and radii for projected nodes
    for (const thing of thingProjections) {
      const isRoot = thing.entityId === USER_SELF_ENTITY_ID;
      if (!isRoot) {
        thing.radius = Math.max(14, Math.min(26, 14 + thing.degree * 2.5));
        if (thing.degree > 0 && thing.projectionReason === 'isolated_presence') {
          thing.projectionReason = 'high_salience';
        }
      }
    }

    return {
      things: thingProjections,
      edges: edgeProjections,
      diagnostics: {
        entitiesCount: entities.length,
        projectedThingsCount: thingProjections.length,
        claimsCount: claims.length,
        projectedEdgesCount: edgeProjections.length,
        skippedEdgesCount,
      },
    };
  }

  /**
   * Projects directly from an IContextStore asynchronously.
   */
  async project(contextStore: IContextStore): Promise<ProjectionResult> {
    const [entities, claims] = await Promise.all([
      contextStore.getAllEntities(),
      contextStore.getAllClaims(),
    ]);
    return this.projectFromContext(entities, claims);
  }
}
