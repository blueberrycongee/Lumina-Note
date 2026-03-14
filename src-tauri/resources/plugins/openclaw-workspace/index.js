module.exports = function setup(api) {
  const OVERVIEW_TAB_TYPE = "openclaw-workspace-overview";
  const CRON_EDITOR_TAB_TYPE = "openclaw-cron-editor";
  const KEY_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "HEARTBEAT.md", "MEMORY.md"];
  const ARTIFACT_PREFIXES = ["output/", "artifacts/", "tmp/docs/"];
  const PLAN_PREFIXES = ["plans/", "docs/plans/", ".openclaw/plans/", "output/plans/"];

  let cachedSnapshot = null;
  let disposeUi = () => {};

  const getCurrentLocale = () => {
    try {
      const saved = localStorage.getItem('lumina-locale');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.state?.locale) {
          return parsed.state.locale;
        }
      }
    } catch (err) {
      console.error('[OpenClaw] Failed to read locale from localStorage:', err);
    }
    return 'en';
  };

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
  // i18n helpers
  // ---------------------------------------------------------------------------

  const t = (key, params = {}) => {
    const currentLocale = getCurrentLocale();
    const translations = {
      en: {
        openClawCronOverview: 'Cron Jobs Overview',
        openClawCronTotal: 'Total',
        openClawCronName: 'Name',
        openClawCronSchedule: 'Schedule',
        openClawCronStatus: 'Status',
        openClawCronTarget: 'Target',
        openClawCronActions: 'Actions',
        openClawCronEnable: 'Enable',
        openClawCronDisable: 'Disable',
        openClawCronEdit: 'Edit',
        openClawCronDelete: 'Delete',
        openClawCronEditorTitle: 'Cron Job Editor',
        openClawCronCreateTitle: 'Create Cron Job',
        openClawCronEditTitle: 'Edit Cron Job: {name}',
        openClawCronJobName: 'Job Name',
        openClawCronJobDescription: 'Description',
        openClawCronScheduleKind: 'Schedule Type',
        openClawCronScheduleExpr: 'Cron expression',
        openClawCronScheduleEvery: 'Every interval',
        openClawCronScheduleAt: 'At specific time',
        openClawCronScheduleExprPlaceholder: 'e.g., 0 7 * * * (daily at 7 AM)',
        openClawCronScheduleEveryPlaceholder: 'e.g., 3600000 (1 hour)',
        openClawCronScheduleAtPlaceholder: 'e.g., 2026-02-01T16:00:00Z',
        openClawCronTimezone: 'Timezone (optional)',
        openClawCronTimezonePlaceholder: 'e.g., America/Los_Angeles',
        openClawCronPayloadKind: 'Payload Type',
        openClawCronPayloadAgentTurn: 'Agent Turn',
        openClawCronPayloadSystemEvent: 'System Event',
        openClawCronPayloadMessage: 'Message / Text',
        openClawCronPayloadMessagePlaceholder: 'Enter the message or event text',
        openClawCronSessionTarget: 'Session Target',
        openClawCronSessionTargetMain: 'Main',
        openClawCronSessionTargetIsolated: 'Isolated',
        openClawCronEnabled: 'Enabled',
        openClawCronDeleteAfterRun: 'Delete after run',
        openClawCronSave: 'Save Changes',
        openClawCronCreate: 'Create Job',
        openClawCronSaveSuccess: 'Cron job saved successfully',
        openClawCronSaveError: 'Failed to save cron job: {error}',
        openClawCronToggleSuccess: 'Cron job {status}',
        openClawCronToggleError: 'Failed to toggle cron job: {error}',
        openClawCronDeleteSuccess: 'Cron job deleted',
        openClawCronDeleteError: 'Failed to delete cron job: {error}',
        openClawCronNoJobs: 'No cron jobs configured',
        openClawCronCreateFirst: '+ Create cron job',
      },
      'zh-CN': {
        openClawCronOverview: 'Cron 任务概览',
        openClawCronTotal: '总计',
        openClawCronName: '名称',
        openClawCronSchedule: '计划',
        openClawCronStatus: '状态',
        openClawCronTarget: '目标',
        openClawCronActions: '操作',
        openClawCronEnable: '启用',
        openClawCronDisable: '禁用',
        openClawCronEdit: '编辑',
        openClawCronDelete: '删除',
        openClawCronEditorTitle: 'Cron 任务编辑器',
        openClawCronCreateTitle: '新建 Cron 任务',
        openClawCronEditTitle: '编辑 Cron 任务：{name}',
        openClawCronJobName: '任务名称',
        openClawCronJobDescription: '描述',
        openClawCronScheduleKind: '计划类型',
        openClawCronScheduleExpr: 'Cron 表达式',
        openClawCronScheduleEvery: '每隔',
        openClawCronScheduleAt: '在指定时间',
        openClawCronScheduleExprPlaceholder: '例如：0 7 * * *（每天 7 点）',
        openClawCronScheduleEveryPlaceholder: '例如：3600000（1 小时）',
        openClawCronScheduleAtPlaceholder: '例如：2026-02-01T16:00:00Z',
        openClawCronTimezone: '时区（可选）',
        openClawCronTimezonePlaceholder: '例如：America/Los_Angeles',
        openClawCronPayloadKind: '负载类型',
        openClawCronPayloadAgentTurn: 'Agent 对话',
        openClawCronPayloadSystemEvent: '系统事件',
        openClawCronPayloadMessage: '消息/文本',
        openClawCronPayloadMessagePlaceholder: '输入消息或事件文本',
        openClawCronSessionTarget: '会话目标',
        openClawCronSessionTargetMain: '主会话',
        openClawCronSessionTargetIsolated: '隔离会话',
        openClawCronEnabled: '已启用',
        openClawCronDeleteAfterRun: '运行后删除',
        openClawCronSave: '保存更改',
        openClawCronCreate: '创建任务',
        openClawCronSaveSuccess: 'Cron 任务已保存',
        openClawCronSaveError: '保存 Cron 任务失败：{error}',
        openClawCronToggleSuccess: 'Cron 任务已{status}',
        openClawCronToggleError: '切换 Cron 任务失败：{error}',
        openClawCronDeleteSuccess: 'Cron 任务已删除',
        openClawCronDeleteError: '删除 Cron 任务失败：{error}',
        openClawCronNoJobs: '暂无 cron 任务',
        openClawCronCreateFirst: '+ 新建 cron 任务',
      },
      'zh-TW': {
        openClawCronOverview: 'Cron 任務概覽',
        openClawCronTotal: '總計',
        openClawCronName: '名稱',
        openClawCronSchedule: '計劃',
        openClawCronStatus: '狀態',
        openClawCronTarget: '目標',
        openClawCronActions: '操作',
        openClawCronEnable: '啟用',
        openClawCronDisable: '停用',
        openClawCronEdit: '編輯',
        openClawCronDelete: '刪除',
        openClawCronEditorTitle: 'Cron 任務編輯器',
        openClawCronCreateTitle: '新建 Cron 任務',
        openClawCronEditTitle: '編輯 Cron 任務：{name}',
        openClawCronJobName: '任務名稱',
        openClawCronJobDescription: '描述',
        openClawCronScheduleKind: '計劃類型',
        openClawCronScheduleExpr: 'Cron 表達式',
        openClawCronScheduleEvery: '每隔',
        openClawCronScheduleAt: '在指定時間',
        openClawCronScheduleExprPlaceholder: '例如：0 7 * * *（每天 7 點）',
        openClawCronScheduleEveryPlaceholder: '例如：3600000（1 小時）',
        openClawCronScheduleAtPlaceholder: '例如：2026-02-01T16:00:00Z',
        openClawCronTimezone: '時區（可選）',
        openClawCronTimezonePlaceholder: '例如：America/Los_Angeles',
        openClawCronPayloadKind: '負載類型',
        openClawCronPayloadAgentTurn: 'Agent 對話',
        openClawCronPayloadSystemEvent: '系統事件',
        openClawCronPayloadMessage: '訊息/文字',
        openClawCronPayloadMessagePlaceholder: '輸入訊息或事件文字',
        openClawCronSessionTarget: '會話目標',
        openClawCronSessionTargetMain: '主會話',
        openClawCronSessionTargetIsolated: '隔離會話',
        openClawCronEnabled: '已啟用',
        openClawCronDeleteAfterRun: '執行後刪除',
        openClawCronSave: '儲存變更',
        openClawCronCreate: '建立任務',
        openClawCronSaveSuccess: 'Cron 任務已儲存',
        openClawCronSaveError: '儲存 Cron 任務失敗：{error}',
        openClawCronToggleSuccess: 'Cron 任務已{status}',
        openClawCronToggleError: '切換 Cron 任務失敗：{error}',
        openClawCronDeleteSuccess: 'Cron 任務已刪除',
        openClawCronDeleteError: '刪除 Cron 任務失敗：{error}',
        openClawCronNoJobs: '尚無 cron 任務',
        openClawCronCreateFirst: '+ 新建 cron 任務',
      },
      ja: {
        openClawCronOverview: 'Cron ジョブ概要',
        openClawCronTotal: '合計',
        openClawCronName: '名前',
        openClawCronSchedule: 'スケジュール',
        openClawCronStatus: 'ステータス',
        openClawCronTarget: 'ターゲット',
        openClawCronActions: 'アクション',
        openClawCronEnable: '有効',
        openClawCronDisable: '無効',
        openClawCronEdit: '編集',
        openClawCronDelete: '削除',
        openClawCronEditorTitle: 'Cron ジョブエディタ',
        openClawCronCreateTitle: 'Cron ジョブを作成',
        openClawCronEditTitle: 'Cron ジョブを編集：{name}',
        openClawCronJobName: 'ジョブ名',
        openClawCronJobDescription: '説明',
        openClawCronScheduleKind: 'スケジュールタイプ',
        openClawCronScheduleExpr: 'Cron 式',
        openClawCronScheduleEvery: '毎',
        openClawCronScheduleAt: '指定時刻',
        openClawCronScheduleExprPlaceholder: '例：0 7 * * *（毎日午前 7 時）',
        openClawCronScheduleEveryPlaceholder: '例：3600000（1 時間）',
        openClawCronScheduleAtPlaceholder: '例：2026-02-01T16:00:00Z',
        openClawCronTimezone: 'タイムゾーン（オプション）',
        openClawCronTimezonePlaceholder: '例：America/Los_Angeles',
        openClawCronPayloadKind: 'ペイロードタイプ',
        openClawCronPayloadAgentTurn: 'エージェントターン',
        openClawCronPayloadSystemEvent: 'システムイベント',
        openClawCronPayloadMessage: 'メッセージ/テキスト',
        openClawCronPayloadMessagePlaceholder: 'メッセージまたはイベントテキストを入力',
        openClawCronSessionTarget: 'セッションターゲット',
        openClawCronSessionTargetMain: 'メイン',
        openClawCronSessionTargetIsolated: '隔離',
        openClawCronEnabled: '有効',
        openClawCronDeleteAfterRun: '実行後に削除',
        openClawCronSave: '変更を保存',
        openClawCronCreate: 'ジョブを作成',
        openClawCronSaveSuccess: 'Cron ジョブが保存されました',
        openClawCronSaveError: 'Cron ジョブの保存に失敗：{error}',
        openClawCronToggleSuccess: 'Cron ジョブが{status}されました',
        openClawCronToggleError: 'Cron ジョブの切り替えに失敗：{error}',
        openClawCronDeleteSuccess: 'Cron ジョブが削除されました',
        openClawCronDeleteError: 'Cron ジョブの削除に失敗：{error}',
        openClawCronNoJobs: 'cron ジョブはまだありません',
        openClawCronCreateFirst: '+ Cron ジョブを作成',
      },
    };

    const locale = translations[currentLocale] || translations.en;
    let text = locale[key] || translations.en[key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    
    return text;
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
    const styles = {
      container: 'style="padding:20px;background:var(--background-secondary,#f5f5f5);border-radius:8px;"',
      header: 'style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;"',
      title: 'style="font-size:18px;font-weight:600;color:var(--text-primary,#333);margin:0;"',
      createBtn: 'style="padding:8px 16px;background:var(--primary,#007bff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:opacity 0.2s;" onmouseover="this.style.opacity=\'0.85\'" onmouseout="this.style.opacity=\'1\'"',
      table: 'style="width:100%;border-collapse:collapse;background:var(--background,#fff);border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"',
      th: 'style="padding:12px 16px;text-align:left;font-size:13px;font-weight:600;color:var(--text-secondary,#666);background:var(--background-tertiary,#f9f9f9);border-bottom:2px solid var(--border,#e0e0e0);"',
      td: 'style="padding:12px 16px;font-size:14px;color:var(--text-primary,#333);border-bottom:1px solid var(--border,#e8e8e8);"',
      code: 'style="font-family:\'JetBrains Mono\',\'Fira Code\',monospace;font-size:13px;background:var(--background-tertiary,#f5f5f5);padding:2px 6px;border-radius:4px;"',
      status: 'style="display:inline-block;padding:4px 8px;border-radius:12px;font-size:12px;font-weight:500;"',
      statusEnabled: 'style="display:inline-block;padding:4px 8px;border-radius:12px;font-size:12px;font-weight:500;background:#dcfce7;color:#16a34a;"',
      statusDisabled: 'style="display:inline-block;padding:4px 8px;border-radius:12px;font-size:12px;font-weight:500;background:#fee2e2;color:#dc2626;"',
      actionBtn: 'style="padding:6px 12px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.2s;margin-right:6px;"',
      editBtn: 'style="padding:6px 12px;background:#dbeafe;color:#2563eb;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.2s;margin-right:6px;" onmouseover="this.style.background=\'#bfdbfe\'" onmouseout="this.style.background=\'#dbeafe\'"',
      deleteBtn: 'style="padding:6px 12px;background:#fee2e2;color:#dc2626;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.2s;" onmouseover="this.style.background=\'#fecaca\'" onmouseout="this.style.background=\'#fee2e2\'"',
      empty: 'style="text-align:center;padding:40px 20px;color:var(--text-secondary,#999);font-size:14px;"',
    };

    if (!jobs || jobs.length === 0) {
      return [
        `<div ${styles.container}>`,
        `<div ${styles.header}>`,
        `<h3 ${styles.title}>${t('openClawCronOverview')}</h3>`,
        `<button ${styles.createBtn} data-plugin-action="create-cron-job">${t('openClawCronCreateFirst')}</button>`,
        "</div>",
        `<div ${styles.empty}>${t('openClawCronNoJobs')}</div>`,
        "</div>",
      ].join("");
    }

    const rows = jobs
      .map((job) => {
        const statusHtml = job.enabled 
          ? `<span ${styles.statusEnabled}>● ${t('openClawCronEnabled')}</span>`
          : `<span ${styles.statusDisabled}>○ ${t('openClawCronJobDisabled')}</span>`;
        return [
          "<tr>",
          `<td ${styles.td}><code ${styles.code}>${escapeHtml(job.name)}</code></td>`,
          `<td ${styles.td}>${escapeHtml(humanizeSchedule(job.schedule))}</td>`,
          `<td ${styles.td}>${statusHtml}</td>`,
          `<td ${styles.td}>${escapeHtml(job.sessionTarget || t('openClawCronSessionTargetMain'))}</td>`,
          "<td>",
          `<button ${styles.actionBtn} style="${styles.actionBtn}background:var(--background-tertiary,#f0f0f0);color:var(--text-primary,#333);" onmouseover="this.style.background='#e0e0e0'" onmouseout="this.style.background='var(--background-tertiary,#f0f0f0)'" data-plugin-action="toggle-cron-job" data-job-id="${escapeHtml(job.jobId)}" data-enabled="${job.enabled}">${job.enabled ? t('openClawCronDisable') : t('openClawCronEnable')}</button>`,
          `<button ${styles.editBtn} data-plugin-action="edit-cron-job" data-job-id="${escapeHtml(job.jobId)}">${t('openClawCronEdit')}</button>`,
          `<button ${styles.deleteBtn} data-plugin-action="delete-cron-job" data-job-id="${escapeHtml(job.jobId)}">${t('openClawCronDelete')}</button>`,
          "</td>",
          "</tr>",
        ].join("");
      })
      .join("");

    return [
      `<div ${styles.container}>`,
      `<div ${styles.header}>`,
      `<h3 ${styles.title}>${t('openClawCronOverview')}</h3>`,
      `<button ${styles.createBtn} data-plugin-action="create-cron-job">${t('openClawCronCreateFirst')}</button>`,
      "</div>",
      `<p style="margin:0 0 16px 0;font-size:14px;color:var(--text-secondary,#666);">${t('openClawCronTotal')}: ${jobs.length}</p>`,
      `<table ${styles.table}>`,
      `<thead><tr>`,
      `<th ${styles.th}>${t('openClawCronName')}</th>`,
      `<th ${styles.th}>${t('openClawCronSchedule')}</th>`,
      `<th ${styles.th}>${t('openClawCronStatus')}</th>`,
      `<th ${styles.th}>${t('openClawCronTarget')}</th>`,
      `<th ${styles.th}>${t('openClawCronActions')}</th>`,
      "</tr></thead>",
      `<tbody>${rows}</tbody>`,
      "</table>",
      "</div>",
    ].join("");
  };

  const renderCronForm = (job) => {
    const isEdit = Boolean(job && job.jobId);
    const title = isEdit ? t('openClawCronEditTitle', { name: job.name }) : t('openClawCronCreateTitle');
    const scheduleKind = (job && job.schedule && job.schedule.kind) || "cron";
    const payloadKind = (job && job.payload && job.payload.kind) || "agentTurn";

    const styles = {
      container: 'style="padding:24px;background:var(--background-secondary,#f5f5f5);border-radius:8px;"',
      form: 'style="background:var(--background,#fff);padding:24px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);"',
      formGroup: 'style="margin-bottom:20px;"',
      label: 'style="display:block;font-size:14px;font-weight:600;color:var(--text-primary,#333);margin-bottom:8px;"',
      input: 'style="width:100%;padding:10px 12px;border:1px solid var(--border,#d0d0d0);border-radius:6px;font-size:14px;color:var(--text-primary,#333);background:var(--background,#fff);transition:border-color 0.2s;" onfocus="this.style.borderColor=\'var(--primary,#007bff)\'" onblur="this.style.borderColor=\'var(--border,#d0d0d0)\'"',
      select: 'style="width:100%;padding:10px 12px;border:1px solid var(--border,#d0d0d0);border-radius:6px;font-size:14px;color:var(--text-primary,#333);background:var(--background,#fff);transition:border-color 0.2s;" onfocus="this.style.borderColor=\'var(--primary,#007bff)\'" onblur="this.style.borderColor=\'var(--border,#d0d0d0)\'"',
      textarea: 'style="width:100%;padding:10px 12px;border:1px solid var(--border,#d0d0d0);border-radius:6px;font-size:14px;color:var(--text-primary,#333);background:var(--background,#fff);min-height:80px;resize:vertical;transition:border-color 0.2s;" onfocus="this.style.borderColor=\'var(--primary,#007bff)\'" onblur="this.style.borderColor=\'var(--border,#d0d0d0)\'"',
      checkbox: 'style="margin-right:8px;"',
      checkboxLabel: 'style="display:flex;align-items:center;font-size:14px;color:var(--text-primary,#333);cursor:pointer;"',
      button: 'style="padding:10px 20px;background:var(--primary,#007bff);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:500;transition:opacity 0.2s;" onmouseover="this.style.opacity=\'0.85\'" onmouseout="this.style.opacity=\'1\'"',
      title: 'style="font-size:20px;font-weight:600;color:var(--text-primary,#333);margin:0 0 24px 0;"',
    };

    return [
      `<div ${styles.container}>`,
      `<div ${styles.form}>`,
      `<h3 ${styles.title}>${title}</h3>`,
      isEdit ? `<input type="hidden" name="jobId" value="${escapeHtml(job.jobId)}" />` : "",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronJobName')}</label>`,
      `<input name="name" type="text" value="${escapeHtml((job && job.name) || "")}" ${styles.input} />`,
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronJobDescription')}</label>`,
      `<input name="description" type="text" value="${escapeHtml((job && job.description) || "")}" ${styles.input} />`,
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronScheduleKind')}</label>`,
      `<select name="scheduleKind" ${styles.select}>`,
      `<option value="cron"${scheduleKind === "cron" ? " selected" : ""}>${t('openClawCronScheduleExpr')}</option>`,
      `<option value="every"${scheduleKind === "every" ? " selected" : ""}>${t('openClawCronScheduleEvery')}</option>`,
      `<option value="at"${scheduleKind === "at" ? " selected" : ""}>${t('openClawCronScheduleAt')}</option>`,
      "</select>",
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${scheduleKind === "cron" ? t('openClawCronScheduleExpr') : scheduleKind === "every" ? t('openClawCronScheduleEvery') : t('openClawCronScheduleAt')}</label>`,
      `<input name="scheduleExpr" type="text" value="${escapeHtml(
        (job && job.schedule && (job.schedule.expr || (job.schedule.everyMs != null ? String(job.schedule.everyMs) : "") || job.schedule.at)) || ""
      )}" ${styles.input} placeholder="${scheduleKind === "cron" ? t('openClawCronScheduleExprPlaceholder') : scheduleKind === "every" ? t('openClawCronScheduleEveryPlaceholder') : t('openClawCronScheduleAtPlaceholder')}" />`,
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronTimezone')}</label>`,
      `<input name="scheduleTz" type="text" value="${escapeHtml((job && job.schedule && job.schedule.tz) || "")}" ${styles.input} placeholder="${t('openClawCronTimezonePlaceholder')}" />`,
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronPayloadKind')}</label>`,
      `<select name="payloadKind" ${styles.select}>`,
      `<option value="agentTurn"${payloadKind === "agentTurn" ? " selected" : ""}>${t('openClawCronPayloadAgentTurn')}</option>`,
      `<option value="systemEvent"${payloadKind === "systemEvent" ? " selected" : ""}>${t('openClawCronPayloadSystemEvent')}</option>`,
      "</select>",
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronPayloadMessage')}</label>`,
      `<textarea name="payloadText" ${styles.textarea} placeholder="${t('openClawCronPayloadMessagePlaceholder')}">${escapeHtml(
        (job && job.payload && (job.payload.message || job.payload.text)) || ""
      )}</textarea>`,
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.label}>${t('openClawCronSessionTarget')}</label>`,
      `<select name="sessionTarget" ${styles.select}>`,
      `<option value="main"${(!job || !job.sessionTarget || job.sessionTarget === "main") ? " selected" : ""}>${t('openClawCronSessionTargetMain')}</option>`,
      `<option value="isolated"${(job && job.sessionTarget === "isolated") ? " selected" : ""}>${t('openClawCronSessionTargetIsolated')}</option>`,
      "</select>",
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.checkboxLabel}>`,
      `<input name="enabled" type="checkbox" ${styles.checkbox}${(!job || job.enabled !== false) ? " checked" : ""} />`,
      t('openClawCronEnabled'),
      "</label>",
      "</div>",
      `<div ${styles.formGroup}>`,
      `<label ${styles.checkboxLabel}>`,
      `<input name="deleteAfterRun" type="checkbox" ${styles.checkbox}${(job && job.deleteAfterRun) ? " checked" : ""} />`,
      t('openClawCronDeleteAfterRun'),
      "</label>",
      "</div>",
      `<div>`,
      `<button ${styles.button} data-plugin-action="save-cron-job">${isEdit ? t('openClawCronSave') : t('openClawCronCreate')}</button>`,
      "</div>",
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[OpenClaw Cron] Failed to load cron jobs:', err);
      api.ui.notify(t('openClawCronLoadError', { error: errorMessage }));
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
        if (!jobId) {
          api.ui.notify(t('openClawCronSaveError', { error: 'Job ID is required' }));
          return;
        }
        const wasEnabled = data.enabled === "true";
        try {
          await api.workspace.updateOpenClawCronJob(jobId, { enabled: !wasEnabled });
          const status = wasEnabled ? t('openClawCronDisable').toLowerCase() : t('openClawCronEnable').toLowerCase();
          api.ui.notify(t('openClawCronToggleSuccess', { status }));
          await openOverview();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          api.ui.notify(t('openClawCronToggleError', { error: errorMessage }));
          console.error('[OpenClaw Cron] Failed to toggle cron job:', err);
        }
      },
      "delete-cron-job": async (data) => {
        const jobId = data.jobId;
        if (!jobId) {
          api.ui.notify(t('openClawCronDeleteError', { error: 'Job ID is required' }));
          return;
        }
        try {
          await api.workspace.deleteOpenClawCronJob(jobId);
          api.ui.notify(t('openClawCronDeleteSuccess'));
          await openOverview();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          api.ui.notify(t('openClawCronDeleteError', { error: errorMessage }));
          console.error('[OpenClaw Cron] Failed to delete cron job:', err);
        }
      },
      "edit-cron-job": async (data) => {
        const jobId = data.jobId;
        if (!jobId) {
          api.ui.notify('Job ID is required');
          return;
        }
        await openCronEditor(jobId);
      },
      "create-cron-job": async () => {
        await openCronEditor(null);
      },
    },
  });

  const unregisterCronEditor = api.workspace.registerTabType({
    type: CRON_EDITOR_TAB_TYPE,
    title: t('openClawCronEditorTitle'),
    render: (payload) =>
      String(payload.html || renderCronForm(null)),
    actions: {
      "save-cron-job": async (data) => {
        try {
          const jobInput = buildCronJobFromFormData(data);
          
          if (!jobInput.name || jobInput.name.trim() === '') {
            api.ui.notify(t('openClawCronSaveError', { error: 'Job name is required' }));
            return;
          }
          
          if (data.jobId) {
            await api.workspace.updateOpenClawCronJob(data.jobId, jobInput);
            api.ui.notify(t('openClawCronSaveSuccess'));
          } else {
            await api.workspace.createOpenClawCronJob(jobInput);
            api.ui.notify(t('openClawCronSaveSuccess'));
          }
          await openOverview();
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          api.ui.notify(t('openClawCronSaveError', { error: errorMessage }));
          console.error('[OpenClaw Cron] Failed to save cron job:', err);
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
