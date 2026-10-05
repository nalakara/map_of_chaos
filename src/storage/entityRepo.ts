import { Entity, EntityResolution, Mention } from '../domain/types';
import { IStorageDriver, STORES } from './db';

export class EntityRepository {
  constructor(private driver: IStorageDriver) {}

  // ==========================================
  // 1. Entities
  // ==========================================

  async saveEntity(entity: Entity): Promise<void> {
    await this.driver.put(STORES.ENTITIES, entity);
  }

  async getEntity(id: string): Promise<Entity | null> {
    return this.driver.get<Entity>(STORES.ENTITIES, id);
  }

  async getAllEntities(filter?: { status?: Entity['resolutionStatus'] }): Promise<Entity[]> {
    if (!filter) {
      return this.driver.getAll<Entity>(STORES.ENTITIES);
    }
    return this.driver.getAll<Entity>(
      STORES.ENTITIES,
      'resolutionStatus',
      (ent) => !filter.status || ent.resolutionStatus === filter.status
    );
  }

  async findByCanonicalName(name: string): Promise<Entity | null> {
    const normalized = name.trim().toLowerCase();
    const entities = await this.driver.getAll<Entity>(
      STORES.ENTITIES,
      'canonicalName',
      (ent) => ent.canonicalName.toLowerCase() === normalized
    );
    return entities.length > 0 ? entities[0] : null;
  }

  // ==========================================
  // 2. Mentions
  // ==========================================

  async saveMention(mention: Mention): Promise<void> {
    await this.driver.put(STORES.MENTIONS, mention);
  }

  async getMention(id: string): Promise<Mention | null> {
    return this.driver.get<Mention>(STORES.MENTIONS, id);
  }

  async getMentionsByDumpId(dumpId: string): Promise<Mention[]> {
    return this.driver.getAll<Mention>(
      STORES.MENTIONS,
      'dumpId',
      (m) => m.dumpId === dumpId
    );
  }

  // ==========================================
  // 3. Entity Resolutions
  // ==========================================

  async saveResolution(resolution: EntityResolution): Promise<void> {
    await this.driver.put(STORES.ENTITY_RESOLUTIONS, resolution);
  }

  async getResolution(id: string): Promise<EntityResolution | null> {
    return this.driver.get<EntityResolution>(STORES.ENTITY_RESOLUTIONS, id);
  }

  async getActiveResolutionForMention(mentionId: string): Promise<EntityResolution | null> {
    const resolutions = await this.driver.getAll<EntityResolution>(
      STORES.ENTITY_RESOLUTIONS,
      'mentionId',
      (r) => r.mentionId === mentionId && r.status === 'active'
    );
    return resolutions.length > 0 ? resolutions[0] : null;
  }

  async getResolutionsForMention(mentionId: string): Promise<EntityResolution[]> {
    return this.driver.getAll<EntityResolution>(
      STORES.ENTITY_RESOLUTIONS,
      'mentionId',
      (r) => r.mentionId === mentionId
    );
  }

  async getAllResolutions(): Promise<EntityResolution[]> {
    return this.driver.getAll<EntityResolution>(STORES.ENTITY_RESOLUTIONS);
  }
}
