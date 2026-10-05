import { HumanOverride } from '../domain/types';
import { IStorageDriver, STORES } from './db';

export class HumanOverrideRepository {
  constructor(private driver: IStorageDriver) {}

  async saveOverride(override: HumanOverride): Promise<void> {
    await this.driver.put(STORES.HUMAN_OVERRIDES, override);
  }

  async getOverride(id: string): Promise<HumanOverride | null> {
    return this.driver.get<HumanOverride>(STORES.HUMAN_OVERRIDES, id);
  }

  async getOverridesForTarget(
    targetType: HumanOverride['targetType'],
    targetId: string
  ): Promise<HumanOverride[]> {
    return this.driver.getAll<HumanOverride>(
      STORES.HUMAN_OVERRIDES,
      'targetId',
      (o) => o.targetType === targetType && o.targetId === targetId
    );
  }

  async getAllOverrides(): Promise<HumanOverride[]> {
    return this.driver.getAll<HumanOverride>(STORES.HUMAN_OVERRIDES);
  }
}
