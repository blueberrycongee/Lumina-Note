/**
 * 可复用的超时检测 Hook
 * 
 * 用于检测某个操作是否超过指定时间阈值
 */

import { useState, useEffect, useCallback } from "react";

export interface UseTimeoutOptions {
    /** 超时阈值（毫秒），默认 2 分钟 */
    threshold?: number;
    /** 检查间隔（毫秒），默认 5 秒 */
    checkInterval?: number;
    /** 是否启用超时检测 */
    enabled?: boolean;
}

export interface UseTimeoutResult {
    /** 是否已超时 */
    isTimeout: boolean;
    /** 已经过的时间（毫秒） */
    elapsed: number;
    /** 重置计时器 */
    reset: () => void;
    /** 停止计时器 */
    stop: () => void;
}

const DEFAULT_THRESHOLD = 2 * 60 * 1000; // 2 分钟
const DEFAULT_CHECK_INTERVAL = 5 * 1000; // 5 秒

/**
 * 超时检测 Hook
 * 
 * @param startTime - 开始时间戳（毫秒），null 表示未开始
 * @param options - 配置选项
 * @returns 超时状态和控制方法
 * 
 * @example
 * ```ts
 * const { isTimeout, elapsed, reset } = useTimeout(taskStartTime, {
 *   threshold: 2 * 60 * 1000,
 *   enabled: isRunning,
 * });
 * 
 * if (isTimeout) {
 *   console.log(`操作超时，已耗时 ${elapsed}ms`);
 * }
 * ```
 */
export function useTimeout(
    startTime: number | null,
    options: UseTimeoutOptions = {}
): UseTimeoutResult {
    const {
        threshold = DEFAULT_THRESHOLD,
        checkInterval = DEFAULT_CHECK_INTERVAL,
        enabled = true,
    } = options;

    const [isTimeout, setIsTimeout] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // 重置计时器
    const reset = useCallback(() => {
        setIsTimeout(false);
        setElapsed(0);
    }, []);

    // 停止计时器
    const stop = useCallback(() => {
        setIsTimeout(false);
        setElapsed(0);
    }, []);

    useEffect(() => {
        if (!enabled || !startTime) {
            setIsTimeout(false);
            setElapsed(0);
            return;
        }

        const checkTimeout = () => {
            const now = Date.now();
            const elapsedTime = now - startTime;
            setElapsed(elapsedTime);
            setIsTimeout(elapsedTime > threshold);
        };

        // 立即检查一次
        checkTimeout();

        // 定时检查
        const timer = setInterval(checkTimeout, checkInterval);

        return () => clearInterval(timer);
    }, [enabled, startTime, threshold, checkInterval]);

    return {
        isTimeout,
        elapsed,
        reset,
        stop,
    };
}
