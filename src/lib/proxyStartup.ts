import { invoke } from "@tauri-apps/api/core";

interface StartupProxyConfig {
  proxyUrl: string;
  proxyEnabled: boolean;
}

type InvokeFn = typeof invoke;

export async function hydrateProxyConfigOnStartup(
  config: StartupProxyConfig,
  invokeFn: InvokeFn = invoke,
): Promise<void> {
  if (!config.proxyUrl && !config.proxyEnabled) {
    return;
  }

  await invokeFn("set_proxy_config", {
    proxyUrl: config.proxyUrl,
    enabled: config.proxyEnabled,
  });
}
