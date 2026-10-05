import { Claim, ClaimBindingAudit } from '../domain/types';
import { IStorageDriver, STORES } from './db';

export class ClaimRepository {
  constructor(private driver: IStorageDriver) {}

  async saveClaim(claim: Claim): Promise<void> {
    await this.driver.put(STORES.CLAIMS, claim);
  }

  async getClaim(id: string): Promise<Claim | null> {
    return this.driver.get<Claim>(STORES.CLAIMS, id);
  }

  async getAllClaims(): Promise<Claim[]> {
    return this.driver.getAll<Claim>(STORES.CLAIMS);
  }

  async getClaimsBySubject(entityId: string): Promise<Claim[]> {
    return this.driver.getAll<Claim>(
      STORES.CLAIMS,
      'subjectEntityId',
      (c) => c.subjectEntityId === entityId
    );
  }

  async getClaimsByDumpId(dumpId: string): Promise<Claim[]> {
    return this.driver.getAll<Claim>(
      STORES.CLAIMS,
      'dumpId',
      (c) => c.dumpId === dumpId
    );
  }

  async getActiveClaimsForEntity(entityId: string): Promise<Claim[]> {
    return this.driver.getAll<Claim>(
      STORES.CLAIMS,
      'subjectEntityId',
      (c) =>
        c.subjectEntityId === entityId &&
        c.status === 'active' &&
        c.reviewState !== 'rejected'
    );
  }

  async getRelationalClaims(entityId: string): Promise<Claim[]> {
    return this.driver.getAll<Claim>(
      STORES.CLAIMS,
      undefined,
      (c) =>
        (c.subjectEntityId === entityId ||
          (c.objectValue.type === 'entity_id' && c.objectValue.value === entityId)) &&
        c.status === 'active' &&
        c.reviewState !== 'rejected'
    );
  }

  // ==========================================
  // Audits
  // ==========================================

  async saveClaimAudit(audit: ClaimBindingAudit): Promise<void> {
    await this.driver.put(STORES.CLAIM_AUDITS, audit);
  }

  async getAuditsForClaim(claimId: string): Promise<ClaimBindingAudit[]> {
    return this.driver.getAll<ClaimBindingAudit>(
      STORES.CLAIM_AUDITS,
      'claimId',
      (a) => a.claimId === claimId
    );
  }
}
