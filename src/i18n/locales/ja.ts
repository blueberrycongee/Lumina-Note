// 日本語
export default {
  // ウェルカム画面
  welcome: {
    title: 'Lumina Note',
    subtitle: 'ローカルファーストの AI 駆動ノートアプリ',
    openFolder: 'ノートフォルダを開く',
    selectFolder: 'Markdown ノートを含むフォルダを選択',
    language: '言語',
  },
  
  // 共通
  common: {
    save: '保存',
    cancel: 'キャンセル',
    confirm: '確認',
    delete: '削除',
    edit: '編集',
    create: '作成',
    search: '検索',
    settings: '設定',
    close: '閉じる',
    open: '開く',
    loading: '読み込み中...',
    saved: '保存済み',
    unsaved: '未保存',
    error: 'エラー',
    success: '成功',
    untitled: '無題',
    newConversation: '新規会話',
    unsavedChanges: '未保存の変更',
    aiChatTab: 'AIチャット',
    collapse: '折りたたむ',
    expand: '展開',
    localGraph: 'ローカルグラフ',
  },
  
  // サイドバー
  sidebar: {
    files: 'ファイル',
    search: '検索',
    graph: 'グラフ',
    newNote: '新規ノート',
    newFolder: '新規フォルダ',
    refresh: '更新',
    toggleSidebar: 'サイドバーを切替',
    toggleAIPanel: 'AI パネルを切替',
  },

  favorites: {
    title: 'お気に入り',
    add: 'お気に入りに追加',
    remove: 'お気に入りから削除',
    empty: 'お気に入りなし',
    sortManual: '手動',
    sortRecentAdded: '最近追加',
    sortRecentOpened: '最近開いた',
    moveUp: '上へ',
    moveDown: '下へ',
  },
  
  // エディター
  editor: {
    reading: '閲覧',
    readingMode: '閲覧モード',
    live: 'ライブ',
    livePreview: 'ライブプレビュー',
    source: 'ソース',
    sourceMode: 'ソースモード',
    saving: '保存中...',
    edited: '編集済み',
    exportPdf: 'PDF エクスポート',
    splitView: '分割表示',
    goBack: '戻る',
    goForward: '進む',
    goBackShortcut: '戻る (Alt+←)',
    goForwardShortcut: '進む (Alt+→)',
    videoNoteDetected: 'これは動画ノート Markdown です。専用の動画ノートビューで閲覧・編集できます。',
    openAsVideoNote: '動画ノートとして開く',
    imageLoadFailed: '画像の読み込みに失敗',
    noteNotFound: 'ノートが見つかりません',
    mermaidRenderFailed: 'レンダリングに失敗',
  },
  
  // AI アシスタント
  ai: {
    chat: 'AI アシスタント',
    thinking: '考え中...',
    askAnything: '何でも質問してください...',
    settings: 'AI 設定',
    agentMode: 'Agent モード - スマートタスク実行',
    chatMode: 'チャットモード - シンプルなQ&A',
    conversation: 'チャット',
    inputPlaceholder: 'メッセージを入力... (@ でファイル参照)',
    agentPlaceholder: 'タスク指示を入力... (@ でファイル参照)',
    searchFiles: 'ファイルを検索...',
    noFilesFound: '一致するファイルが見つかりません',
    totalFiles: '全 {count} ファイル',
    attachFile: 'ファイルを添付 (または @ で参照)',
    addFile: '@ ファイルを追加',
    stopGenerate: '生成を停止',
    stopVoice: '音声入力を停止',
    startVoice: '音声入力を開始',
    send: '送信',
    stop: '停止',
    regenerate: '再生成',
    errorRetry: 'エラーが発生しました、再試行してください',
    welcomeAgent: '私は Lumina Agent です。完了したいタスクを教えてください。',
    startTask: 'タスク指示を入力して開始',
    needApproval: '承認が必要',
    tool: 'ツール',
    approve: '承認',
    reject: '拒否',
    quoteFrom: '引用元',
    welcomeTitle: 'こんにちは、Lumina です',
    welcomeSubtitle: 'ノート管理、アイデア整理、知識検索のお手伝いをします...',
    polishText: '文章を磨く',
    polishTextDesc: 'Chat: 表現を最適化',
    summarizeNote: 'ノートを要約',
    summarizeNoteDesc: 'Chat: 要点を抽出',
    writeArticle: '記事を書く',
    writeArticleDesc: 'Agent: 新規ノート作成',
    studyNotes: '学習ノート',
    studyNotesDesc: 'Agent: 知識を整理',
    history: '履歴',
    historyChats: '履歴チャット',
    sessionTokens: 'セッショントークン',
    newChat: '新規チャット',
    noHistory: '履歴はありません',
    agentChats: 'Agent チャット',
    chatChats: 'Chat チャット',
    addWorkspaceFile: 'ワークスペースファイルを追加',
    searchFile: 'ファイルを検索...',
    fileNotFound: 'ファイルが見つかりません',
    filesCount: '全 {count} ファイル',
    chatModeHint: 'シンプルなチャットモード、ファイル操作不可',
    agentModeHint: 'スマートアシスタントモード、ファイル読み書きとタスク実行可能',
    notConfigured: '未設定',
    aiChatSettings: 'AI チャット設定',
    getRealtimeContent: 'ライブラリからリアルタイムコンテンツを取得',
    aiGeneratedWarning: 'AI が生成したコンテンツには誤りがある可能性があります。確認してください',
    agentInputPlaceholder: '私は Lumina です。このモードでは多くの強力なツールがあり、様々なタスクをお手伝いします！',
    chatInputPlaceholder: '私は Lumina です。何でもお話しください。知っていることは何でもお答えします',
    debugPanel: 'デバッグパネル',
    agentDebugPanel: 'Agent デバッグパネル',
    mode: 'モード',
    status: 'ステータス',
    fullMsgsCount: '完全メッセージ数',
    displayMsgsCount: '表示メッセージ数',
    intentResult: 'インテント認識結果',
    notTriggered: '未トリガー',
    noIntentData: 'インテントデータなし',
    noMsgs: 'メッセージがありません。メッセージを送信してデバッグを開始',
    attachImage: '画像を追加',
    modelNoVision: '現在のモデルは画像をサポートしていません',
    imageAttached: '{count} 枚の画像を追加しました',
  },
  
  // 設定
  settings: {
    title: '設定',
    theme: 'テーマ',
    language: '言語',
    editor: 'エディター',
    ai: 'AI 設定',
  },
  
  // 検索
  search: {
    placeholder: 'ノートを検索...',
    noResults: '結果が見つかりません',
    results: '件の結果',
  },
  
  // グラフ
  graph: {
    title: 'ナレッジグラフ',
    nodes: 'ノード',
    edges: 'エッジ',
    current: '現在のノート',
    linked: 'リンクされたノート',
    tags: 'タグ',
    outline: 'アウトライン',
    backlinks: 'リンク',
  },
  
  // PDF
  pdf: {
    export: 'PDF エクスポート',
    exportSuccess: 'PDF のエクスポートに成功しました！',
    exportFailed: 'PDF のエクスポートに失敗しました',
  },
  
  // ファイル管理
  file: {
    quickNote: 'クイックノート',
    voiceNote: '音声ノート',
    emptyFolder: 'フォルダが空です',
    fileName: 'ファイル名',
    folderName: 'フォルダ名',
    openFolder: 'フォルダを開く...',
    newWindow: '新規ウィンドウ',
    selectWorkingDir: '作業ディレクトリを選択',
    createQuickNoteFailed: 'クイックノートの作成に失敗',
    renameFailed: '名前の変更に失敗',
    createFailed: '作成に失敗',
    fileExists: 'ファイルが既に存在します',
    folderExists: 'フォルダが既に存在します',
    openFailed: '開くのに失敗、パスをコピーしました',
    voiceRecordHint: '音声録音を開始、終了後自動保存し要約を生成',
  },
  
  // インデックス/RAG
  rag: {
    indexing: 'インデックス中...',
    indexed: 'インデックス',
    files: 'ファイル',
    notInitialized: '未初期化',
    cancel: 'キャンセル',
    rebuild: '再構築',
    notEnabled: '無効',
    cancelIndex: 'インデックスをキャンセル',
    rebuildIndex: 'インデックスを再構築',
    chunks: 'チャンク',
    notBuilt: 'インデックス未構築',
  },
  
  // バックリンクとアウトライン
  panel: {
    openNoteToShowBacklinks: 'ノートを開いてバックリンクを表示',
    buildingIndex: 'インデックスを構築中...',
    noBacklinks: 'バックリンクなし',
    backlinkHint: '他のノートで [[{name}]] を使用してリンク',
    backlinks: '件のバックリンク',
    noTags: 'タグなし',
    tagHint: '#タグ名 でタグを作成',
    tags: '件のタグ',
    openNoteToShowOutline: 'ノートを開いてアウトラインを表示',
    noHeadings: 'このノートには見出しがありません',
    headingHint: '# で見出しを作成',
    headings: '件の見出し',
    toggleLevel: 'Hを切替',
    clearChat: '会話をクリア',
    back: '← 戻る',
  },
  
  // 設定パネル
  settingsPanel: {
    title: '設定',
    aiChatSettings: 'AI チャット設定',
    provider: 'プロバイダ',
    apiKey: 'API Key',
    apiKeyOptional: 'オプション',
    localModelNoKey: 'ローカルモデルは API Key 不要',
    model: 'モデル',
    customModelId: 'カスタムモデル ID',
    customModelHint: '完全なモデル ID を入力（名前空間含む）',
    baseUrl: 'Base URL',
    baseUrlHint: 'オプション、サードパーティプロキシ用',
    temperature: '温度 (Temperature)',
    temperatureHint: '高い値は出力をよりランダムに、低い値はより集中的にします。',
    agentSettings: 'Agent 設定',
    autoApproveTools: 'ツール呼び出しを自動承認',
    noManualConfirm: '手動確認不要',
    semanticSearch: 'セマンティック検索 (RAG)',
    enable: '有効',
    embeddingService: 'Embedding サービス',
    embeddingApiKey: 'Embedding API Key',
    embeddingBaseUrl: 'Embedding Base URL',
    embeddingModel: 'Embedding モデル',
  },
  
  // 設定モーダル
  settingsModal: {
    title: '設定',
    theme: 'テーマ',
    createTheme: 'テーマを作成',
    themeDescription: '配色を選択、各テーマはライト/ダークモードに自動適応',
    myThemes: 'マイテーマ',
    officialThemes: '公式テーマ',
    // テーマ名と説明
    themes: {
      default: { name: 'デフォルト', description: '暖かみのあるベージュ調' },
      ocean: { name: 'オーシャン', description: '爽やかなブルー調' },
      forest: { name: 'フォレスト', description: '自然なグリーン調' },
      lavender: { name: 'ラベンダー', description: 'エレガントなパープル調' },
      rose: { name: 'ローズ', description: '優しいピンク調' },
      amber: { name: 'サンセット', description: '活気あるオレンジイエロー調' },
      mint: { name: 'ミント', description: '涼しげなシアン調' },
      indigo: { name: 'インディゴ', description: '深みのあるブルーパープル調' },
      coffee: { name: 'ラテ', description: 'ヴィンテージなコーヒー調' },
      nord: { name: 'オーロラ', description: 'クールなグレーブルー調' },
      mono: { name: 'ミニマル', description: 'ピュアなモノクロ' },
      cyberpunk: { name: 'サイバーパンク', description: 'ネオンカラー：紫黒 + ホットピンク + シアン' },
      dracula: { name: 'ドラキュラ', description: 'クラシック：クールグレー + 紫 + 緑 + オレンジ' },
      solarized: { name: 'ソラライズド', description: '目に優しい：暖かいベージュ + 青/橙/赤/緑' },
      gruvbox: { name: 'レトロ', description: 'ノスタルジック：アースカラー + 赤緑青黄アクセント' },
    },
    editor: 'エディター',
    defaultEditMode: 'デフォルト編集モード',
    defaultEditModeDesc: 'ファイルを開くときのデフォルトビュー',
    livePreview: 'ライブプレビュー',
    sourceMode: 'ソースモード',
    readingMode: '閲覧モード',
    aiAssistant: 'AI アシスタント',
    currentModel: '現在のモデル',
    configInRightPanel: '右パネルで詳細設定',
    notConfigured: '未設定',
    about: 'このアプリについて',
    appDescription: 'ローカルファーストの AI 駆動ノートアプリ',
    confirmDeleteTheme: 'テーマ "{name}" を削除しますか？',
  },

  // タイトルバー
  titleBar: {
    minimize: '最小化',
    maximize: '最大化',
    restore: '元に戻す',
    close: '閉じる',
  },

  // コマンドパレット
  commandPalette: {
    newNote: '新規ノート',
    newNoteDesc: '新しい Markdown ノートを作成',
    quickOpen: 'クイックオープン',
    quickOpenDesc: 'ノートを検索して開く',
    toggleLeftSidebar: '左サイドバー切替',
    toggleLeftSidebarDesc: 'ファイルツリーの表示/非表示',
    toggleRightSidebar: '右サイドバー切替',
    toggleRightSidebarDesc: 'AI パネルの表示/非表示',
    toggleToLight: 'ライトモードに切替',
    toggleToDark: 'ダークモードに切替',
    toggleThemeDesc: 'アプリテーマを切替',
    openGraph: 'グラフを開く',
    switchToGraph: 'グラフに切替',
    graphDesc: 'ノート間のリンク関係を表示',
    switchWorkspace: 'ワークスペース切替',
    current: '現在',
    notSelected: '未選択',
    globalSearch: 'グローバル検索',
    globalSearchDesc: 'すべてのノートで内容を検索',
    commandPlaceholder: 'コマンドを入力...',
    filePlaceholder: 'ファイル名で検索...',
    searchPlaceholder: 'ノート内容を検索...',
    commands: 'コマンド',
    files: 'ファイル',
    noResults: '一致する項目がありません',
    select: '選択',
    confirm: '確認',
    switchMode: 'モード切替',
    close: '閉じる',
  },

  // タブバー
  tabBar: {
    close: '閉じる',
    closeOthers: '他を閉じる',
    closeAll: 'すべて閉じる',
    pin: 'タブを固定',
    unpin: '固定を解除',
  },

  // 会話リスト
  conversationList: {
    collapseList: 'リストを折りたたむ',
    expandList: 'リストを展開',
    newConversation: '新規会話',
    deleteConversation: '会話を削除',
    noConversations: '会話がありません',
    clearHistory: '履歴をクリア',
  },

  // コンテキストメニュー
  contextMenu: {
    addLink: 'リンクを追加',
    addExternalLink: '外部リンクを追加',
    textFormat: 'テキスト書式',
    paragraphSettings: '段落設定',
    bold: '太字',
    italic: '斜体',
    strikethrough: '取り消し線',
    highlight: 'ハイライト',
    inlineCode: 'インラインコード',
    bulletList: '箇条書き',
    numberedList: '番号付きリスト',
    taskList: 'タスクリスト',
    heading1: '見出し1',
    heading2: '見出し2',
    heading3: '見出し3',
    heading4: '見出し4',
    heading5: '見出し5',
    heading6: '見出し6',
    quote: '引用',
    cut: '切り取り',
    copy: 'コピー',
    paste: '貼り付け',
  },

  // AI フローティングパネル
  aiFloatingPanel: {
    agentMode: 'Agent モード',
    chatMode: 'チャットモード',
    notConfigured: '未設定',
    clearChat: 'チャットをクリア',
    settings: '設定',
    dockToSidebar: 'サイドバーに戻る',
    provider: 'プロバイダー',
    model: 'モデル',
    customModelId: 'カスタムモデル ID',
    customModelPlaceholder: '例：deepseek-ai/DeepSeek-V3',
    baseUrl: 'Base URL',
    optional: 'オプション',
  },

  // ビデオノート
  videoNote: {
    title: 'ビデオノート',
    startVideoNote: 'ビデオノートを開始',
    pasteVideoLink: 'B站動画リンクを貼り付け、視聴しながらメモ',
    startNote: 'ノート開始',
    supportedLinks: 'bilibili.com と b23.tv リンクに対応',
    openInBrowser: 'ブラウザで開く',
    exportMarkdown: 'Markdown でエクスポート',
    minimize: '最小化（左のビデオボタンで復元可能）',
    loading: 'B站動画を読み込み中...',
    loadingHint: '初回読み込みには数秒かかる場合があります',
    webviewLoaded: 'WebView 読み込み完了',
    pasteVideoUrl: 'B站動画リンクを貼り付け、例: https://www.bilibili.com/video/BV...',
    invalidUrl: '有効なB站動画リンクを入力してください',
    loadFailed: '動画の読み込みに失敗しました',
    exportSuccess: 'エクスポート先:',
    exportFailed: 'エクスポート失敗',
    noteTimeline: 'ノートタイムライン',
    notesCount: '{count} 件のノート',
    syncDanmaku: 'コメント同期',
    syncing: '同期中...',
    prefix: 'プレフィックス',
    fillPrefix: '入力',
    addNote: 'ノート追加',
    enterNoteContent: 'ノート内容を入力...',
    noNotes: 'ノートがありません',
    clickAddNote: '「ノート追加」をクリックして記録開始',
    confirmDelete: 'このノートを削除しますか？',
    pauseTimer: 'タイマー停止',
    startTimer: 'タイマー開始',
    timing: 'タイマー中',
    paused: '一時停止',
    danmakuTip: 'コメントノート',
    getVideoInfoFailed: '動画情報の取得に失敗しました',
    noDanmakuFound: '"{prefix}" で始まるコメントが見つかりません',
    danmakuTotal: '{count} 件のコメントを取得',
    recentDanmaku: '最新5件',
    danmakuHint: 'ヒント：\n1. B站コメントには数分の遅延があります\n2. 送信形式',
    syncComplete: '同期完了！{count} 件のノートを追加',
    syncFailed: 'コメント同期に失敗しました',
  },

  // ブラウザ
  browser: {
    toggleLeftPanel: '左パネル切替',
    toggleRightPanel: '右パネル切替',
    addBookmark: 'ブックマーク追加',
    share: '共有',
    loadError: '読み込みエラー',
    retry: '再試行',
    startBrowsing: 'ブラウジング開始',
    enterUrlOrSearch: 'アドレスバーにURLまたは検索キーワードを入力',
    loaded: '読み込み完了',
  },

  // ナレッジグラフ
  knowledgeGraph: {
    settings: 'グラフ設定',
    physics: '物理エンジン',
    nodeRepulsion: 'ノード反発力',
    linkLength: 'リンク長',
    centerPull: '中心引力',
    visual: 'ビジュアル効果',
    nodeSize: 'ノードサイズ',
    showLabels: 'ラベル表示',
    showFolders: 'フォルダノード表示',
    isolateView: '分離ビュー',
    openNote: 'ノートを開く',
    linkedNotes: '関連ノート',
    noLinkedNotes: '関連ノートがありません',
  },

  // PDF ビューア
  pdfViewer: {
    readingFile: 'ファイル読み込み中...',
    loadFailed: 'PDF の読み込みに失敗しました',
    interactiveMode: 'インタラクティブモード',
    interacting: 'インタラクション中',
    elementRecognition: '要素認識モード',
    catalog: '目次',
    collapseCatalog: '目次を折りたたむ',
    expandCatalog: '目次を展開',
    text: 'テキスト',
    image: '画像',
    table: 'テーブル',
    formula: '数式',
    pdfReference: 'PDF 参照',
  },

  // Agent メッセージ
  agentMessage: {
    steps: '{count} ステップ',
    thinking: '思考中...',
    params: 'パラメータ',
    result: '結果',
    executing: '実行中...',
    directory: 'ディレクトリ',
    recursive: '再帰',
    paths: 'パス',
    file: 'ファイル',
    timeoutWarning: 'LLM リクエストの応答時間が長すぎます（2分以上）',
    interruptRetry: '中断してリトライ',
    copy: 'コピー',
  },

  // 選択ツールバー
  selectionToolbar: {
    addToChat: 'チャットに追加',
    summary: '要約',
    translate: '翻訳',
    polish: '推敲',
    todos: 'TODO',
    videoNote: 'ビデオノート',
    summaryTitle: '要約',
    translateTitle: '翻訳',
    todoTitle: 'TODOリスト',
    selectionSummary: '選択範囲を要約',
    selectionTranslate: '選択範囲を翻訳',
    selectionPolish: '選択範囲を推敲',
    generateTodo: 'TODOリスト生成',
    translateFailed: '翻訳に失敗しました。AI 設定を確認するか、後でもう一度お試しください。',
    polishFailed: '推敲に失敗しました。AI 設定を確認するか、後でもう一度お試しください。',
    summaryFailed: '要約の生成に失敗しました。AI 設定を確認するか、後でもう一度お試しください。',
    todoFailed: 'TODOリストの生成に失敗しました。AI 設定を確認するか、後でもう一度お試しください。',
    unknown: '不明',
  },

  // AI 設定ダイアログ
  aiSettings: {
    title: 'AI チャット設定',
    close: '閉じる',
    mainModel: 'メインモデル',
    provider: 'プロバイダー',
    apiKey: 'API Key',
    apiKeyOptional: 'オプション',
    localModelNoKey: 'ローカルモデルは API Key 不要',
    model: 'モデル',
    customModelId: 'カスタムモデル ID',
    customModelHint: '例：deepseek-ai/DeepSeek-V3 または Pro/ERNIE-4.0-Turbo-8K',
    baseUrl: 'Base URL',
    baseUrlOptional: 'オプション、サードパーティプロキシ用',
    temperature: 'Temperature',
    dynamicRouting: 'ダイナミックルーティング',
    enable: '有効',
    routingDescription: 'インテント認識モデルとルーティングルールを設定。',
    intentModel: 'インテント認識モデル',
    intentModelDesc: 'ユーザーインテント分析用 (Chat/Search/Edit/...)',
    useMainKey: '空欄の場合はメイン Key を使用',
    chatModel: 'チャットモデル',
    chatModelDesc: 'Chat モードと簡単なタスク用（雑談、検索など）',
    followMainModel: 'メインモデルに従う（デフォルト）',
    noChatModelWarning: '専用チャットモデルが設定されていません。すべてのタスクにメインモデルを使用します。',
    routingRules: 'ルーティングルール',
    routingRulesDesc: 'システムは以下のタスクに「チャットモデル」を自動使用し、コスト削減と速度向上を図ります：',
    chatTask: '雑談 (Chat) - 日常会話、インスピレーション',
    searchTask: '検索 (Search) - ナレッジ検索、情報照会',
    otherTasksNote: '他の複雑なタスク（編集、整理、執筆など）は品質確保のため常に「メインモデル」を使用。',
    agentSettings: 'Agent 設定',
    autoApproveTools: 'ツール呼び出しを自動承認',
    noManualConfirm: '手動確認不要',
    semanticSearch: 'セマンティック検索 (RAG)',
    indexing: 'インデックス中',
    indexed: '{count} 個のチャンクをインデックス済み',
    notIndexed: 'インデックス未作成',
    rebuildIndex: 'インデックス再構築',
    cancelIndex: 'インデックスキャンセル',
    embeddingService: 'Embedding サービス',
    embeddingApiKey: 'Embedding API Key',
    embeddingBaseUrl: 'Embedding Base URL',
    embeddingModel: 'Embedding モデル',
    vectorDimensions: 'ベクトル次元',
    dimensionsHint: '例: 1024（空欄でデフォルト）',
    reranker: 'リランカー',
    rerankerBaseUrl: 'Reranker Base URL',
    rerankerApiKey: 'Reranker API Key',
    rerankerModel: 'Reranker モデル',
    topN: '返却数 (Top N)',
  },

  // テーマエディタ
  themeEditor: {
    title: 'テーマエディタ',
    switchToDark: 'ダークプレビューに切替',
    switchToLight: 'ライトプレビューに切替',
    themeName: 'テーマ名',
    description: '説明',
    colorGroups: 'カラーグループ',
    baseUI: '基本 UI',
    markdownText: 'Markdown テキスト',
    code: 'コード',
    tableAndDivider: 'テーブルと区切り',
    diffCompare: 'Diff 比較',
    basedOnTheme: '公式テーマをベースに',
    selectBaseTheme: 'ベーステーマを選択...',
    import: 'インポート',
    copyJson: 'JSON をコピー',
    download: 'ダウンロード',
    cancel: 'キャンセル',
    saveToVault: 'Vault に保存',
    pasteThemeJson: 'テーマ JSON を貼り付け...',
    invalidThemeJson: '無効なテーマ JSON',
    themeCopied: 'テーマ JSON をクリップボードにコピーしました',
    openVaultFirst: '先に Vault を開いてください',
    saveFailed: '保存に失敗しました',
    background: '背景',
    foreground: '前景テキスト',
    muted: '二次背景',
    mutedForeground: '二次テキスト',
    accent: 'アクセント背景',
    accentForeground: 'アクセントテキスト',
    primary: 'プライマリ',
    primaryForeground: 'プライマリテキスト',
    border: 'ボーダー',
    heading: '見出し',
    link: 'リンク',
    linkHover: 'リンクホバー',
    codeInline: 'インラインコード',
    codeBg: 'インラインコード背景',
    codeBlock: 'コードブロックテキスト',
    codeBlockBg: 'コードブロック背景',
    blockquote: '引用テキスト',
    blockquoteBorder: '引用ボーダー',
    hr: '水平線',
    tableBorder: 'テーブルボーダー',
    tableHeaderBg: 'テーブルヘッダー背景',
    bold: '太字',
    italic: '斜体',
    listMarker: 'リストマーカー',
    highlight: 'ハイライト背景',
    tag: 'タグ',
    diffAddBg: '追加背景',
    diffAddText: '追加テキスト',
    diffRemoveBg: '削除背景',
    diffRemoveText: '削除テキスト',
  },

  // フラッシュカード
  flashcard: {
    decks: 'フラッシュカードデッキ',
    createCard: 'カード作成',
    startReview: '復習開始',
    cardsToReview: '{count} 枚のカードが復習待ち',
    noCards: 'フラッシュカードがありません',
    letAiGenerate: 'AI にノートからカードを生成させましょう',
    new: '新規',
    due: '復習待ち',
    learning: '学習中',
    collapseCards: 'カードを折りたたむ',
    expandCards: 'カードを展開',
    addCard: 'カード追加',
    deleteDeck: 'デッキを削除（全カードも削除されます）',
    deleteCard: 'このカードを削除',
    noCardsInDeck: 'カードがありません',
    confirmDeleteDeck: 'デッキ「{name}」とすべてのカードを削除しますか？',
    confirmDeleteCard: 'このカードを削除しますか？',
    cannotRecover: '削除後は復元できません。',
    deleting: '削除中...',
    reviewComplete: '復習完了！',
    reviewedCards: '{count} 枚のカードを復習しました',
    accuracy: '正解率 {percent}%',
    back: '戻る',
    clickOrSpaceToFlip: 'クリックまたはスペースで裏返す',
    forget: '忘れた',
    hard: '難しい',
    good: '良い',
    easy: '簡単',
    skip: 'スキップ',
    recallInOrder: '順番に思い出してください',
    listAllItems: 'すべての項目を挙げてください',
  },

  // テーマ名
  themes: {
    default: 'デフォルト',
    defaultDesc: '温かみのあるベージュ調',
    ocean: 'オーシャン',
    oceanDesc: '爽やかなブルー調',
    forest: 'フォレスト',
    forestDesc: 'ナチュラルなグリーン調',
    lavender: 'ラベンダー',
    lavenderDesc: 'エレガントなパープル調',
    rose: 'ローズ',
    roseDesc: '優しいピンク調',
    amber: 'アンバー',
    amberDesc: '活力あるオレンジイエロー調',
    mint: 'ミント',
    mintDesc: '爽やかなシアン調',
    indigo: 'インディゴ',
    indigoDesc: '深みのあるブルーパープル調',
    coffee: 'コーヒー',
    coffeeDesc: 'レトロなコーヒー調',
    nord: 'ノルド',
    nordDesc: 'クールなグレーブルー調',
    mono: 'モノ',
    monoDesc: 'ピュアなモノクロ',
    cyberpunk: 'サイバーパンク',
    cyberpunkDesc: 'ネオンカラー：パープルブラック背景 + 蛍光ピンク + シアンハイライト',
    dracula: 'ドラキュラ',
    draculaDesc: 'クラシック配色：クールグレー背景 + パープル + グリーン + オレンジミックス',
    solarized: 'ソラライズド',
    solarizedDesc: '目に優しい高コントラスト：ベージュ背景 + ブルー/オレンジ/レッド/グリーン',
    gruvbox: 'グルーヴボックス',
    gruvboxDesc: 'レトロウォーム：アースカラー背景 + レッド/グリーン/ブルー/イエロー',
  },

  // システムプロンプト
  prompts: {
    // チャットアシスタントプロンプト
    chat: {
      system: `あなたはインスピレーションとライティングアドバイザーです。
ユーザーの創造性を刺激し、執筆の視点、構成の提案、内容改善のアイデアを提供することが目標です。
ファイルを直接変更しないでください。代わりに、アイデア、アウトライン、または具体的な段落の提案を提供してください。`,
      contextFiles: 'コンテキストファイル：',
      emptyFile: '(空)',
    },
    
    // 編集アシスタントプロンプト
    edit: {
      system: `あなたはMarkdownノートの編集と改善を専門とするインテリジェントなノートアシスタントです。

あなたの能力：
1. ノート内容の理解と分析
2. ユーザーの要求に基づいたノートの変更
3. 数式表現の最適化
4. 記事構造と論理の改善

ユーザーがファイルの変更を要求した場合、以下の形式で出力してください：

<edit file="ファイルパス">
<description>変更の説明</description>
<original>
元の内容（現在のファイル内容と完全に一致する必要があります）
</original>
<modified>
変更後の内容
</modified>
</edit>

重要な注意事項：
- <original>の内容はファイルの【現在の実際の内容】である必要があります
- 以下に提供される最新のファイル内容を常に参照してください
- 会話履歴の以前の変更提案は無視してください
- 複数の変更がある場合は、複数の<edit>ブロックを使用してください`,
      currentFiles: '【現在のファイル内容】（これを参照）：',
      fileEnd: 'ファイル終了',
      contentNotLoaded: '(内容未読み込み)',
    },

    // インテントルータープロンプト
    router: {
      system: `あなたはインテント分類器です。ユーザーのリクエストを分析し、以下のインテントのいずれかに分類してください：

1. "chat": 雑談、簡単な質問、挨拶
2. "search": ノート内の情報検索、特定のトピックの検索
3. "create": 新しいノートの作成、記事の執筆、アウトラインの生成
4. "edit": 既存のテキスト/ノートの変更、書き直し、修正、フォーマット
5. "organize": ノートの整理、フォルダの作成、ファイルの移動、クリーンアップ
6. "flashcard": フラッシュカードの生成、復習用の知識ポイントの抽出
7. "complex": マルチステップタスク、コーディング、推論、深い分析が必要なリクエスト

JSONのみを出力：{"type": "<chat|search|create|edit|organize|flashcard|complex>", "confidence": 0.0-1.0, "reasoning": "簡単な説明"}`,
    },

    // クエリ書き換えプロンプト
    rewriter: {
      system: `あなたはクエリ書き換えアシスタントです。以下の目標でユーザー入力を保守的に書き換えてください：
1) インテント関連のすべてのキーワードとエンティティを保持
2) 意味のない雑談や挨拶を削除
3) 質問やリクエストを短いフレーズに簡略化（60文字以内）
4) 過去形を使用したり、アクションが完了したと主張しないでください
5) 出力はリクエスト/タスク形式である必要があります
6) 書き換えられた単一の文のみを出力してください`,
    },

    // エージェントプロンプト
    agent: {
      role: `あなたはLumina、プロフェッショナルなインテリジェントノートアシスタントです。`,
      expertise: `あなたの専門知識：
- ノート内容と構造の深い理解
- Markdownフォーマットとレイアウトの最適化
- ノート組織の整理と再構築
- ノート間の関連性の発見
- ノート内容のバッチ処理と移行`,
      
      toolUseIntro: `ユーザーのタスクを完了するためのツールセットを使用できます。**ノート内容、構造、またはファイル操作を含むタスクでは、会話で結果を提供するだけでなく、ツールを使用することを優先してください。**`,
      toolUsePrinciples: `一般原則：
- タスクがノートファイル、ディレクトリ構造、データベースに影響を与える可能性がある場合、または既存の内容を読み取る必要がある場合は、適切なツールを呼び出す必要があります。
- タスクが**明らかにノートシステムと無関係**で、ファイルの保存や読み取りが不要な場合のみ、attempt_completionを直接使用できます。`,
      
      toolFormat: `# ツール呼び出し形式

XMLタグ形式を使用してツールを呼び出します：

<tool_name>
<param1>value1</param1>
<param2>value2</param2>
</tool_name>`,

      toolRules: `# 重要なルール

1. **TOOLSセクションにリストされているツールのみを使用**
2. ツール名は完全に一致する必要があります
3. パラメータ値が配列またはオブジェクトの場合、JSON形式を使用
4. 各ツール呼び出し後、次のステップを決定する前に結果を待つ
5. タスク完了後はattempt_completionツールを使用する必要があります`,

      toolWarning: `# 重大な警告：ツール名は厳密に一致する必要があります

❌ 以下のツール名は**絶対に禁止**です：
- append_note → edit_noteを使用
- write_note → create_noteまたはedit_noteを使用
- read_file → read_noteを使用

⚠️ **フラッシュカード専用ルール**：
- フラッシュカード作成時にcreate_noteを使用しないでください
- create_flashcardツールを使用する必要があります`,

      protocolActions: `また、2種類の**プロトコルアクション**があります：
- ask_user：情報が不足している場合、ユーザーに質問または確認
- attempt_completion：タスクが完了したら、最終結果をラップ`,

      toolPriority: `# ツール使用優先度

1. **ノートやデータベースの読み書き/検索が必要 → ツールを使用**
2. **ノートに関連するクリエイティブタスク → ファイルへの書き込みを優先**
3. **一時的な会話のみ → attempt_completionのみ使用可能**
4. **不確かな場合 → まずread_note / list_notes / search_notesで探索**`,

      searchGuide: `# 検索ツール選択ガイド

**「ノートを検索して分析/要約」する場合、deep_searchを優先使用！**`,

      capabilities: `できること：
1. ノートライブラリ内の任意のMarkdownファイルを読み取り
2. 新しいノートファイルを作成
3. 既存のノートを編集
4. ディレクトリ構造とファイルを一覧表示
5. データベースのクエリと操作
6. フラッシュカードを生成
7. タスクを完了して要約を提供

できないこと：
1. ノートライブラリ外のファイルにアクセス
2. システムコマンドを実行
3. ネットワークリソースにアクセス
4. 非Markdownファイルを変更`,

      baseRules: `1. すべてのファイルパスはノートライブラリのルートからの相対パス
2. ファイル変更前にread_noteで現在の内容を確認
3. 不要な情報を求めない
4. 目標はタスクの完了
5. タスク完了後はattempt_completionを使用
6. 挨拶で始めない
7. 各ツール呼び出し後に結果確認を待つ
8. エラー時は他の方法を試す
9. 出力を簡潔に保つ`,

      editVsCreate: `# 編集 vs 作成

- **既存ファイルの変更**：edit_noteを使用
- **新規ファイルの作成**：create_noteを使用
- **禁止**：create_noteで既存ファイルを上書き`,

      flashcardRules: `# フラッシュカード生成ルール

1. **フラッシュカードツールを使用**
2. **ワークフロー**：generate_flashcards → create_flashcard → attempt_completion`,

      writerRules: `# ライターアシスタント特別ルール
- コンテンツ作成を要求された場合、create_noteを使用してファイルとして保存`,

      organizerRules: `# オーガナイザー特別ルール

1. まずlist_notesでディレクトリ構造を確認
2. 既存の構造を分析
3. ツールを使用して整理を実行
4. attempt_completionで結果を報告`,

      // コンテキストセクション
      context: {
        workspacePath: 'ノートライブラリパス',
        activeNote: '現在開いているノート',
        none: 'なし',
        fileTree: 'ノートディレクトリ構造',
        recentNotes: '最近編集したノート',
        ragResults: 'タスク関連のノート（関連度順）',
      },

      // 目標セクション
      objective: {
        identity: '現在のあなたの役割は',
        coreRole: 'あなたのコア責任',
        keyRule: '**キールール：すべての応答はattempt_completionで終了する必要があります**',
        toolTask: '**ツール操作タスク**（ノートの読み取り/編集/作成など）',
        toolTaskDesc: 'まず対応するツールで操作を完了し、最後にattempt_completionで結果を報告',
        qaTask: '**Q&A/会話タスク**（質問への回答、概念の説明、内容の分析など）',
        qaTaskDesc: 'attempt_completionを直接使用し、完全な返信内容を<result>タグ内に配置',
        waitForTask: 'それでは、ユーザーのタスク指示をお待ちください。',
      },

      // モード定義
      modes: {
        editor: {
          name: '📝 エディター',
          roleDefinition: 'あなたはプロのノート編集アシスタントです。Markdownフォーマットの最適化、記事構造の改善、エラーの修正、テキストの推敲が得意です。データベースレコードの管理やフラッシュカードの生成も可能です。',
        },
        organizer: {
          name: '📁 オーガナイザー',
          roleDefinition: 'あなたはノート整理の専門家です。ノート構造の分析、分類スキームの提案、バッチ再編成、ディレクトリ構成の最適化が得意です。データベースの管理も可能です。',
        },
        researcher: {
          name: '🔍 リサーチャー',
          roleDefinition: 'あなたはリサーチアシスタントです。ノートライブラリでの関連性の発見、知識の抽出、要約の生成、ノート内容に基づく質問への回答が得意です。検索機能を使って関連コンテンツを正確に見つけます。',
        },
        writer: {
          name: '✍️ ライター',
          roleDefinition: 'あなたはクリエイティブライティングアシスタントです。アイデアの拡張、草稿の改善、テキストの推敲、新しいコンテンツの生成をサポートします。長文コンテンツは会話で出力するよりも新しいノートファイルとして保存することを優先してください。',
        },
      },

      // メッセージパーサー
      messageParser: {
        contentTruncated: '... [コンテンツが切り詰められました、元の長さ {length} 文字]',
        noToolUsed: `応答に有効なツール呼び出しが含まれていません。

**重要**：すべての応答はツール形式を使用する必要があります。

1. **ノートを操作する場合**、対応するツールを使用：
<read_note>
<paths>["ノートパス.md"]</paths>
</read_note>

2. **質問に答える/会話する場合**、attempt_completionを直接使用：
<attempt_completion>
<result>ユーザーへの完全な返信内容...

複数の段落、リスト、コードなどを含めることができます...</result>
</attempt_completion>

上記の形式ですぐに応答してください。`,
      },
    },

    // ツール定義（日本語）
    tools: {
      read_note: {
        description: 'ノートファイルの内容を読み取る',
        params: { path: '読み取るノートのパス' },
        definition: `## read_note\n説明: ノートファイルの内容を読み取る。\nパラメータ:\n- path: (必須) ノートパス`,
      },
      edit_note: {
        description: 'ノートを検索/置換で編集',
        params: { path: '編集するノートのパス', edits: '編集操作の配列', new_name: '新しいファイル名（オプション）' },
        definition: `## edit_note\n説明: ノートを検索/置換で編集する。\nパラメータ:\n- path: (必須) ノートパス\n- edits: (必須) 編集操作`,
      },
      create_note: {
        description: '新しいノートファイルを作成',
        params: { path: 'ノートパス', content: 'ノート内容' },
        definition: `## create_note\n説明: 新しいノートファイルを作成。`,
      },
      list_notes: {
        description: 'ディレクトリ内のノートを一覧表示',
        params: { directory: 'ディレクトリパス', recursive: '再帰的に表示' },
        definition: `## list_notes\n説明: ディレクトリ内のノートを一覧表示。`,
      },
      create_folder: {
        description: '新しいディレクトリを作成',
        params: { path: 'ディレクトリパス' },
        definition: `## create_folder\n説明: 新しいディレクトリを作成。`,
      },
      move_file: {
        description: 'ファイルを新しい場所に移動',
        params: { from: '元のパス', to: '移動先パス' },
        definition: `## move_file\n説明: ファイルを新しい場所に移動。`,
      },
      rename_file: {
        description: 'ファイルまたはフォルダの名前を変更',
        params: { path: '元のパス', new_name: '新しい名前' },
        definition: `## rename_file\n説明: ファイルまたはフォルダの名前を変更。`,
      },
      delete_note: {
        description: 'ノートファイルを削除',
        params: { path: '削除するパス' },
        definition: `## delete_note\n説明: ノートファイルを永久に削除。警告：元に戻せません！`,
      },
      search_notes: {
        description: 'セマンティック検索',
        params: { query: '検索クエリ', directory: 'ディレクトリ', limit: '結果数' },
        definition: `## search_notes\n説明: セマンティック検索でノートを検索。`,
      },
      grep_search: {
        description: '全文検索（正規表現対応）',
        params: { query: '検索キーワード', directory: 'ディレクトリ', regex: '正規表現を有効', case_sensitive: '大文字小文字を区別', limit: '結果上限' },
        definition: `## grep_search\n説明: 全文検索（正規表現対応）。`,
      },
      semantic_search: {
        description: 'セマンティック検索',
        params: { query: '検索クエリ', directory: 'ディレクトリ', limit: '結果数', min_score: '最小類似度' },
        definition: `## semantic_search\n説明: AI埋め込みを使用したセマンティック検索。`,
      },
      deep_search: {
        description: 'ディープ検索：検索結果と内容を返す',
        params: { query: '検索キーワード', limit: '結果数', include_content: '内容を含む' },
        definition: `## deep_search\n説明: ディープ検索。`,
      },
      query_database: {
        description: 'データベース構造と行データをクエリ',
        params: { database_id: 'データベースID', filter_column: 'フィルター列', filter_value: 'フィルター値', limit: '行数上限' },
        definition: `## query_database\n説明: データベースの列構造と行データをクエリ。`,
      },
      add_database_row: {
        description: 'データベースに新しい行を追加',
        params: { database_id: 'データベースID', cells: 'セル値' },
        definition: `## add_database_row\n説明: データベースに新しい行を追加。`,
      },
      get_backlinks: {
        description: 'ノートへのバックリンクを取得',
        params: { note_name: 'ノート名', include_context: 'コンテキストを含む' },
        definition: `## get_backlinks\n説明: 指定ノートへのリンクを持つノートを取得。`,
      },
      generate_flashcards: {
        description: 'ノート内容からフラッシュカードを生成',
        params: { content: 'ソース内容', source_note: 'ソースノート', deck: 'デッキ名', types: 'カードタイプ', count: '数' },
        definition: `## generate_flashcards\n説明: ノート内容からフラッシュカードを生成。`,
      },
      create_flashcard: {
        description: 'フラッシュカードを1枚作成',
        params: { type: 'カードタイプ', deck: 'デッキ', front: '表面', back: '裏面', text: '穴埋めテキスト', question: '質問', options: '選択肢', answer: '答えのインデックス', items: 'リスト項目' },
        definition: `## create_flashcard\n説明: フラッシュカードを1枚作成。`,
      },
      attempt_completion: {
        description: 'タスク完了をマークし結果を提供',
        params: { result: 'タスク完了結果' },
        definition: `## attempt_completion\n説明: タスク完了時に呼び出す。`,
      },
      ask_user: {
        description: 'ユーザーに質問して返答を待つ',
        params: { question: '質問', options: '選択肢リスト' },
        definition: `## ask_user\n説明: ユーザーの確認や情報が必要な時に使用。`,
      },
      read_cached_output: {
        description: 'キャッシュされた長い出力を読み取る',
        params: { id: 'cache_id' },
        definition: `## read_cached_output\n説明: 以前にキャッシュされた長い出力を読み取る。`,
      },
    },

    // ツール実行結果メッセージ
    toolResults: {
      common: {
        success: '成功',
        failed: '失敗',
        fileNotFound: 'ファイルが見つかりません: {path}',
        pathRequired: 'pathパラメータが必要',
        invalidParams: '無効なパラメータ',
      },
      readNote: {
        success: '読み取り成功: {path}',
        lines: '{count}行',
      },
      editNote: {
        success: '編集成功: {path}',
        renamed: 'に名前変更: {newName}',
        searchNotFound: '置換対象が見つかりません',
        newNameInvalid: 'new_nameにパス区切り文字を含めることはできません',
        editsRequired: 'editsパラメータが必要',
      },
      createNote: {
        success: '作成成功: {path}',
        alreadyExists: 'ファイルが既に存在します。edit_noteを使用してください',
      },
      deleteNote: {
        success: '削除成功: {path}',
      },
      moveFile: {
        success: '移動成功: {from} → {to}',
        targetExists: '移動先ファイルが既に存在します',
      },
      renameFile: {
        success: '名前変更成功: {oldName} → {newName}',
        targetExists: '新しい名前が既に存在します',
      },
      createFolder: {
        success: 'ディレクトリ作成成功: {path}',
        alreadyExists: 'ディレクトリが既に存在します',
      },
      search: {
        found: '{count}件の結果が見つかりました',
        noResults: '関連コンテンツが見つかりません',
      },
      database: {
        rowAdded: 'レコード追加成功',
        columnNotFound: '列が見つかりません: {column}',
        invalidValue: '無効な値: {value}',
      },
      flashcard: {
        created: 'フラッシュカード作成成功',
        invalidType: '無効なカードタイプ',
      },
    },

    // AgentLoop ランタイムメッセージ
    agentLoop: {
      toolUseFailed: 'Agentがツールを正しく使用できませんでした',
      options: 'オプション',
      agentQuestion: 'Agentからの質問',
      noQuestionProvided: 'ask_userにquestionが提供されていません',
      userRejected: 'ユーザーがツール呼び出しを拒否しました: {toolName}。\n\n<thinking>タグを使用して、ユーザーが拒否した理由（危険な操作、不正なパラメータ、またはユーザーの意図と一致しない可能性）を分析し、他の方法を試すか、ユーザーに確認してください。',
      longOutputCached: '[長い出力がキャッシュされました ID: {cacheId}、これは要約です。推論を続ける前に、read_cached_output（または「詳細を見る {cacheId}」）を呼び出して全文を取得してください。read_noteや他の読み取りツールを再度呼び出さないでください。]',
      toolErrorReflection: '❌ システムが実行を拒否：ツール呼び出しエラーが検出されました。\n\n直ちに振り返ってください：\n1. ツール名は正しいですか？\n2. パラメータは有効なJSON形式ですか？\n3. パラメータ値は有効ですか？（特にファイルパスの特殊文字）\n\n次の応答で：\n1. <thinking>タグを使用してエラーを分析\n2. エラーを修正してツールを再呼び出し',
      summarySystem: 'あなたは要約アシスタントです。ツール出力を簡潔に要約し、重要なデータ/パス/エラーメッセージを保持してください。300文字以内で重要な情報を失わないようにしてください。',
      summaryUser: '{toolName}の出力を要約してください：',
      toolExecutionFailed: 'ツール実行失敗',
      unknownError: '不明なエラー',
      unknownFile: '不明なファイル',
      referencedNotesHint: 'ユーザーが明示的に参照したノート、必ず参考にしてください',
      relatedNotesHint: 'セマンティック検索で見つかった関連ノート、参考用',
      relevance: '関連度',
      systemError: '❌ システムエラー: {message}。\n\n<thinking>タグを使用してエラーを分析し、修正または代替案を試してください。',
    },

    // Function Calling Schema 説明
    fcSchemas: {
      read_note: { desc: 'ノートファイルの内容を読み取り、行番号付きで返す', params: { path: 'ノートパス、ボールトルートからの相対パス' } },
      edit_note: { desc: 'ノートの検索置換編集、オプションでファイル名変更', params: { path: '編集するノートパス', edits: '編集操作の配列、各操作に search と replace フィールド', new_name: '新しいファイル名（オプション）、パスなし、ファイル名のみ' } },
      create_note: { desc: '新しいノートファイルを作成', params: { path: 'ノートパス、ボールトルートからの相対パス', content: '完全なノート内容' } },
      list_notes: { desc: '指定ディレクトリ内のノートファイルとサブディレクトリを一覧', params: { directory: 'ディレクトリパス、ボールトルートからの相対パス、デフォルトはルート', recursive: 'サブディレクトリを再帰的に一覧するか、デフォルト true' } },
      create_folder: { desc: '新しいディレクトリを作成', params: { path: 'ディレクトリパス、ボールトルートからの相対パス' } },
      move_file: { desc: 'ファイルを新しい場所に移動', params: { from: 'ソースファイルパス', to: 'ターゲットファイルパス' } },
      rename_file: { desc: 'ファイルまたはフォルダの名前を変更', params: { path: '元のファイルパス', new_name: '新しい名前（パスなし）' } },
      delete_note: { desc: '指定したノートファイルを削除（ゴミ箱に移動）', params: { path: '削除するノートパス' } },
      search_notes: { desc: 'ボールトのセマンティック検索、内容の類似性に基づいて関連ノートを検索', params: { query: '自然言語での検索クエリ', directory: '検索範囲を制限するディレクトリ', limit: '結果数、デフォルト 10' } },
      grep_search: { desc: 'ボールトの全文検索、正規表現対応', params: { query: '検索キーワードまたは正規表現', directory: '検索範囲を制限するディレクトリ', regex: '正規表現モードを有効にするか', case_sensitive: '大文字小文字を区別するか', limit: '最大結果数' } },
      semantic_search: { desc: 'AI埋め込みを使用したセマンティック検索', params: { query: '自然言語クエリ', directory: '検索範囲を制限するディレクトリ', limit: '結果数', min_score: '最小類似度スコア (0-1)' } },
      deep_search: { desc: 'ディープ検索してノート内容を返す', params: { query: '検索キーワード', limit: '結果数', include_content: '内容を含めるか' } },
      query_database: { desc: 'データベース構造と行データをクエリ', params: { database_id: 'データベース ID', filter_column: 'フィルター列名', filter_value: 'フィルター値', limit: '最大行数' } },
      add_database_row: { desc: 'データベースに新しい行を追加', params: { database_id: 'データベース ID', cells: 'セル値、キーは列名' } },
      get_backlinks: { desc: '指定ノートにリンクしているすべてのノートを取得（バックリンク）', params: { note_name: 'ノート名（.md サフィックスなし）', include_context: 'リンクコンテキストを含めるか' } },
      generate_flashcards: { desc: 'ノート内容からフラッシュカードを生成（Q&A、穴埋め、MCQなど対応）', params: { content: 'フラッシュカード生成のソース内容', source_note: 'ソースノートパス（オプション）', deck: 'ターゲットデッキ名、デフォルト Default', types: '生成するカードタイプ：basic/cloze/basic-reversed/mcq/list', count: '生成数、デフォルト 5', language: '言語：zh/en' } },
      create_flashcard: { desc: 'フラッシュカードを1枚作成', params: { type: 'カードタイプ：basic/cloze/basic-reversed/mcq/list', deck: 'デッキ名', source: 'ソースノートリンク [[note]]', front: '質問/表（basic/basic-reversed）', back: '回答/裏（basic/basic-reversed）', text: '穴埋めテキスト、{{c1::答え}} 形式を使用（cloze）', question: '質問（mcq/list）', options: 'オプションリスト（mcq）', answer: '正解インデックス 0-based（mcq）', items: 'リスト項目（list）', ordered: '順序が必要か（list）', explanation: '説明（オプション）' } },
      read_cached_output: { desc: '以前にキャッシュされたツールの長い出力を読み取る', params: { id: 'cache_id（長い出力の要約ヒントから）' } },
    },
  },
};
