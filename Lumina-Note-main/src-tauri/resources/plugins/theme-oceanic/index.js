module.exports = function setup(api) {
  const removePreset = api.theme.registerPreset({
    id: "oceanic",
    tokens: {
      "--primary": "199 82% 48%",
      "--ui-radius-md": "16px",
      "--ui-radius-lg": "22px"
    },
    dark: {
      "--background": "210 35% 9%",
      "--foreground": "205 40% 95%"
    }
  });
  api.theme.applyPreset("oceanic");
  const removeStyle = api.ui.injectStyle({
    layer: "theme",
    global: true,
    css: ".ui-card { box-shadow: 0 10px 32px hsl(var(--primary) / 0.18); }"
  });
  return () => {
    removeStyle();
    removePreset();
  };
};
