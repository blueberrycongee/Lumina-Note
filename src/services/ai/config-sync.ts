let configSyncTail: Promise<void> = Promise.resolve();

export function enqueueAIConfigSync(work: () => Promise<void>): Promise<void> {
  const run = configSyncTail.catch(() => undefined).then(work);
  configSyncTail = run.catch(() => undefined);
  return run;
}

export async function waitForAIConfigSync(): Promise<void> {
  await configSyncTail.catch(() => undefined);
}

export function resetAIConfigSyncForTests(): void {
  configSyncTail = Promise.resolve();
}
