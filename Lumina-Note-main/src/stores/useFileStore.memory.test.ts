/**
 * useFileStore 内存分析测试
 * 
 * 这些测试用于分析白屏 bug 的根因：
 * 1. undoStack 存储完整文件内容且无大小限制
 * 2. Tab 切换时的内存开销
 * 3. 多 Tab 场景下的内存增长
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock lib/tauri
vi.mock('@/lib/tauri', () => ({
    listDirectory: vi.fn(() => Promise.resolve([])),
    readFile: vi.fn((path: string) => Promise.resolve(`# ${path}\n\nMock content for ${path}`)),
    saveFile: vi.fn(() => Promise.resolve()),
    createFile: vi.fn(() => Promise.resolve()),
    createDir: vi.fn(() => Promise.resolve()),
}));

import { useFileStore } from './useFileStore';

// 生成指定大小的模拟内容
function generateContent(sizeKB: number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789 \n';
    let content = '# Test File\n\n';
    while (content.length < sizeKB * 1024) {
        content += chars[Math.floor(Math.random() * chars.length)];
    }
    return content;
}

// 估算对象内存大小（简化版）
function estimateMemorySize(obj: unknown): number {
    const str = JSON.stringify(obj);
    return str.length * 2; // UTF-16 编码，每个字符 2 字节
}

describe('useFileStore - 内存分析测试', () => {
    beforeEach(() => {
        // 重置 store 到初始状态
        useFileStore.setState({
            vaultPath: '/mock/vault',
            fileTree: [],
            tabs: [],
            activeTabIndex: -1,
            currentFile: null,
            currentContent: '',
            isDirty: false,
            isLoadingTree: false,
            isLoadingFile: false,
            isSaving: false,
            undoStack: [],
            redoStack: [],
            lastSavedContent: '',
            navigationHistory: [],
            navigationIndex: -1,
            recentFiles: [],
        });
        vi.clearAllMocks();
    });

    describe('undoStack 内存增长分析', () => {
        it('应该记录每次编辑后的 undoStack 大小', () => {
            const store = useFileStore.getState();
            const initialContent = generateContent(10); // 10KB 文件

            // 模拟打开文件
            useFileStore.setState({
                currentContent: initialContent,
                lastSavedContent: initialContent,
            });

            const memorySizes: number[] = [];
            const editCount = 50;

            // 模拟 50 次编辑
            for (let i = 0; i < editCount; i++) {
                const newContent = initialContent + `\n\nEdit ${i + 1}`;
                store.updateContent(newContent, 'user');

                const state = useFileStore.getState();
                const undoStackSize = estimateMemorySize(state.undoStack);
                memorySizes.push(undoStackSize);
            }

            // 分析结果
            const initialSize = memorySizes[0];
            const finalSize = memorySizes[memorySizes.length - 1];
            const growthFactor = finalSize / initialSize;

            console.log('\n=== undoStack 内存增长分析 ===');
            console.log(`文件大小: 10KB`);
            console.log(`编辑次数: ${editCount}`);
            console.log(`初始 undoStack 大小: ${(initialSize / 1024).toFixed(2)} KB`);
            console.log(`最终 undoStack 大小: ${(finalSize / 1024).toFixed(2)} KB`);
            console.log(`增长倍数: ${growthFactor.toFixed(2)}x`);
            console.log(`undoStack 条目数: ${useFileStore.getState().undoStack.length}`);

            // 验证：undoStack 数量应该接近编辑次数（考虑 debounce）
            expect(useFileStore.getState().undoStack.length).toBeGreaterThan(0);

            // 警告：如果增长过快
            if (growthFactor > 10) {
                console.warn('⚠️ undoStack 内存增长过快！可能导致内存问题');
            }
        });

        it('应该显示 undoStack 无大小限制的问题', () => {
            const store = useFileStore.getState();
            const content = generateContent(5); // 5KB 文件

            useFileStore.setState({
                currentContent: content,
                lastSavedContent: content,
            });

            // 模拟大量编辑
            const editCount = 100;
            for (let i = 0; i < editCount; i++) {
                // 添加延迟模拟，让 debounce 生效（通过更改 timestamp）
                vi.setSystemTime(Date.now() + i * 2000); // 每次编辑间隔 2 秒
                store.updateContent(content + `\nEdit ${i}`, 'user');
            }

            const state = useFileStore.getState();

            console.log('\n=== undoStack 无限增长问题 ===');
            console.log(`undoStack 条目数: ${state.undoStack.length}`);
            console.log(`理论最大内存: ${(state.undoStack.length * 5).toFixed(0)} KB`);

            // 修复后：undoStack 应该被限制在 50 条以内
            expect(state.undoStack.length).toBeLessThanOrEqual(50);
        });
    });

    describe('多 Tab 内存增长分析', () => {
        it('应该分析多个 Tab 的总内存占用', async () => {
            const tabCount = 7; // 用户报告 5-7 个文件就会白屏
            const fileSize = 10; // KB

            const tabMemorySizes: number[] = [];

            for (let i = 0; i < tabCount; i++) {
                const content = generateContent(fileSize);
                const tab = {
                    id: `tab-${i}`,
                    type: 'file' as const,
                    path: `/mock/file${i}.md`,
                    name: `file${i}`,
                    content,
                    isDirty: false,
                    undoStack: [],
                    redoStack: [],
                };

                // 模拟每个 Tab 有一些撤销历史
                const undoHistory: Array<{ content: string; type: 'user' | 'ai'; timestamp: number }> = [];
                for (let j = 0; j < 20; j++) {
                    undoHistory.push({
                        content: content + `\nEdit ${j}`,
                        type: 'user',
                        timestamp: Date.now(),
                    });
                }
                tab.undoStack = undoHistory as typeof tab.undoStack;

                const tabs = [...useFileStore.getState().tabs, tab];
                useFileStore.setState({ tabs });

                const totalMemory = estimateMemorySize(tabs);
                tabMemorySizes.push(totalMemory);
            }

            console.log('\n=== 多 Tab 内存分析 ===');
            console.log(`Tab 数量: ${tabCount}`);
            console.log(`每个文件大小: ${fileSize} KB`);
            console.log(`每个 Tab 撤销历史: 20 条`);
            tabMemorySizes.forEach((size, i) => {
                console.log(`${i + 1} 个 Tab: ${(size / 1024 / 1024).toFixed(2)} MB`);
            });
            console.log(`最终内存: ${(tabMemorySizes[tabMemorySizes.length - 1] / 1024 / 1024).toFixed(2)} MB`);

            // 估算每个 Tab 的内存
            // 内容: 10KB + 20 * 10KB (undoStack) = 210KB
            // 7 个 Tab: ~1.5MB
            const finalMemory = tabMemorySizes[tabMemorySizes.length - 1];
            console.log(`\n预估: 7 个 10KB 文件，每个 20 次编辑 -> ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
        });
    });

    describe('Tab 切换内存影响', () => {
        it('应该分析 Tab 切换时的对象创建', () => {
            // 创建两个 Tab
            const content1 = generateContent(5);
            const content2 = generateContent(5);

            useFileStore.setState({
                tabs: [
                    {
                        id: 'tab-1',
                        type: 'file',
                        path: '/file1.md',
                        name: 'file1',
                        content: content1,
                        isDirty: false,
                        undoStack: [],
                        redoStack: [],
                    },
                    {
                        id: 'tab-2',
                        type: 'file',
                        path: '/file2.md',
                        name: 'file2',
                        content: content2,
                        isDirty: false,
                        undoStack: [],
                        redoStack: [],
                    },
                ],
                activeTabIndex: 0,
                currentFile: '/file1.md',
                currentContent: content1,
            });

            const store = useFileStore.getState();
            const initialTabs = store.tabs;

            // 切换 Tab
            store.switchTab(1);

            const afterSwitchTabs = useFileStore.getState().tabs;

            // 分析：switchTab 是否创建了新的 tabs 数组
            const isNewArray = initialTabs !== afterSwitchTabs;

            console.log('\n=== Tab 切换分析 ===');
            console.log(`切换后是否创建新数组: ${isNewArray}`);
            console.log(`这意味着每次切换都会触发所有订阅组件重新渲染`);

            // 这是预期行为，但在频繁切换时可能导致性能问题
            expect(isNewArray).toBe(true);
        });
    });

    describe('修复建议验证', () => {
        it('建议: 限制 undoStack 大小为 50', () => {
            const MAX_UNDO_HISTORY = 50;
            const store = useFileStore.getState();
            const content = generateContent(5);

            useFileStore.setState({
                currentContent: content,
                lastSavedContent: content,
            });

            // 模拟 100 次编辑
            for (let i = 0; i < 100; i++) {
                vi.setSystemTime(Date.now() + i * 2000);
                store.updateContent(content + `\nEdit ${i}`, 'user');
            }

            const state = useFileStore.getState();

            console.log('\n=== 修复建议验证 ===');
            console.log(`当前 undoStack 大小: ${state.undoStack.length}`);
            console.log(`建议最大值: ${MAX_UNDO_HISTORY}`);

            if (state.undoStack.length > MAX_UNDO_HISTORY) {
                console.log('❌ 当前实现没有限制大小');
                console.log('建议修复: 在 updateContent 中添加 undoStack.length > 50 时移除最旧记录');
            } else {
                console.log('✅ 已实现大小限制');
            }
        });
    });
});
