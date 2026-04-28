/**
 * Local revocation cache, refreshed daily from `GET /v1/license/revocations`
 * (CONTRACT.md §2.5). Implemented in task C6.
 */

export async function isRevoked(_lid: string): Promise<boolean> {
  throw new Error('luminaCloud.isRevoked: not implemented yet (task C6)');
}
