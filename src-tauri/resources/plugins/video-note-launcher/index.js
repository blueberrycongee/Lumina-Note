module.exports = function setup(api) {
  const removeRibbon = api.ui.registerRibbonItem({
    id: "open-video-note",
    title: "Video Note",
    iconName: "video",
    section: "top",
    order: 220,
    activeWhenTabTypes: ["video-note"],
    run: () => api.workspace.openVideoNote(),
  });

  return () => {
    removeRibbon();
  };
};
