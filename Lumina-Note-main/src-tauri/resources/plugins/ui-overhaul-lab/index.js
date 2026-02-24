module.exports = function setup(api) {
  const removeRibbon = api.ui.registerRibbonItem({
    id: "launch-ui-overhaul",
    title: "UI Lab",
    icon: "🧪",
    run: () => api.workspace.mountView({
      viewType: "ui-lab",
      title: "UI Overhaul Lab",
      html: "<h2>UI Overhaul Lab</h2><p>This view is mounted from a plugin.</p>"
    })
  });
  const removeStatus = api.ui.registerStatusBarItem({
    id: "ui-overhaul-status",
    text: "UI Lab Active",
    align: "right"
  });
  const removeSlot = api.workspace.registerShellSlot({
    slotId: "app-top",
    order: 950,
    html: "<div>UI Overhaul banner from plugin</div>"
  });
  const removeStyle = api.ui.injectStyle({
    layer: "override",
    global: true,
    css: ".ui-panel { border-color: hsl(var(--primary) / 0.55); }"
  });
  return () => {
    removeStyle();
    removeSlot();
    removeStatus();
    removeRibbon();
  };
};
