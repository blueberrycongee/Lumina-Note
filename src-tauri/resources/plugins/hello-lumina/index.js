module.exports = function setup(api, plugin) {
  const unregister = api.commands.registerSlashCommand({
    key: "hello-lumina",
    description: "Insert a plugin-generated hello message",
    prompt: "请用简短友好的语气问候我，并说明这是由 Lumina 插件生成的。"
  });

  const restoreTheme = api.ui.setThemeVariables({
    "--lumina-plugin-accent": "#0ea5e9"
  });
  const removeStyle = api.ui.injectStyle(`
    :root {
      --plugin-hello-ring: color-mix(in srgb, var(--lumina-plugin-accent) 40%, transparent);
    }
    .plugin-hello-highlight {
      outline: 1px solid var(--plugin-hello-ring);
      border-radius: 8px;
    }
  `, "hello-lumina");

  const timer = api.runtime.setInterval(() => {
    api.logger.info(`[${plugin.id}] heartbeat`);
  }, 60_000);

  api.logger.info(`[${plugin.id}] loaded from ${plugin.source}`);
  api.ui.notify("Hello Lumina plugin loaded");

  return () => {
    unregister();
    api.runtime.clearInterval(timer);
    removeStyle();
    restoreTheme();
    api.logger.info(`[${plugin.id}] unloaded`);
  };
};
