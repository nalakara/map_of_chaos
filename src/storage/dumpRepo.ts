import { Dump, Evidence } from '../domain/types';
import { IStorageDriver, STORES } from './db';

export class DumpRepository {
  constructor(private driver: IStorageDriver) {}

  async saveDump(dump: Dump): Promise<void> {
    await this.driver.put(STORES.DUMPS, dump);
  }

  async getDump(id: string): Promise<Dump | null> {
    return this.driver.get<Dump>(STORES.DUMPS, id);
  }

  async getAllDumps(): Promise<Dump[]> {
    return this.driver.getAll<Dump>(STORES.DUMPS);
  }

  async saveEvidence(evidence: Evidence): Promise<void> {
    await this.driver.put(STORES.EVIDENCE, evidence);
  }

  async getEvidence(id: string): Promise<Evidence | null> {
    return this.driver.get<Evidence>(STORES.EVIDENCE, id);
  }

  async getEvidenceByDumpId(dumpId: string): Promise<Evidence[]> {
    return this.driver.getAll<Evidence>(
      STORES.EVIDENCE,
      'dumpId',
      (ev) => ev.dumpId === dumpId
    );
  }

  async getEvidenceForDump(dumpId: string): Promise<Evidence[]> {
    return this.getEvidenceByDumpId(dumpId);
  }
}
