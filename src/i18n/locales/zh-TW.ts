// 繁體中文
export default {
  // 歡迎界面
  welcome: {
    title: 'Lumina Note',
    subtitle: '本地優先的 AI 驅動筆記應用',
    openFolder: '開啟筆記資料夾',
    selectFolder: '選擇一個包含 Markdown 筆記的資料夾',
    language: '語言',
  },
  
  // 通用
  common: {
    save: '儲存',
    cancel: '取消',
    confirm: '確認',
    delete: '刪除',
    edit: '編輯',
    create: '建立',
    search: '搜尋',
    settings: '設定',
    close: '關閉',
    open: '開啟',
    loading: '載入中...',
    saved: '已儲存',
    unsaved: '未儲存',
    error: '錯誤',
    success: '成功',
    untitled: '未命名',
    newConversation: '新對話',
    unsavedChanges: '未儲存更改',
    aiChatTab: 'AI 聊天',
    collapse: '收起',
    expand: '展開',
    localGraph: '局部圖譜',
  },
  
  // 側邊欄
  sidebar: {
    files: '檔案',
    search: '搜尋',
    graph: '圖譜',
    newNote: '新增筆記',
    newFolder: '新增資料夾',
    refresh: '重新整理',
    toggleSidebar: '切換側邊欄',
    toggleAIPanel: '切換 AI 面板',
  },

  favorites: {
    title: '收藏夾',
    add: '加入收藏',
    remove: '取消收藏',
    empty: '暫無收藏',
    sortManual: '手動',
    sortRecentAdded: '最近收藏',
    sortRecentOpened: '最近打開',
    moveUp: '上移',
    moveDown: '下移',
  },
  
  // 編輯器
  editor: {
    reading: '閱讀',
    readingMode: '閱讀模式',
    live: '即時',
    livePreview: '即時預覽',
    source: '原始碼',
    sourceMode: '原始碼模式',
    saving: '儲存中...',
    edited: '已編輯',
    exportPdf: '匯出 PDF',
    splitView: '分割視窗',
    goBack: '返回',
    goForward: '前進',
    goBackShortcut: '返回 (Alt+←)',
    goForwardShortcut: '前進 (Alt+→)',
    videoNoteDetected: '偵測到這是一個視訊筆記 Markdown，可以在專用的視訊筆記視圖中查看和編輯。',
    openAsVideoNote: '以視訊筆記方式開啟',
    imageLoadFailed: '圖片載入失敗',
    noteNotFound: '筆記不存在',
    mermaidRenderFailed: '渲染失敗',
  },
  
  // AI 助手
  ai: {
    chat: 'AI 助手',
    thinking: '思考中...',
    askAnything: '問任何問題...',
    settings: 'AI 設定',
    agentMode: 'Agent 模式 - 智慧任務執行',
    chatMode: '對話模式 - 簡單問答',
    conversation: '對話',
    inputPlaceholder: '輸入訊息... (@ 引用檔案)',
    agentPlaceholder: '輸入任務指令... (@ 引用檔案)',
    searchFiles: '搜尋檔案...',
    noFilesFound: '未找到匹配的檔案',
    totalFiles: '共 {count} 個檔案',
    attachFile: '附加檔案 (或輸入 @ 引用)',
    addFile: '@ 新增檔案',
    stopGenerate: '停止生成',
    stopVoice: '停止語音輸入',
    startVoice: '開始語音輸入',
    send: '傳送',
    stop: '停止',
    regenerate: '重新生成',
    errorRetry: '發生錯誤，請重試',
    welcomeAgent: '我是 Lumina Agent，告訴我你想完成的任務。',
    startTask: '輸入任務指令開始',
    needApproval: '需要審批',
    tool: '工具',
    approve: '批准',
    reject: '拒絕',
    quoteFrom: '引用自',
    welcomeTitle: '你好，我是 Lumina',
    welcomeSubtitle: '我可以幫你管理筆記、整理想法、搜尋知識...',
    polishText: '潤色文字',
    polishTextDesc: 'Chat: 優化表達',
    summarizeNote: '總結筆記',
    summarizeNoteDesc: 'Chat: 提煉要點',
    writeArticle: '寫篇文章',
    writeArticleDesc: 'Agent: 建立新筆記',
    studyNotes: '學習筆記',
    studyNotesDesc: 'Agent: 整理知識點',
    history: '歷史記錄',
    historyChats: '歷史對話',
    sessionTokens: '本會話 Token',
    newChat: '新建對話',
    noHistory: '暫無歷史記錄',
    agentChats: 'Agent 對話',
    chatChats: 'Chat 對話',
    addWorkspaceFile: '新增工作區檔案',
    searchFile: '搜尋檔案...',
    fileNotFound: '未找到檔案',
    filesCount: '共 {count} 個檔案',
    chatModeHint: '簡單的對話模式，無法操作檔案',
    agentModeHint: '智慧助手模式，可以讀寫檔案和執行任務',
    notConfigured: '未配置',
    aiChatSettings: 'AI 對話設定',
    getRealtimeContent: '從庫中獲取即時內容',
    aiGeneratedWarning: 'AI 生成的內容可能存在錯誤，請注意核實',
    agentInputPlaceholder: '我是Lumina，這個模式下我擁有許多強力裝備，可以幫你處理各種事務！',
    chatInputPlaceholder: '我是Lumina，你有什麼想和我聊聊的？我知無不言',
    debugPanel: '除錯面板',
    agentDebugPanel: 'Agent 除錯面板',
    mode: '模式',
    status: '狀態',
    fullMsgsCount: '完整訊息數',
    displayMsgsCount: '顯示訊息數',
    intentResult: '意圖識別結果',
    notTriggered: '未觸發',
    noIntentData: '暫無意圖數據',
    noMsgs: '暫無訊息，傳送一條訊息開始除錯',
    attachImage: '新增圖片',
    modelNoVision: '目前模型不支援圖片',
    imageAttached: '已新增 {count} 張圖片',
  },
  
  // 設定
  settings: {
    title: '設定',
    theme: '主題',
    language: '語言',
    editor: '編輯器',
    ai: 'AI 配置',
  },
  
  // 搜尋
  search: {
    placeholder: '搜尋筆記...',
    noResults: '沒有找到結果',
    results: '個結果',
  },
  
  // 圖譜
  graph: {
    title: '知識圖譜',
    nodes: '節點',
    edges: '連接',
    current: '目前筆記',
    linked: '連結筆記',
    tags: '標籤',
    outline: '大綱',
    backlinks: '連結',
  },
  
  // PDF
  pdf: {
    export: '匯出 PDF',
    exportSuccess: 'PDF 匯出成功！',
    exportFailed: 'PDF 匯出失敗',
  },
  
  // 檔案管理
  file: {
    quickNote: '今日速記',
    voiceNote: '語音筆記',
    emptyFolder: '資料夾為空',
    fileName: '檔案名',
    folderName: '資料夾名',
    openFolder: '開啟資料夾...',
    newWindow: '新視窗',
    selectWorkingDir: '選擇工作目錄',
    createQuickNoteFailed: '建立速記失敗',
    renameFailed: '重新命名失敗',
    createFailed: '建立失敗',
    fileExists: '檔案已存在',
    folderExists: '資料夾已存在',
    openFailed: '開啟失敗，路徑已複製',
    voiceRecordHint: '開始語音錄製，結束後自動儲存並產生摘要',
  },
  
  // 索引/RAG
  rag: {
    indexing: '索引中...',
    indexed: '索引',
    files: '檔案',
    notInitialized: '未初始化',
    cancel: '取消',
    rebuild: '重建',
    notEnabled: '未啟用',
    cancelIndex: '取消索引',
    rebuildIndex: '重新索引',
    chunks: '個片段',
    notBuilt: '尚未建立索引',
  },
  
  // 反向連結和大綱
  panel: {
    openNoteToShowBacklinks: '開啟筆記後顯示反向連結',
    buildingIndex: '正在建立索引...',
    noBacklinks: '暫無反向連結',
    backlinkHint: '其他筆記中使用 [[{name}]] 連結到此筆記',
    backlinks: '個反向連結',
    noTags: '暫無標籤',
    tagHint: '使用 #標籤名 建立標籤',
    tags: '個標籤',
    openNoteToShowOutline: '開啟筆記後顯示大綱',
    noHeadings: '此筆記沒有標題',
    headingHint: '使用 # 建立標題',
    headings: '個標題',
    toggleLevel: '切換 H',
    clearChat: '清空對話',
    back: '← 返回',
  },
  
  // 設定面板
  settingsPanel: {
    title: '設定',
    aiChatSettings: 'AI 對話設定',
    provider: '服務商',
    apiKey: 'API Key',
    apiKeyOptional: '可選',
    localModelNoKey: '本地模型無需 API Key',
    model: '模型',
    customModelId: '自訂模型 ID',
    customModelHint: '輸入完整的模型 ID（包含命名空間，如有）',
    baseUrl: 'Base URL',
    baseUrlHint: '可選，用於第三方代理',
    temperature: '溫度 (Temperature)',
    temperatureHint: '較高的值會使輸出更隨機，較低的值會更集中和確定。',
    agentSettings: 'Agent 設定',
    autoApproveTools: '自動批准工具調用',
    noManualConfirm: '無需手動確認',
    semanticSearch: '語義搜尋 (RAG)',
    enable: '啟用',
    embeddingService: 'Embedding 服務',
    embeddingApiKey: 'Embedding API Key',
    embeddingBaseUrl: 'Embedding Base URL',
    embeddingModel: 'Embedding 模型',
  },
  
  // 設定模態框
  settingsModal: {
    title: '設定',
    theme: '主題',
    createTheme: '建立主題',
    themeDescription: '選擇界面配色方案，每套主題自動適配淺色/深色模式',
    myThemes: '我的主題',
    officialThemes: '官方主題',
    // 主題名稱和描述
    themes: {
      default: { name: '預設', description: '溫暖的米黃色調' },
      ocean: { name: '海洋', description: '清新的藍色調' },
      forest: { name: '森林', description: '自然的綠色調' },
      lavender: { name: '薰衣草', description: '優雅的紫色調' },
      rose: { name: '玫瑰', description: '溫柔的粉色調' },
      amber: { name: '落日', description: '活力的橙黃色調' },
      mint: { name: '薄荷', description: '清涼的青色調' },
      indigo: { name: '靛青', description: '深邃的藍紫色調' },
      coffee: { name: '拿鐵', description: '復古的咖啡色調' },
      nord: { name: '極光', description: '冷淡的灰藍色調' },
      mono: { name: '極簡', description: '純粹的黑白灰' },
      cyberpunk: { name: '賽博龐克', description: '霓虹撞色：紫黑背景 + 螢光粉 + 青色高亮' },
      dracula: { name: '吸血鬼', description: '經典配色：冷灰背景 + 紫色 + 綠色 + 橙色混搭' },
      solarized: { name: '日蝕', description: '護眼高對比：暖米色背景 + 藍/橙/紅/綠 組合' },
      gruvbox: { name: '復古', description: '暖調懷舊：大地色背景 + 紅綠藍黃撞色' },
    },
    editor: '編輯器',
    defaultEditMode: '預設編輯模式',
    defaultEditModeDesc: '開啟檔案時的預設檢視',
    livePreview: '即時預覽',
    sourceMode: '原始碼模式',
    readingMode: '閱讀模式',
    aiAssistant: 'AI 助手',
    currentModel: '目前模型',
    configInRightPanel: '在右側面板中配置更多選項',
    notConfigured: '未配置',
    about: '關於',
    appDescription: '本地優先的 AI 驅動筆記應用',
    confirmDeleteTheme: '確定刪除主題 "{name}" 嗎？',
  },

  // 標題列
  titleBar: {
    minimize: '最小化',
    maximize: '最大化',
    restore: '還原',
    close: '關閉',
  },

  // 命令面板
  commandPalette: {
    newNote: '新增筆記',
    newNoteDesc: '建立新的 Markdown 筆記',
    quickOpen: '快速開啟',
    quickOpenDesc: '搜尋並開啟筆記',
    toggleLeftSidebar: '切換左側邊欄',
    toggleLeftSidebarDesc: '顯示/隱藏檔案樹',
    toggleRightSidebar: '切換右側邊欄',
    toggleRightSidebarDesc: '顯示/隱藏 AI 面板',
    toggleToLight: '切換到淺色模式',
    toggleToDark: '切換到深色模式',
    toggleThemeDesc: '切換應用主題',
    openGraph: '開啟關係圖譜',
    switchToGraph: '切換到關係圖譜',
    graphDesc: '查看筆記之間的鏈接關係',
    switchWorkspace: '切換工作空間',
    current: '目前',
    notSelected: '未選擇',
    globalSearch: '全域搜尋',
    globalSearchDesc: '在所有筆記中搜尋內容',
    commandPlaceholder: '輸入命令...',
    filePlaceholder: '輸入檔案名搜尋...',
    searchPlaceholder: '搜尋筆記內容...',
    commands: '命令',
    files: '檔案',
    noResults: '沒有找到匹配項',
    select: '選擇',
    confirm: '確認',
    switchMode: '切換模式',
    close: '關閉',
  },

  // 標籤列
  tabBar: {
    close: '關閉',
    closeOthers: '關閉其他',
    closeAll: '關閉全部',
    pin: '固定標籤頁',
    unpin: '取消固定',
  },

  // 對話列表
  conversationList: {
    collapseList: '收起列表',
    expandList: '展開列表',
    newConversation: '新增對話',
    deleteConversation: '刪除對話',
    noConversations: '暫無對話',
    clearHistory: '清空歷史',
  },

  // 右鍵選單
  contextMenu: {
    addLink: '新增連結',
    addExternalLink: '新增外部連結',
    textFormat: '文字格式',
    paragraphSettings: '段落設定',
    bold: '粗體',
    italic: '斜體',
    strikethrough: '刪除線',
    highlight: '螢光標記',
    inlineCode: '行內程式碼',
    bulletList: '無序清單',
    numberedList: '有序清單',
    taskList: '任務清單',
    heading1: '1級標題',
    heading2: '2級標題',
    heading3: '3級標題',
    heading4: '4級標題',
    heading5: '5級標題',
    heading6: '6級標題',
    quote: '引用',
    cut: '剪下',
    copy: '複製',
    paste: '貼上',
  },

  // AI 懸浮面板
  aiFloatingPanel: {
    agentMode: 'Agent 模式',
    chatMode: '對話模式',
    notConfigured: '未配置',
    clearChat: '清空對話',
    settings: '設定',
    dockToSidebar: '回歸側欄',
    provider: '服務商',
    model: '模型',
    customModelId: '自訂模型 ID',
    customModelPlaceholder: '例如：deepseek-ai/DeepSeek-V3',
    baseUrl: 'Base URL',
    optional: '可選',
  },

  // 視頻筆記
  videoNote: {
    title: '視頻筆記',
    startVideoNote: '開始視頻筆記',
    pasteVideoLink: '貼上 B站視頻鏈接，邊看邊記筆記',
    startNote: '開始筆記',
    supportedLinks: '支援 bilibili.com 和 b23.tv 鏈接',
    openInBrowser: '在瀏覽器中開啟',
    exportMarkdown: '匯出為 Markdown',
    minimize: '最小化（可通過左側視頻按鈕恢復）',
    loading: '正在載入 B站視頻...',
    loadingHint: '首次載入可能需要幾秒鐘',
    webviewLoaded: 'WebView 已載入',
    pasteVideoUrl: '貼上B站視頻鏈接，如 https://www.bilibili.com/video/BV...',
    invalidUrl: '請輸入有效的B站視頻鏈接',
    loadFailed: '載入視頻失敗',
    exportSuccess: '已匯出到',
    exportFailed: '匯出失敗',
    noteTimeline: '筆記時間線',
    notesCount: '{count} 條筆記',
    syncDanmaku: '同步彈幕',
    syncing: '同步中...',
    prefix: '前綴',
    fillPrefix: '填充',
    addNote: '添加筆記',
    enterNoteContent: '輸入筆記內容...',
    noNotes: '暫無筆記',
    clickAddNote: '點擊「添加筆記」開始記錄',
    confirmDelete: '確定要刪除這條筆記嗎？',
    pauseTimer: '暫停計時',
    startTimer: '開始計時',
    timing: '計時中',
    paused: '已暫停',
    danmakuTip: '彈幕筆記',
    getVideoInfoFailed: '獲取視頻信息失敗',
    noDanmakuFound: '未找到以 "{prefix}" 開頭的彈幕',
    danmakuTotal: '共獲取到 {count} 條彈幕',
    recentDanmaku: '最近5條',
    danmakuHint: '提示：\n1. B站彈幕有幾分鐘延遲\n2. 發送格式',
    syncComplete: '同步完成！新增 {count} 條筆記',
    syncFailed: '同步彈幕失敗',
  },

  // 瀏覽器
  browser: {
    toggleLeftPanel: '切換左側面板',
    toggleRightPanel: '切換右側面板',
    addBookmark: '添加書籤',
    share: '分享',
    loadError: '載入出錯',
    retry: '重試',
    startBrowsing: '開始瀏覽',
    enterUrlOrSearch: '在地址列輸入網址或搜尋關鍵詞',
    loaded: '已載入',
  },

  // 知識圖譜
  knowledgeGraph: {
    settings: '圖譜設定',
    physics: '物理引擎',
    nodeRepulsion: '節點斥力',
    linkLength: '鏈接長度',
    centerPull: '中心拉力',
    visual: '視覺效果',
    nodeSize: '節點大小',
    showLabels: '顯示標籤',
    showFolders: '顯示資料夾節點',
    isolateView: '孤立視圖',
    openNote: '開啟筆記',
    linkedNotes: '相關筆記',
    noLinkedNotes: '暫無相關筆記',
  },

  // PDF 閱讀器
  pdfViewer: {
    readingFile: '讀取檔案...',
    loadFailed: 'PDF 載入失敗',
    interactiveMode: '互動模式',
    interacting: '互動中',
    elementRecognition: '元素識別模式',
    catalog: '目錄',
    collapseCatalog: '收起目錄',
    expandCatalog: '展開目錄',
    text: '文本',
    image: '圖片',
    table: '表格',
    formula: '公式',
    pdfReference: 'PDF 引用',
  },

  // Agent 訊息渲染
  agentMessage: {
    steps: '{count} 個步驟',
    thinking: '思考中...',
    params: '參數',
    result: '結果',
    executing: '執行中...',
    directory: '目錄',
    recursive: '遞迴',
    paths: '路徑',
    file: '檔案',
    timeoutWarning: '目前 LLM 請求響應時間過長（超過 2 分鐘）',
    interruptRetry: '中斷並重試',
    copy: '複製',
  },

  // 選中工具列
  selectionToolbar: {
    addToChat: '添加到對話',
    summary: '總結',
    translate: '翻譯',
    polish: '潤色',
    todos: '待辦',
    videoNote: '視頻筆記',
    summaryTitle: '總結',
    translateTitle: '翻譯',
    todoTitle: '待辦清單',
    selectionSummary: '選區總結',
    selectionTranslate: '選區翻譯',
    selectionPolish: '選區潤色',
    generateTodo: '生成待辦清單',
    translateFailed: '翻譯失敗，請檢查 AI 設定或稍後再試。',
    polishFailed: '潤色失敗，請檢查 AI 設定或稍後再試。',
    summaryFailed: '生成總結失敗，請檢查 AI 設定或稍後再試。',
    todoFailed: '生成待辦清單失敗，請檢查 AI 設定或稍後再試。',
    unknown: '未知',
  },

  // AI 設定彈窗
  aiSettings: {
    title: 'AI 對話設定',
    close: '關閉',
    mainModel: '主模型 (Main Model)',
    provider: '服務商',
    apiKey: 'API Key',
    apiKeyOptional: '可選',
    localModelNoKey: '本地模型無需 API Key',
    model: '模型',
    customModelId: '自訂模型 ID',
    customModelHint: '例如：deepseek-ai/DeepSeek-V3 或 Pro/ERNIE-4.0-Turbo-8K',
    baseUrl: 'Base URL',
    baseUrlOptional: '可選，用於第三方代理',
    temperature: '溫度 (Temperature)',
    dynamicRouting: '動態路由 (Intent Routing)',
    enable: '啟用',
    routingDescription: '配置意圖識別模型和路由規則。',
    intentModel: '意圖識別模型 (Intent Model)',
    intentModelDesc: '用於分析用戶意圖 (Chat/Search/Edit/...)',
    useMainKey: '留空則使用主 Key',
    chatModel: '聊天模型 (Chat Model)',
    chatModelDesc: '用於 Chat 模式和簡單任務 (如閒聊、搜尋)',
    followMainModel: '跟隨主模型 (預設)',
    noChatModelWarning: '未配置專用聊天模型，將使用主模型處理所有任務。建議配置輕量級模型以降低成本並提高速度。',
    routingRules: '路由規則',
    routingRulesDesc: '系統將自動使用「聊天模型」處理以下任務，以節省成本並提高速度：',
    chatTask: '閒聊 (Chat) - 日常對話、靈感啟發',
    searchTask: '搜尋 (Search) - 知識檢索、資訊查詢',
    otherTasksNote: '其他複雜任務（如編輯、整理、寫作）將始終使用「主模型」以保證品質。',
    agentSettings: 'Agent 設定',
    autoApproveTools: '自動批准工具調用',
    noManualConfirm: '無需手動確認',
    semanticSearch: '語義搜尋 (RAG)',
    indexing: '正在索引',
    indexed: '已索引 {count} 個片段',
    notIndexed: '尚未建立索引',
    rebuildIndex: '重新索引',
    cancelIndex: '取消索引',
    embeddingService: 'Embedding 服務',
    embeddingApiKey: 'Embedding API Key',
    embeddingBaseUrl: 'Embedding Base URL',
    embeddingModel: 'Embedding 模型',
    vectorDimensions: '向量維度',
    dimensionsHint: '如 1024（留空使用預設）',
    reranker: '重排序 (Reranker)',
    rerankerBaseUrl: 'Reranker Base URL',
    rerankerApiKey: 'Reranker API Key',
    rerankerModel: 'Reranker 模型',
    topN: '返回數量 (Top N)',
  },

  // 主題編輯器
  themeEditor: {
    title: '主題編輯器',
    switchToDark: '切換到暗色預覽',
    switchToLight: '切換到亮色預覽',
    themeName: '主題名稱',
    description: '描述',
    colorGroups: '顏色分組',
    baseUI: '基礎 UI',
    markdownText: 'Markdown 文本',
    code: '代碼',
    tableAndDivider: '表格與分割',
    diffCompare: 'Diff 對比',
    basedOnTheme: '基於官方主題',
    selectBaseTheme: '選擇基礎主題...',
    import: '導入',
    copyJson: '複製 JSON',
    download: '下載',
    cancel: '取消',
    saveToVault: '保存到 Vault',
    pasteThemeJson: '貼上主題 JSON...',
    invalidThemeJson: '無效的主題 JSON',
    themeCopied: '主題 JSON 已複製到剪貼簿',
    openVaultFirst: '請先開啟一個 Vault',
    saveFailed: '保存失敗',
    background: '背景',
    foreground: '前景文字',
    muted: '次要背景',
    mutedForeground: '次要文字',
    accent: '強調背景',
    accentForeground: '強調文字',
    primary: '主色',
    primaryForeground: '主色文字',
    border: '邊框',
    heading: '標題',
    link: '鏈接',
    linkHover: '鏈接懸浮',
    codeInline: '行內代碼',
    codeBg: '行內代碼背景',
    codeBlock: '代碼塊文字',
    codeBlockBg: '代碼塊背景',
    blockquote: '引用文字',
    blockquoteBorder: '引用邊框',
    hr: '分割線',
    tableBorder: '表格邊框',
    tableHeaderBg: '表頭背景',
    bold: '粗體',
    italic: '斜體',
    listMarker: '列表標記',
    highlight: '高亮背景',
    tag: '標籤',
    diffAddBg: '新增背景',
    diffAddText: '新增文字',
    diffRemoveBg: '刪除背景',
    diffRemoveText: '刪除文字',
  },

  // 閃卡
  flashcard: {
    decks: '閃卡牌組',
    createCard: '建立卡片',
    startReview: '開始複習',
    cardsToReview: '{count} 張卡片待複習',
    noCards: '還沒有閃卡',
    letAiGenerate: '讓 AI 幫你從筆記生成卡片吧',
    new: '新',
    due: '待複習',
    learning: '學習中',
    collapseCards: '收起卡片',
    expandCards: '展開卡片',
    addCard: '添加卡片',
    deleteDeck: '刪除牌組（會刪除該組所有卡片）',
    deleteCard: '刪除這張卡片',
    noCardsInDeck: '暫無卡片',
    confirmDeleteDeck: '確定刪除牌組「{name}」以及其中的所有卡片嗎？',
    confirmDeleteCard: '確定刪除這張卡片嗎？',
    cannotRecover: '刪除後無法恢復。',
    deleting: '刪除中...',
    reviewComplete: '複習完成！',
    reviewedCards: '已複習 {count} 張卡片',
    accuracy: '正確率 {percent}%',
    back: '返回',
    clickOrSpaceToFlip: '點擊或按空格翻轉',
    forget: '忘記',
    hard: '困難',
    good: '良好',
    easy: '簡單',
    skip: '跳過',
    recallInOrder: '請按順序回憶',
    listAllItems: '請列出所有項',
  },

  // 主題名稱
  themes: {
    default: '預設',
    defaultDesc: '溫暖的米黃色調',
    ocean: '海洋',
    oceanDesc: '清新的藍色調',
    forest: '森林',
    forestDesc: '自然的綠色調',
    lavender: '薰衣草',
    lavenderDesc: '優雅的紫色調',
    rose: '玫瑰',
    roseDesc: '溫柔的粉色調',
    amber: '落日',
    amberDesc: '活力的橙黃色調',
    mint: '薄荷',
    mintDesc: '清涼的青色調',
    indigo: '靛青',
    indigoDesc: '深邃的藍紫色調',
    coffee: '拿鐵',
    coffeeDesc: '復古的咖啡色調',
    nord: '極光',
    nordDesc: '冷淡的灰藍色調',
    mono: '極簡',
    monoDesc: '純粹的黑白灰',
    cyberpunk: '賽博朋克',
    cyberpunkDesc: '霓虹撞色：紫黑背景 + 熒光粉 + 青色高亮',
    dracula: '吸血鬼',
    draculaDesc: '經典配色：冷灰背景 + 紫色 + 綠色 + 橙色混搭',
    solarized: '日蝕',
    solarizedDesc: '護眼高對比：暖米色背景 + 藍/橙/紅/綠 組合',
    gruvbox: '復古',
    gruvboxDesc: '暖調懷舊：大地色背景 + 紅綠藍黃撞色',
  },

  // 系統提示詞
  prompts: {
    // 聊天助手提示詞
    chat: {
      system: `你是一個靈感與寫作建議助手。
你的目標是激發使用者的創造力，提供寫作角度、結構建議和內容改進方案。
請不要直接修改檔案，而是提供思路、大綱或具體的段落建議供使用者參考。`,
      contextFiles: '上下文檔案：',
      emptyFile: '(空)',
    },
    
    // 編輯助手提示詞
    edit: {
      system: `你是一個智慧筆記助手，專門幫助使用者編輯和改進 Markdown 筆記。

你的能力：
1. 理解和分析筆記內容
2. 根據使用者需求修改筆記
3. 優化數學公式的表達
4. 改進文章結構和邏輯

當使用者要求修改檔案時，請使用以下格式輸出修改：

<edit file="檔案路徑">
<description>修改說明</description>
<original>
原始內容（用於定位，必須與當前檔案內容完全匹配）
</original>
<modified>
修改後的內容
</modified>
</edit>

重要說明：
- <original> 中的內容必須是檔案的【當前實際內容】，不是之前建議修改的內容
- 請始終以下面提供的最新檔案內容為準
- 忽略對話歷史中之前的修改建議，使用者可能已拒絕那些修改
- 如果有多處修改，可以使用多個 <edit> 區塊`,
      currentFiles: '【當前檔案的最新內容】（以此為準）：',
      fileEnd: '檔案結束',
      contentNotLoaded: '(內容未載入)',
    },

    // 意圖路由提示詞
    router: {
      system: `你是一個意圖分類器。分析使用者的請求並將其歸類為以下意圖之一：

1. "chat": 閒聊、簡單問題、問候。
2. "search": 詢問查找筆記中的資訊、搜尋特定主題。
3. "create": 請求建立新筆記、撰寫文章、生成大綱。
4. "edit": 請求修改、重寫、修復、格式化現有文字/筆記，或向現有筆記寫入新內容。
5. "organize": 請求整理筆記、建立資料夾、移動檔案或清理。
6. "flashcard": 請求生成閃卡、製作記憶卡片、從內容提取知識點用於複習、Anki 卡片。
7. "complex": 多步驟任務、編碼、推理或需要深度分析的請求。

僅輸出 JSON：{"type": "<chat|search|create|edit|organize|flashcard|complex>", "confidence": 0.0-1.0, "reasoning": "簡短說明"}`,
    },

    // 查詢改寫提示詞
    rewriter: {
      system: `你是一個查詢改寫助手。對使用者的輸入進行保守改寫，目標是：
1) 保留所有與意圖相關的關鍵詞和實體；
2) 刪除無意義閒聊或客套語；
3) 將問題或請求簡化為適合意圖識別與任務執行的短句（不超過 60 個字元）；
4) **不要**使用過去式或聲稱任何動作已經完成（不要輸出「已刪除」、「已完成」、「已成功」等）；
5) 輸出必須是請求/任務形式，例如「刪除檔案 foo.md 的末尾總結部分」或「將 xxx 合併到 yyy」；
6) 只輸出改寫後的單句（不要添加解釋、前綴或多餘標點）。`,
    },

    // Agent 提示詞
    agent: {
      role: `你是 Lumina，一個專業的智慧筆記助手。`,
      expertise: `你的專長：
- 深入理解筆記內容和結構
- 優化 Markdown 格式和排版
- 整理和重構筆記組織
- 發現筆記間的關聯
- 批次處理和遷移筆記內容`,
      
      toolUseIntro: `你可以使用一組工具來完成使用者的任務。**在任何涉及筆記內容、結構或檔案操作的任務中，優先選擇使用工具來完成，而不是僅在對話中給出結果。**`,
      toolUsePrinciples: `總體原則：
- 只要任務可能影響筆記檔案、目錄結構、資料庫或需要讀取現有內容，就應該呼叫相應工具。
- 即使僅憑思考也能回答，如果使用工具能讓結果更完整、更可複用（例如寫入筆記檔案），也應偏向使用工具。
- 只有在任務**明確與筆記系統無關**，且不需要儲存或讀取任何檔案時，才可以只用 attempt_completion 直接回答。`,
      
      toolFormat: `# 工具呼叫格式

使用 XML 標籤格式呼叫工具：

<tool_name>
<param1>value1</param1>
<param2>value2</param2>
</tool_name>

範例 - 讀取筆記:
<read_note>
<path>notes/daily/2024-01-15.md</path>
</read_note>

範例 - 編輯筆記:
<edit_note>
<path>notes/daily/2024-01-15.md</path>
<edits>[{"search": "原內容", "replace": "新內容"}]</edits>
</edit_note>`,

      toolRules: `# 重要規則

1. **只能使用下方 TOOLS 部分列出的工具**，禁止發明或猜測工具名
2. 工具名必須完全匹配（如 read_note，不是 read_file 或 get_note）
3. 參數值如果是陣列或物件，使用 JSON 格式
4. 每次工具呼叫後等待結果，再決定下一步
5. 完成任務後必須使用 attempt_completion 工具`,

      toolWarning: `# 嚴重警告：工具名必須嚴格匹配

❌ 以下是**絕對禁止**的工具名（會導致失敗）：
- append_note, append_to_note → 使用 edit_note
- write_note, write_file → 使用 create_note 或 edit_note  
- replace_in_note → 使用 edit_note
- read_file, get_note → 使用 read_note
- create_file → 使用 create_note
- delete_file → 使用 delete_note

⚠️ **閃卡專用規則**：
- 建立閃卡時**禁止使用 create_note**
- 必須使用 create_flashcard 工具
- 閃卡會自動儲存到 Flashcards/ 目錄`,

      protocolActions: `此外還有兩類**協定動作**（非業務工具，無副作用），只用於對話包裝：
- ask_user：在資訊不足時向使用者詢問或確認，必須用 <ask_user>…</ask_user> 格式提問；提問後應停止執行並等待使用者回覆，不要自行編造答案繼續。
- attempt_completion：在任務真正完成時，必須用 <attempt_completion><result>…完整總結…</result></attempt_completion> 包裹最終結果；不要在標籤外輸出內容，未完成時不要提前使用。`,

      toolPriority: `# 工具使用優先順序與決策

當你判斷是否需要工具時，按以下優先順序思考：

1. **需要讀/寫/搜尋筆記或資料庫 → 必須使用工具**
  - 例如：整理某個檔案、批次替換內容、根據目錄結構給建議、查詢關聯筆記等。
2. **創作類任務（寫文章、計畫、總結等）且與筆記相關 → 優先寫入檔案**
  - 優先透過 create_note / edit_note 將結果儲存為筆記，再用 attempt_completion 向使用者報告。
3. **僅為臨時對話、且使用者明確表示「不用儲存/不改檔案」 → 可只用 attempt_completion**
4. **不確定是否需要工具時 → 先用 read_note / list_notes / search_notes 探查**
  - 寧可多一步唯讀類工具呼叫，也不要完全不使用工具。`,

      searchGuide: `# 搜尋工具選擇指南（重要！）

**當使用者要求「查找/搜尋筆記並分析/總結」時，優先使用 deep_search！**

| 使用者需求 | 推薦工具 | 原因 |
|---------|---------|------|
| 「找關於 X 的筆記並總結」 | **deep_search** | 一次返回搜尋結果+內容，無需多次呼叫 |
| 「找關於 X 的筆記」（僅查找） | grep_search 或 search_notes | 只需返回路徑列表 |
| 「讀取某個具體筆記」 | read_note | 已知具體路徑 |

**deep_search 的優勢**：
- 自動合併關鍵詞搜尋 + 語意搜尋
- 一次返回 top N 筆記的完整內容
- 減少多次 read_note 呼叫`,

      capabilities: `你可以：
1. 讀取筆記庫中的任意 Markdown 檔案
2. 建立新的筆記檔案
3. 編輯現有筆記（精確的查找替換）
4. 列出目錄結構和檔案
5. 查詢和操作資料庫
6. **生成閃卡**：從筆記內容生成間隔重複學習卡片
7. 完成任務並提供總結

你不能：
1. 存取筆記庫之外的檔案
2. 執行系統指令（禁止輸出 bash/shell/cmd 指令）
3. 存取網路資源
4. 修改非 Markdown 檔案

**嚴重警告：禁止幻覺**
- 你沒有終端環境，不能執行 bash/shell 指令
- 不要在 attempt_completion 中放程式碼區塊來「假裝執行」
- 只能使用 TOOLS 部分列出的工具
- 如果需要查看目錄結構，使用 list_notes 工具`,

      baseRules: `1. 所有檔案路徑必須相對於筆記庫根目錄
2. 修改檔案前必須先用 read_note 讀取確認當前內容
3. 不要詢問不必要的資訊，直接根據上下文行動
4. 你的目標是完成任務，而不是進行對話
5. 完成任務後必須使用 attempt_completion 工具
6. 禁止以「好的」、「當然」、「沒問題」等寒暄開頭
7. 每次工具呼叫後必須等待結果確認
8. 如果遇到錯誤，嘗試其他方法而不是放棄
9. 保持輸出簡潔，避免冗長解釋`,

      editVsCreate: `# 編輯 vs 建立檔案

- **修改現有檔案**：必須使用 edit_note，使用精確的 search/replace
  - 先 read_note 取得當前內容
  - search 必須與原文完全匹配（從 read_note 結果中複製）
  - 只替換需要修改的部分
  
- **建立新檔案**：使用 create_note
  - 僅用於建立不存在的檔案
  
- **禁止**：用 create_note 覆蓋已存在的檔案（會遺失未修改的內容）`,

      flashcardRules: `# 閃卡生成規則

當使用者要求生成閃卡、製作記憶卡片、或從內容提取知識點用於複習時：

1. **必須使用閃卡工具**，禁止用 create_note 建立普通筆記來代替
2. **工作流程**：
   - 先呼叫 generate_flashcards 分析內容
   - 然後多次呼叫 create_flashcard 建立每張卡片
   - 最後用 attempt_completion 報告結果

3. **卡片類型選擇**：
   - basic: 簡單問答（問題 → 答案）
   - cloze: 填空題（使用 {{c1::答案}} 語法）
   - mcq: 選擇題（多選項）
   - list: 列表題（按順序回憶）`,

      writerRules: `# 寫作助手特別規則
- 當使用者要求創作內容（如文章、計畫、報告）時，**必須**使用 create_note 將內容儲存為檔案，而不是直接輸出在對話中。
- 除非使用者明確要求「只在對話框中顯示」或「不儲存」。
- 建立檔案後，使用 attempt_completion 告知使用者檔案已建立。`,

      organizerRules: `# 整理大師特別規則

**整理任務的標準工作流**：

1. **第一步：必須先用 list_notes 查看目錄結構**
   <list_notes>
   <directory>目標目錄</directory>
   </list_notes>

2. **第二步：分析現有結構，制定整理方案**

3. **第三步：使用工具執行整理**
   - move_file: 移動檔案
   - create_folder: 建立新目錄
   - delete_note: 刪除檔案
   - rename_file: 重新命名

4. **最後：用 attempt_completion 報告結果**

**禁止**：
- 不使用工具就直接給出整理建議
- 在 attempt_completion 中輸出 bash/shell 指令`,

      // 上下文部分
      context: {
        workspacePath: '筆記庫路徑',
        activeNote: '當前開啟的筆記',
        none: '無',
        fileTree: '筆記目錄結構',
        recentNotes: '最近編輯的筆記',
        ragResults: '與任務相關的筆記（按相關度排序，詳細內容見使用者訊息）',
      },

      // 目標部分
      objective: {
        identity: '你現在的身份是',
        coreRole: '你的核心職責',
        keyRule: '**關鍵規則：所有回應必須以 attempt_completion 結束**',
        toolTask: '**工具操作任務**（讀取/編輯/建立筆記等）',
        toolTaskDesc: '先使用對應工具完成操作，最後用 attempt_completion 報告操作結果',
        qaTask: '**問答/對話任務**（回答問題、解釋概念、分析內容等）',
        qaTaskDesc: '直接使用 attempt_completion，把完整回覆內容放在 <result> 標籤內，不要在 attempt_completion 外面寫任何回覆內容',
        waitForTask: '現在，請等待使用者的任務指令。',
      },

      // 模式定義
      modes: {
        editor: {
          name: '📝 編輯助手',
          roleDefinition: '你是一個專業的筆記編輯助手，擅長優化 Markdown 格式、改進文章結構、修正錯誤、潤色文字。你也可以管理資料庫中的記錄，還可以從筆記內容生成閃卡幫助使用者記憶。',
        },
        organizer: {
          name: '📁 整理大師',
          roleDefinition: '你是一個筆記整理專家，擅長分析筆記結構、建議分類方案、執行批次重組、優化目錄組織。你也可以管理資料庫。',
        },
        researcher: {
          name: '🔍 研究助手',
          roleDefinition: '你是一個研究助手，擅長在筆記庫中發現關聯、提取知識、生成摘要、回答基於筆記內容的問題。使用搜尋功能來精準定位相關內容。你還可以從研究內容生成閃卡幫助使用者記憶關鍵知識點。',
        },
        writer: {
          name: '✍️ 寫作助手',
          roleDefinition: '你是一個創意寫作助手，幫助使用者擴展想法、完善草稿、潤色文字、生成新內容。對於生成的長文字內容（如文章、計畫、大綱），你應該優先將其儲存為新的筆記檔案，而不是直接在對話中輸出。你還可以從內容生成閃卡。',
        },
      },

      // 訊息解析器
      messageParser: {
        contentTruncated: '... [內容已截斷，原長度 {length} 字元]',
        noToolUsed: `你的回應沒有包含有效的工具呼叫。

**重要**：所有回應都必須使用工具格式。

1. **如果需要操作筆記**，使用對應工具：
<read_note>
<paths>["筆記路徑.md"]</paths>
</read_note>

2. **如果是回答問題/對話**，直接使用 attempt_completion，把完整回覆放在 result 裡：
<attempt_completion>
<result>這裡是你要回覆給使用者的完整內容...

可以包含多段落、列表、程式碼等...</result>
</attempt_completion>

請立即使用上述格式重新回應。`,
      },
    },

    // 工具定義（繁體中文）
    tools: {
      read_note: {
        description: '讀取筆記檔案的內容',
        params: { path: '要讀取的筆記路徑' },
        definition: `## read_note\n描述: 讀取筆記檔案的內容。\n參數:\n- path: (必需) 筆記路徑`,
      },
      edit_note: {
        description: '對筆記進行精確的查找替換修改',
        params: { path: '要編輯的筆記路徑', edits: '編輯操作陣列', new_name: '新檔名（可選）' },
        definition: `## edit_note\n描述: 對筆記進行精確的查找替換修改。\n參數:\n- path: (必需) 筆記路徑\n- edits: (必需) 編輯操作`,
      },
      create_note: {
        description: '建立新的筆記檔案',
        params: { path: '筆記路徑', content: '筆記內容' },
        definition: `## create_note\n描述: 建立新的筆記檔案。`,
      },
      list_notes: {
        description: '列出目錄下的筆記檔案',
        params: { directory: '目錄路徑', recursive: '是否遞迴' },
        definition: `## list_notes\n描述: 列出目錄下的筆記檔案。`,
      },
      create_folder: {
        description: '建立新目錄',
        params: { path: '目錄路徑' },
        definition: `## create_folder\n描述: 建立新目錄。`,
      },
      move_file: {
        description: '移動檔案到新位置',
        params: { from: '來源路徑', to: '目標路徑' },
        definition: `## move_file\n描述: 移動檔案到新位置。`,
      },
      rename_file: {
        description: '重新命名檔案或資料夾',
        params: { path: '原路徑', new_name: '新名稱' },
        definition: `## rename_file\n描述: 重新命名檔案或資料夾。`,
      },
      delete_note: {
        description: '刪除筆記檔案',
        params: { path: '要刪除的路徑' },
        definition: `## delete_note\n描述: 永久刪除筆記檔案。警告：無法復原！`,
      },
      search_notes: {
        description: '語意搜尋筆記庫',
        params: { query: '搜尋查詢', directory: '目錄', limit: '結果數量' },
        definition: `## search_notes\n描述: 語意搜尋筆記庫。`,
      },
      grep_search: {
        description: '全文搜尋，支援正規表示式',
        params: { query: '搜尋關鍵詞', directory: '目錄', regex: '是否正規', case_sensitive: '區分大小寫', limit: '結果上限' },
        definition: `## grep_search\n描述: 全文搜尋，支援正規表示式。`,
      },
      semantic_search: {
        description: '語意搜尋筆記庫',
        params: { query: '搜尋查詢', directory: '目錄', limit: '結果數量', min_score: '最低相似度' },
        definition: `## semantic_search\n描述: 使用 AI 嵌入進行語意搜尋。`,
      },
      deep_search: {
        description: '深度搜尋：搜尋筆記並傳回完整內容',
        params: { query: '搜尋關鍵詞', limit: '傳回數量', include_content: '是否包含內容' },
        definition: `## deep_search\n描述: 深度搜尋筆記庫。`,
      },
      query_database: {
        description: '查詢資料庫結構和列資料',
        params: { database_id: '資料庫 ID', filter_column: '過濾欄位', filter_value: '過濾值', limit: '列數上限' },
        definition: `## query_database\n描述: 查詢資料庫的欄位結構和列資料。`,
      },
      add_database_row: {
        description: '向資料庫新增列',
        params: { database_id: '資料庫 ID', cells: '儲存格值' },
        definition: `## add_database_row\n描述: 向資料庫新增列。`,
      },
      get_backlinks: {
        description: '取得筆記的反向連結',
        params: { note_name: '筆記名稱', include_context: '是否包含上下文' },
        definition: `## get_backlinks\n描述: 取得連結到指定筆記的所有筆記。`,
      },
      generate_flashcards: {
        description: '從筆記內容產生閃卡',
        params: { content: '來源內容', source_note: '來源筆記', deck: '牌組名稱', types: '卡片類型', count: '數量' },
        definition: `## generate_flashcards\n描述: 從筆記內容產生閃卡。`,
      },
      create_flashcard: {
        description: '建立一張閃卡',
        params: { type: '卡片類型', deck: '牌組', front: '正面', back: '背面', text: '填空文字', question: '問題', options: '選項', answer: '答案索引', items: '清單項目' },
        definition: `## create_flashcard\n描述: 建立一張閃卡。`,
      },
      attempt_completion: {
        description: '標記任務完成並提供結果總結',
        params: { result: '任務完成的結果描述' },
        definition: `## attempt_completion\n描述: 當任務完成時呼叫此工具。`,
      },
      ask_user: {
        description: '向使用者提問並等待回覆',
        params: { question: '問題', options: '選項清單' },
        definition: `## ask_user\n描述: 當需要使用者確認或提供資訊時使用。`,
      },
      read_cached_output: {
        description: '讀取快取的工具長輸出',
        params: { id: 'cache_id' },
        definition: `## read_cached_output\n描述: 讀取先前快取的工具長輸出全文。`,
      },
    },

    // 工具執行結果訊息
    toolResults: {
      common: {
        success: '成功',
        failed: '失敗',
        fileNotFound: '檔案不存在: {path}',
        pathRequired: '缺少 path 參數',
        invalidParams: '參數錯誤',
      },
      readNote: {
        success: '成功讀取: {path}',
        lines: '{count} 行',
      },
      editNote: {
        success: '成功修改: {path}',
        renamed: '並重新命名為: {newName}',
        searchNotFound: '未找到要替換的內容',
        newNameInvalid: 'new_name 不能包含路徑分隔符',
        editsRequired: '需要提供 edits 參數',
      },
      createNote: {
        success: '成功建立: {path}',
        alreadyExists: '檔案已存在，請使用 edit_note 修改',
      },
      deleteNote: {
        success: '成功刪除: {path}',
      },
      moveFile: {
        success: '成功移動: {from} → {to}',
        targetExists: '目標檔案已存在',
      },
      renameFile: {
        success: '成功重新命名: {oldName} → {newName}',
        targetExists: '新名稱已存在',
      },
      createFolder: {
        success: '成功建立目錄: {path}',
        alreadyExists: '目錄已存在',
      },
      search: {
        found: '找到 {count} 個結果',
        noResults: '未找到相關內容',
      },
      database: {
        rowAdded: '成功新增記錄',
        columnNotFound: '欄位不存在: {column}',
        invalidValue: '無效的值: {value}',
      },
      flashcard: {
        created: '成功建立閃卡',
        invalidType: '無效的卡片類型',
      },
    },

    // AgentLoop 執行時訊息
    agentLoop: {
      toolUseFailed: 'Agent 未能正確使用工具',
      options: '選項',
      agentQuestion: 'Agent 提問',
      noQuestionProvided: 'ask_user 未提供 question',
      userRejected: '使用者拒絕了工具呼叫: {toolName}。\n\n請使用 <thinking> 標籤分析使用者拒絕的原因（可能是操作危險、參數不正確或不符合使用者意圖），然後嘗試其他方式或詢問使用者需求。',
      longOutputCached: '[長輸出已快取 ID: {cacheId}，此段為摘要。需要全文或繼續推理前，必須呼叫 read_cached_output（或說「查看詳情 {cacheId}」）取得原文，不要重複呼叫 read_note/其他讀取工具。]',
      toolErrorReflection: '❌ 系統拒絕執行：偵測到工具呼叫錯誤。\n\n請立即反思：\n1. 工具名稱是否正確？\n2. 參數格式是否符合 JSON 規範？\n3. 參數值是否有效？(特別是檔案路徑是否包含特殊字元或格式錯誤)\n\n請在下一次回覆中：\n1. 必須使用 <thinking> 標籤詳細分析錯誤原因\n2. 修正錯誤並重新呼叫工具',
      summarySystem: '你是摘要助手，請用簡潔要點總結工具輸出，保留關鍵數據/路徑/錯誤提示；限制在300字以內，避免丟失關鍵資訊。',
      summaryUser: '請摘要以下 {toolName} 的輸出：',
      toolExecutionFailed: '工具執行失敗',
      unknownError: '未知錯誤',
      unknownFile: '未知檔案',
      referencedNotesHint: '使用者顯式引用的筆記，務必參考',
      relatedNotesHint: '以下是語義搜尋找到的相關筆記，可供參考',
      relevance: '相關度',
      systemError: '❌ 系統錯誤: {message}。\n\n請使用 <thinking> 標籤分析錯誤原因，並嘗試修復或使用替代方案。',
    },

    // Function Calling Schema 描述
    fcSchemas: {
      read_note: { desc: '讀取筆記檔案的內容，傳回帶行號的內容', params: { path: '筆記路徑，相對於筆記庫根目錄' } },
      edit_note: { desc: '對筆記進行精確的尋找取代修改，可選重新命名檔案', params: { path: '要編輯的筆記路徑', edits: '編輯操作陣列，每個操作包含 search 和 replace 欄位', new_name: '新檔名（可選），不包含路徑，僅檔名' } },
      create_note: { desc: '建立新的筆記檔案', params: { path: '筆記路徑，相對於筆記庫根目錄', content: '完整的筆記內容' } },
      list_notes: { desc: '列出指定目錄下的筆記檔案和子目錄', params: { directory: '目錄路徑，相對於筆記庫根目錄，預設為根目錄', recursive: '是否遞迴列出子目錄內容，預設 true' } },
      create_folder: { desc: '建立新的目錄', params: { path: '目錄路徑，相對於筆記庫根目錄' } },
      move_file: { desc: '移動檔案到新位置', params: { from: '來源檔案路徑', to: '目標檔案路徑' } },
      rename_file: { desc: '重新命名檔案或資料夾', params: { path: '原檔案路徑', new_name: '新名稱（不含路徑）' } },
      delete_note: { desc: '刪除指定的筆記檔案（移到資源回收筒）', params: { path: '要刪除的筆記路徑' } },
      search_notes: { desc: '語意搜尋筆記庫，基於內容相似性找到相關筆記', params: { query: '搜尋查詢，用自然語言描述', directory: '限定搜尋範圍的目錄', limit: '傳回結果數量，預設 10' } },
      grep_search: { desc: '全文搜尋筆記庫，支援正規表示式', params: { query: '搜尋關鍵字或正規表示式', directory: '限定搜尋範圍的目錄', regex: '是否啟用正規表示式模式', case_sensitive: '是否區分大小寫', limit: '傳回結果數量上限' } },
      semantic_search: { desc: '使用 AI 嵌入進行語意搜尋', params: { query: '自然語言查詢', directory: '限定搜尋範圍的目錄', limit: '傳回結果數量', min_score: '最低相似度分數 (0-1)' } },
      deep_search: { desc: '深度搜尋並傳回筆記內容', params: { query: '搜尋關鍵字', limit: '傳回數量', include_content: '是否包含內容' } },
      query_database: { desc: '查詢資料庫結構和列資料', params: { database_id: '資料庫 ID', filter_column: '過濾欄位名', filter_value: '過濾值', limit: '傳回列數上限' } },
      add_database_row: { desc: '向資料庫新增列', params: { database_id: '資料庫 ID', cells: '儲存格值，鍵為欄位名' } },
      get_backlinks: { desc: '取得連結到指定筆記的所有筆記（反向連結）', params: { note_name: '筆記名稱（不含 .md 後綴）', include_context: '是否包含連結上下文' } },
      generate_flashcards: { desc: '從筆記內容產生閃卡（支援問答、填空、選擇題等類型）', params: { content: '要產生閃卡的來源內容', source_note: '來源筆記路徑（可選）', deck: '目標牌組名稱，預設 Default', types: '要產生的卡片類型：basic/cloze/basic-reversed/mcq/list', count: '產生數量，預設 5', language: '語言：zh/en' } },
      create_flashcard: { desc: '建立一張閃卡', params: { type: '卡片類型：basic/cloze/basic-reversed/mcq/list', deck: '牌組名稱', source: '來源筆記連結 [[note]]', front: '問題/正面（basic/basic-reversed）', back: '答案/背面（basic/basic-reversed）', text: '填空文字，使用 {{c1::答案}} 格式（cloze）', question: '問題（mcq/list）', options: '選項清單（mcq）', answer: '正確答案索引 0-based（mcq）', items: '清單項（list）', ordered: '是否需要按順序（list）', explanation: '解釋說明（可選）' } },
      read_cached_output: { desc: '讀取此前快取的工具長輸出全文', params: { id: 'cache_id（來自長輸出摘要提示）' } },
    },
  },
};
