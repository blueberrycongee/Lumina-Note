module.exports = function setup(api) {
  const removeRibbon = api.ui.registerRibbonItem({
    id: "open-browser-tab",
    title: "Browser",
    iconName: "browser",
    section: "top",
    order: 270,
    activeWhenTabTypes: ["webpage"],
    run: () => api.workspace.openBrowserTab(),
  });

  return () => {
    removeRibbon();
  };
};
