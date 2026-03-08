export function normalizeNodeVersion(rawVersion: unknown): string | null;

export function shouldReuseBundledNode(
  existingVersion: unknown,
  expectedVersion: unknown,
): boolean;

export function readBundledNodeVersion(binaryPath: string): string | null;
