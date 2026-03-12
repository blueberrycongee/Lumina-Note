module.exports = function setup(api) {
  const OVERVIEW_TAB_TYPE = "openclaw-workspace-overview";
  const CRON_EDITOR_TAB_TYPE = "openclaw-cron-editor";
  const KEY_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md", "MEMORY.md"];
  const ARTIFACT_PREFIXES = ["output/", "artifacts/", "tmp/docs/"];
  const PLAN_PREFIXES = ["plans/", "docs/plans/", ".openclaw/plans/", "output/plans/"];

  let cachedSnapshot = null;
  let disposeUi = () => {};

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const normalizeRelativePath = (workspacePath, path) => {
    const normalizedWorkspace = String(workspacePath || "").replace(/\\/g, "/").replace(/\/+$/, "");
    const normalizedPath = String(path || "").replace(/\\/g, "/");
    if (!normalizedWorkspace) {
      return normalizedPath.replace(/^\/+/, "");
    }
    if (normalizedPath === normalizedWorkspace) {
      return "";
    }
    if (normalizedPath.startsWith(`${normalizedWorkspace}/`)) {
      return normalizedPath.slice(normalizedWorkspace.length + 1);
    }
    return normalizedPath.replace(/^\/+/, "");
  };

  // ---------------------------------------------------------------------------
  // Cron helpers
  // ---------------------------------------------------------------------------

  const humanizeSchedule = (schedule) => {
    if (!schedule) return "unknown";
    if (schedule.kind === "cron") {
      const tz = schedule.tz ? ` (${schedule.tz})` : "";
      return `cron: ${schedule.expr || "?"}${tz}`;
    }
    if (schedule.kind === "every") {
      const ms = schedule.everyMs || 0;
      if (ms >= 86400000) return `every ${Math.round(ms / 86400000)}d`;
      if (ms >= 3600000) return `every ${Math.round(ms / 3600000)}h`;
      if (ms >= 60000) return `every ${Math.round(ms / 60000)}m`;
      return `every ${ms}ms`;
    }
    if (schedule.kind === "at") {
      return `at ${schedule.at || "?"}`;
    }
    return "unknown";
  };

  const renderCronSection = (jobs) => {
    if (!jobs || jobs.length === 0) {
      return [
        '<h3 id="cron-jobs">Cron jobs</h3>',
        "<p>No cron jobs configured.</p>",
        '<p><button data-plugin-action="create-cron-job" style="cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;font:inherit;padding:0;">+ Create cron job</button></p>',
      ].join("");
    }
    const rows = jobs
      .map((job) => {
        const status = job.enabled ? "enabled" : "disabled";
        const toggleLabel = job.enabled ? "Disable" : "Enable";
        return [
          "<tr>",
          `<td><code>${escapeHtml(job.name)}</code></td>`,
          `<td>${escapeHtml(humanizeSchedule(job.schedule))}</td>`,
          `<td>${status}</td>`,
          `<td>${escapeHtml(job.sessionTarget || "main")}</td>`,
          "<td>",
          `<button data-plugin-action="toggle-cron-job" data-job-id="${escapeHtml(job.jobId)}" data-enabled="${job.enabled}" style="cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;font:inherit;padding:0;margin-right:8px;">${toggleLabel}</button>`,
          `<button data-plugin-action="edit-cron-job" data-job-id="${escapeHtml(job.jobId)}" style="cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;font:inherit;padding:0;margin-right:8px;">Edit</button>`,
          `<button data-plugin-action="delete-cron-job" data-job-id="${escapeHtml(job.jobId)}" style="cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;font:inherit;padding:0;">Delete</button>`,
          "</td>",
          "</tr>",
        ].join("");
      })
      .join("");
    return [
      '<h3 id="cron-jobs">Cron jobs</h3>',
      `<p><strong>Total:</strong> ${jobs.length}</p>`,
      '<table><thead><tr><th>Name</th><th>Schedule</th><th>Status</th><th>Target</th><th>Actions</th></tr></thead>',
      `<tbody>${rows}</tbody></table>`,
      '<p><button data-plugin-action="create-cron-job" style="cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;font:inherit;padding:0;">+ Create cron job</button></p>',
    ].join("");
  };

  const renderCronForm = (job) => {
    const isEdit = Boolean(job && job.jobId);
    const title = isEdit ? `Edit cron job: ${escapeHtml(job.name)}` : "Create cron job";
    const scheduleKind = (job && job.schedule && job.schedule.kind) || "cron";
    const payloadKind = (job && job.payload && job.payload.kind) || "agentTurn";
    return [
      `<h3>${title}</h3>`,
      '<div data-plugin-form="cron-editor">',
      isEdit ? `<input type="hidden" name="jobId" value="${escapeHtml(job.jobId)}" />` : "",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Name</label>',
      `<input name="name" type="text" value="${escapeHtml((job && job.name) || "")}" class="ui-input" style="width:100%;" />`,
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Description</label>',
      `<input name="description" type="text" value="${escapeHtml((job && job.description) || "")}" class="ui-input" style="width:100%;" />`,
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Schedule kind</label>',
      '<select name="scheduleKind" class="ui-input" style="width:100%;">',
      `<option value="cron"${scheduleKind === "cron" ? " selected" : ""}>Cron expression</option>`,
      `<option value="every"${scheduleKind === "every" ? " selected" : ""}>Every interval</option>`,
      `<option value="at"${scheduleKind === "at" ? " selected" : ""}>At specific time</option>`,
      "</select>",
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Expression / interval / time</label>',
      `<input name="scheduleExpr" type="text" value="${escapeHtml(
        (job && job.schedule && (job.schedule.expr || (job.schedule.everyMs != null ? String(job.schedule.everyMs) : "") || job.schedule.at)) || ""
      )}" class="ui-input" style="width:100%;" placeholder="0 7 * * * / 3600000 / 2026-02-01T16:00:00Z" />`,
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Timezone (optional, for cron)</label>',
      `<input name="scheduleTz" type="text" value="${escapeHtml((job && job.schedule && job.schedule.tz) || "")}" class="ui-input" style="width:100%;" placeholder="America/Los_Angeles" />`,
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Payload kind</label>',
      '<select name="payloadKind" class="ui-input" style="width:100%;">',
      `<option value="agentTurn"${payloadKind === "agentTurn" ? " selected" : ""}>Agent turn</option>`,
      `<option value="systemEvent"${payloadKind === "systemEvent" ? " selected" : ""}>System event</option>`,
      "</select>",
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Message / text</label>',
      `<textarea name="payloadText" class="ui-input" style="width:100%;min-height:60px;" placeholder="Enter the message or event text">${escapeHtml(
        (job && job.payload && (job.payload.message || job.payload.text)) || ""
      )}</textarea>`,
      "</div>",
      '<div style="margin-bottom:12px;">',
      '<label style="display:block;font-weight:600;margin-bottom:4px;">Session target</label>',
      '<select name="sessionTarget" class="ui-input" style="width:100%;">',
      `<option value="main"${(!job || !job.sessionTarget || job.sessionTarget === "main") ? " selected" : ""}>Main</option>`,
      `<option value="isolated"${(job && job.sessionTarget === "isolated") ? " selected" : ""}>Isolated</option>`,
      "</select>",
      "</div>",
      '<div style="margin-bottom:12px;">',
      `<label><input name="enabled" type="checkbox"${(!job || job.enabled !== false) ? " checked" : ""} /> Enabled</label>`,
      "</div>",
      '<div style="margin-bottom:12px;">',
      `<label><input name="deleteAfterRun" type="checkbox"${(job && job.deleteAfterRun) ? " checked" : ""} /> Delete after run</label>`,
      "</div>",
      '<div>',
      `<button data-plugin-action="save-cron-job" style="cursor:pointer;text-decoration:underline;background:none;border:none;color:inherit;font:inherit;padding:0;">${isEdit ? "Save changes" : "Create job"}</button>`,
      "</div>",
      "</div>",
    ].join("");
  };

  const buildCronJobFromFormData = (data) => {
    const scheduleKind = data.scheduleKind || "cron";
    const schedule = { kind: scheduleKind };
    if (scheduleKind === "cron") {
      schedule.expr = data.scheduleExpr || "";
      if (data.scheduleTz) schedule.tz = data.scheduleTz;
    } else if (scheduleKind === "every") {
      schedule.everyMs = parseInt(data.scheduleExpr, 10) || 0;
    } else if (scheduleKind === "at") {
      schedule.at = data.scheduleExpr || "";
    }
    const payloadKind = data.payloadKind || "agentTurn";
    const payload = { kind: payloadKind };
    if (payloadKind === "agentTurn") {
      payload.message = data.payloadText || "";
    } else {
      payload.text = data.payloadText || "";
    }
    return {
      name: data.name || "Untitled job",
      enabled: data.enabled === "true",
      schedule,
      payload,
      sessionTarget: data.sessionTarget || "main",
      description: data.description || "",
      deleteAfterRun: data.deleteAfterRun === "true",
    };
  };

  // ---------------------------------------------------------------------------
  // Workspace inspection
  // ---------------------------------------------------------------------------

  const inspectWorkspace = async ({ force = false } = {}) => {
    const hostWorkspacePath = api.workspace.getPath();
    const openClawAttachment = api.workspace.getOpenClawAttachment();
    const workspacePath = api.workspace.getOpenClawWorkspacePath() || hostWorkspacePath;
    const detectedAttachment =
      openClawAttachment && openClawAttachment.status === "attached" ? openClawAttachment : null;
    if (!workspacePath) {
      cachedSnapshot = {
        hostWorkspacePath: null,
        workspacePath: null,
        attached: false,
        attachment: null,
        keyFiles: KEY_FILES.map((path) => ({ path, exists: false })),
        memoryFiles: [],
        planFiles: [],
        artifactFiles: [],
        bridgeNotes: [],
        conflictState: null,
      };
      return cachedSnapshot;
    }

    if (!force && cachedSnapshot && cachedSnapshot.workspacePath === workspacePath) {
      return cachedSnapshot;
    }

    const files = detectedAttachment
      ? await api.workspace.listOpenClawWorkspaceFiles()
      : await api.vault.listFiles();
    const normalized = Array.from(
      new Set(
        files
          .map((path) => normalizeRelativePath(workspacePath, path))
          .filter((path) => path.length > 0),
      ),
    ).sort((left, right) => left.localeCompare(right));
    const fileSet = new Set(normalized);
    const memoryFiles = normalized
      .filter((path) => path.startsWith("memory/") && path.toLowerCase().endsWith(".md"))
      .sort((left, right) => right.localeCompare(left));
    const planFiles = normalized.filter((path) =>
      PLAN_PREFIXES.some((prefix) => path.startsWith(prefix)),
    );
    const artifactFiles = normalized.filter((path) =>
      ARTIFACT_PREFIXES.some((prefix) => path.startsWith(prefix)) &&
      !PLAN_PREFIXES.some((prefix) => path.startsWith(prefix)),
    );
    const bridgeNotes = normalized.filter((path) =>
      path.startsWith(".lumina/openclaw-bridge-") && path.toLowerCase().endsWith(".md"),
    );
    const conflictState = api.workspace.getOpenClawConflictState();

    cachedSnapshot = {
      hostWorkspacePath,
      workspacePath,
      attached: Boolean(detectedAttachment),
      attachment: detectedAttachment,
      conflictState,
      keyFiles: KEY_FILES.map((path) => ({
        path,
        exists: fileSet.has(path),
      })),
      memoryFiles,
      planFiles,
      artifactFiles,
      bridgeNotes,
    };

    return cachedSnapshot;
  };

  const notifyNeedsAttachment = () => {
    api.ui.notify("Current workspace is not recognized as an OpenClaw workspace.");
    return false;
  };

  const openKnownFile = async (label, path) => {
    const snapshot = await inspectWorkspace({ force: true });
    if (!snapshot.attached) {
      return notifyNeedsAttachment();
    }
    if (!snapshot.keyFiles.some((entry) => entry.path === path && entry.exists)) {
      api.ui.notify(`${label} not found: ${path}`);
      return false;
    }
    await api.workspace.openOpenClawWorkspaceFile(path);
    return true;
  };

  const openLatestMemory = async () => {
    const snapshot = await inspectWorkspace({ force: true });
    if (!snapshot.attached) {
      return notifyNeedsAttachment();
    }
    const latest = snapshot.memoryFiles[0];
    if (!latest) {
      api.ui.notify("No OpenClaw daily memory files found.");
      return false;
    }
    await api.workspace.openOpenClawWorkspaceFile(latest);
    return true;
  };

  const buildBridgePath = (kind) =>
    `.lumina/openclaw-bridge-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;

  const stageBridgeNote = async (kind, content, metadata) => {
    const workspacePath = api.workspace.getOpenClawWorkspacePath();
    if (!workspacePath) {
      api.ui.notify("Attach an OpenClaw workspace first.");
      return false;
    }
    const attachment = api.workspace.getOpenClawAttachment();
    if (!attachment) {
      api.ui.notify("Attach an OpenClaw workspace first.");
      return false;
    }
    const body = [
      "---",
      "source: lumina-openclaw-bridge",
      `kind: ${kind}`,
      `created_at: ${new Date().toISOString()}`,
      ...Object.entries(metadata || {}).map(([key, value]) => `${key}: ${String(value)}`),
      "---",
      "",
      content,
      "",
    ].join("\n");
    const path = buildBridgePath(kind);
    await api.workspace.writeOpenClawWorkspaceFile(path, body);
    await api.workspace.openOpenClawWorkspaceFile(path);
    api.ui.notify(`Staged ${kind} into ${path}`);
    return true;
  };

  const stageCurrentNote = async () => {
    const activePath = api.workspace.getActiveFile();
    if (!activePath) {
      api.ui.notify("No active note to stage.");
      return false;
    }
    const content = await api.workspace.readFile(activePath);
    return stageBridgeNote("note", content, { source_file: activePath });
  };

  const stageSelection = async () => {
    const selection = api.editor.getSelection();
    const activePath = api.workspace.getActiveFile();
    if (!selection || !selection.text) {
      api.ui.notify("No editor selection to stage.");
      return false;
    }
    return stageBridgeNote("selection", selection.text, {
      source_file: activePath || "",
      selection_from: selection.from,
      selection_to: selection.to,
    });
  };

  const refreshAttachment = async () => {
    if (!api.workspace.getPath()) {
      api.ui.notify("Open a workspace first.");
      return false;
    }
    const attachment = await api.workspace.refreshOpenClawWorkspace();
    cachedSnapshot = null;
    api.ui.notify(
      attachment
        ? "Refreshed OpenClaw workspace metadata."
        : "Refreshed workspace detection, but no attachment exists yet.",
    );
    await rebuildUi();
    return Boolean(attachment);
  };

  // ---------------------------------------------------------------------------
  // Overview rendering
  // ---------------------------------------------------------------------------

  const renderOverview = (snapshot, cronJobs) => {
    const keyFileItems = snapshot.keyFiles
      .map(
        (entry) =>
          `<li><code>${escapeHtml(entry.path)}</code> <strong>${entry.exists ? "present" : "missing"}</strong></li>`,
      )
      .join("");
    const memoryItems = snapshot.memoryFiles
      .slice(0, 8)
      .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
      .join("");
    const artifactItems = snapshot.artifactFiles
      .slice(0, 8)
      .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
      .join("");
    const planItems = snapshot.planFiles
      .slice(0, 8)
      .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
      .join("");
    const bridgeItems = snapshot.bridgeNotes
      .slice(0, 4)
      .map((path) => `<li><code>${escapeHtml(path)}</code></li>`)
      .join("");

    if (!snapshot.workspacePath) {
      return [
        "<p>No workspace is currently open.</p>",
        "<p>Open any Lumina workspace, then attach an OpenClaw workspace path to use this integration.</p>",
      ].join("");
    }

    const status = snapshot.attached ? "Attached" : "Not attached";
    const guidance = snapshot.attached
      ? "<p>These remain the real files OpenClaw reads. Edit them from the normal file tree, not from a copy.</p>"
      : "<p>Choose an OpenClaw workspace path in settings, then use <code>Attach OpenClaw workspace</code> to mount it into the current Lumina workspace.</p>";

    return [
      `<p><strong>Status:</strong> ${status}</p>`,
      `<p><strong>Host workspace:</strong> <code>${escapeHtml(snapshot.hostWorkspacePath || "")}</code></p>`,
      `<p><strong>OpenClaw workspace:</strong> <code>${escapeHtml(snapshot.workspacePath)}</code></p>`,
      snapshot.attachment
        ? `<p><strong>Last validated:</strong> <code>${escapeHtml(
            snapshot.attachment.lastValidatedAt || "",
          )}</code></p>`
        : "",
      snapshot.attachment && snapshot.attachment.gateway && snapshot.attachment.gateway.enabled
        ? `<p><strong>Gateway:</strong> <code>${escapeHtml(snapshot.attachment.gateway.endpoint || "")}</code></p>`
        : "<p><strong>Gateway:</strong> not configured</p>",
      snapshot.conflictState && snapshot.conflictState.status === "warning"
        ? `<p><strong>Conflict:</strong> ${escapeHtml(snapshot.conflictState.message || "warning")}</p>`
        : "<p><strong>Conflict:</strong> none</p>",
      guidance,
      "<h3>Key memory files</h3>",
      `<ul>${keyFileItems || "<li>No key files found.</li>"}</ul>`,
      `<p><strong>Daily memory files:</strong> ${snapshot.memoryFiles.length}</p>`,
      memoryItems ? `<ul>${memoryItems}</ul>` : "<p>No daily memory files found.</p>",
      `<p><strong>Plan files:</strong> ${snapshot.planFiles.length}</p>`,
      planItems ? `<ul>${planItems}</ul>` : "<p>No plan files found under known plan folders.</p>",
      `<p><strong>Artifacts under known folders:</strong> ${snapshot.artifactFiles.length}</p>`,
      artifactItems ? `<ul>${artifactItems}</ul>` : "<p>No files found under output/, artifacts/, or tmp/docs/.</p>",
      `<p><strong>Bridge notes:</strong> ${snapshot.bridgeNotes.length}</p>`,
      bridgeItems ? `<ul>${bridgeItems}</ul>` : "<p>No Lumina bridge notes have been staged yet.</p>",
      renderCronSection(cronJobs),
      "<p>Quick actions are available from the command palette group <code>OpenClaw Workspace</code>.</p>",
    ].join("");
  };

  // ---------------------------------------------------------------------------
  // Tab openers
  // ---------------------------------------------------------------------------

  const loadCronJobs = async () => {
    try {
      return await api.workspace.listOpenClawCronJobs();
    } catch {
      return [];
    }
  };

  const openOverview = async () => {
    const snapshot = await inspectWorkspace({ force: true });
    const cronJobs = snapshot.attached ? await loadCronJobs() : [];
    api.workspace.openRegisteredTab(OVERVIEW_TAB_TYPE, {
      html: renderOverview(snapshot, cronJobs),
      attached: snapshot.attached,
      workspacePath: snapshot.workspacePath,
    });
  };

  const openCronEditor = async (jobId) => {
    let job = null;
    if (jobId) {
      const jobs = await loadCronJobs();
      job = jobs.find((j) => j.jobId === jobId) || null;
    }
    api.workspace.openRegisteredTab(CRON_EDITOR_TAB_TYPE, {
      html: renderCronForm(job),
      jobId: jobId || null,
    });
  };

  // ---------------------------------------------------------------------------
  // UI lifecycle
  // ---------------------------------------------------------------------------

  const cleanupUi = () => {
    disposeUi();
    disposeUi = () => {};
  };

  const attachWorkspace = async () => {
    if (!api.workspace.getPath()) {
      api.ui.notify("Open a workspace first.");
      return;
    }
    let snapshot;
    try {
      snapshot = await api.workspace.attachOpenClawWorkspace();
    } catch (error) {
      api.ui.notify(String(error));
      return;
    }
    cachedSnapshot = null;
    api.ui.notify(
      snapshot.detectedFiles.length > 0
        ? "Attached an OpenClaw workspace to the current Lumina workspace."
        : "Attached an OpenClaw workspace, but no OpenClaw markers were validated yet.",
    );
    await rebuildUi();
  };

  const detachWorkspace = async () => {
    if (!api.workspace.getPath()) {
      api.ui.notify("Open a workspace first.");
      return;
    }
    api.workspace.detachOpenClawWorkspace();
    cachedSnapshot = null;
    api.ui.notify("Cleared cached OpenClaw workspace state.");
    await rebuildUi();
  };

  const rebuildUi = async () => {
    cleanupUi();
    const snapshot = await inspectWorkspace({ force: true });
    const disposers = [];

    if (snapshot.attached) {
      disposers.push(
        api.ui.registerStatusBarItem({
          id: "openclaw-workspace-status",
          text:
            snapshot.attachment && snapshot.attachment.gateway && snapshot.attachment.gateway.enabled
              ? "OpenClaw: attached + gateway"
              : "OpenClaw: attached",
          align: "left",
          order: 260,
          run: () => {
            void openOverview();
          },
        }),
      );
      disposers.push(
        api.ui.registerRibbonItem({
          id: "open-openclaw-workspace",
          title: "OpenClaw",
          icon: "OC",
          section: "top",
          order: 290,
          run: () => {
            void openOverview();
          },
        }),
      );
    }

    disposers.push(
      api.ui.registerCommandPaletteGroup({
        id: "openclaw-workspace",
        title: "OpenClaw Workspace",
        commands: [
          {
            id: "attach-openclaw-workspace",
            title: "Attach OpenClaw workspace",
            description: snapshot.attached
              ? "Refresh the mounted OpenClaw workspace attachment."
              : "Attach an external OpenClaw workspace to the current Lumina workspace.",
            run: () => {
              void attachWorkspace();
            },
          },
          {
            id: "detach-openclaw-workspace",
            title: "Detach OpenClaw workspace",
            description: "Clear the mounted OpenClaw workspace state for this Lumina workspace.",
            run: () => {
              void detachWorkspace();
            },
          },
          {
            id: "open-overview",
            title: "Open overview",
            description: "Inspect the mounted OpenClaw workspace for memory files and artifacts.",
            run: () => {
              void openOverview();
            },
          },
          {
            id: "refresh-workspace-state",
            title: "Refresh workspace state",
            description: "Refresh OpenClaw attachment metadata from the mounted workspace files.",
            run: () => {
              void refreshAttachment();
            },
          },
          {
            id: "open-agents",
            title: "Open AGENTS.md",
            description: "Open the workspace instructions file.",
            run: () => {
              void openKnownFile("OpenClaw instructions", "AGENTS.md");
            },
          },
          {
            id: "open-soul",
            title: "Open SOUL.md",
            description: "Open the OpenClaw soul document.",
            run: () => {
              void openKnownFile("OpenClaw soul document", "SOUL.md");
            },
          },
          {
            id: "open-user",
            title: "Open USER.md",
            description: "Open the OpenClaw user profile document.",
            run: () => {
              void openKnownFile("OpenClaw user document", "USER.md");
            },
          },
          {
            id: "open-heartbeat",
            title: "Open HEARTBEAT.md",
            description: "Open the OpenClaw heartbeat instructions file.",
            run: () => {
              void openKnownFile("OpenClaw heartbeat document", "HEARTBEAT.md");
            },
          },
          {
            id: "open-memory-index",
            title: "Open MEMORY.md",
            description: "Open the OpenClaw long-term memory index.",
            run: () => {
              void openKnownFile("OpenClaw memory index", "MEMORY.md");
            },
          },
          {
            id: "open-latest-daily-memory",
            title: "Open latest daily memory",
            description: "Open the newest memory/YYYY-MM-DD.md file.",
            run: () => {
              void openLatestMemory();
            },
          },
          {
            id: "stage-current-note",
            title: "Stage current note for OpenClaw",
            description: "Write the current note into a Lumina bridge note inside the workspace.",
            run: () => {
              void stageCurrentNote();
            },
          },
          {
            id: "stage-selection",
            title: "Stage selection for OpenClaw",
            description: "Write the current editor selection into a Lumina bridge note inside the workspace.",
            run: () => {
              void stageSelection();
            },
          },
          {
            id: "create-cron-job",
            title: "Create cron job",
            description: "Open the cron job editor to create a new scheduled job.",
            run: () => {
              void openCronEditor(null);
            },
          },
          {
            id: "manage-cron-jobs",
            title: "Manage cron jobs",
            description: "Open the workspace overview and scroll to the cron jobs section.",
            run: () => {
              void openOverview();
            },
          },
        ],
      }),
    );

    disposeUi = () => {
      for (const dispose of disposers.reverse()) {
        dispose();
      }
    };
  };

  // ---------------------------------------------------------------------------
  // Tab registrations
  // ---------------------------------------------------------------------------

  const unregisterOverview = api.workspace.registerTabType({
    type: OVERVIEW_TAB_TYPE,
    title: "OpenClaw Workspace",
    render: (payload) =>
      String(payload.html || "<p>OpenClaw workspace overview is unavailable.</p>"),
    actions: {
      "toggle-cron-job": async (data) => {
        const jobId = data.jobId;
        if (!jobId) return;
        const wasEnabled = data.enabled === "true";
        try {
          await api.workspace.updateOpenClawCronJob(jobId, { enabled: !wasEnabled });
          api.ui.notify(`Cron job ${wasEnabled ? "disabled" : "enabled"}.`);
          await openOverview();
        } catch (err) {
          api.ui.notify(`Failed to toggle cron job: ${err}`);
        }
      },
      "delete-cron-job": async (data) => {
        const jobId = data.jobId;
        if (!jobId) return;
        try {
          await api.workspace.deleteOpenClawCronJob(jobId);
          api.ui.notify("Cron job deleted.");
          await openOverview();
        } catch (err) {
          api.ui.notify(`Failed to delete cron job: ${err}`);
        }
      },
      "edit-cron-job": async (data) => {
        const jobId = data.jobId;
        if (!jobId) return;
        await openCronEditor(jobId);
      },
      "create-cron-job": async () => {
        await openCronEditor(null);
      },
    },
  });

  const unregisterCronEditor = api.workspace.registerTabType({
    type: CRON_EDITOR_TAB_TYPE,
    title: "Cron Job Editor",
    render: (payload) =>
      String(payload.html || renderCronForm(null)),
    actions: {
      "save-cron-job": async (data) => {
        const jobInput = buildCronJobFromFormData(data);
        try {
          if (data.jobId) {
            await api.workspace.updateOpenClawCronJob(data.jobId, jobInput);
            api.ui.notify("Cron job updated.");
          } else {
            await api.workspace.createOpenClawCronJob(jobInput);
            api.ui.notify("Cron job created.");
          }
          await openOverview();
        } catch (err) {
          api.ui.notify(`Failed to save cron job: ${err}`);
        }
      },
    },
  });

  const offWorkspaceChanged = api.events.on("workspace:changed", () => {
    cachedSnapshot = null;
    void rebuildUi();
  });

  void rebuildUi();

  return () => {
    offWorkspaceChanged();
    cleanupUi();
    unregisterOverview();
    unregisterCronEditor();
  };
};
