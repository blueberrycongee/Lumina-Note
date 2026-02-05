module.exports = function setup(api, plugin) {
  const unregister = api.commands.registerSlashCommand({
    key: "hello-lumina",
    description: "Insert a plugin-generated hello message",
    prompt: "请用简短友好的语气问候我，并说明这是由 Lumina 插件生成的。"
  });

  api.logger.info(`[${plugin.id}] loaded from ${plugin.source}`);

  return () => {
    unregister();
    api.logger.info(`[${plugin.id}] unloaded`);
  };
};
