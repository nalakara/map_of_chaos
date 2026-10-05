import { ThingProjection, EdgeProjection } from '../domain/types';

export interface ProjectionDiagnostics {
  entitiesCount: number;
  projectedThingsCount: number;
  claimsCount: number;
  projectedEdgesCount: number;
  skippedEdgesCount: number;
}

export interface ProjectionResult {
  things: ThingProjection[];
  edges: EdgeProjection[];
  diagnostics: ProjectionDiagnostics;
}
