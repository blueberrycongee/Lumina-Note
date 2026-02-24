/**
 * WebDAV 服务层
 * 封装 Tauri 命令调用，提供类型安全的 API
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  WebDAVConfig,
  RemoteEntry,
  LocalFileInfo,
  SyncPlan,
  SyncResult,
} from './types';

export * from './types';

/**
 * WebDAV 服务类
 * 提供所有 WebDAV 操作的封装
 */
export class WebDAVService {
  private config: WebDAVConfig | null = null;

  /**
   * 设置配置
   */
  setConfig(config: WebDAVConfig): void {
    this.config = config;
  }

  /**
   * 获取当前配置
   */
  getConfig(): WebDAVConfig | null {
    return this.config;
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return this.config !== null && this.config.server_url.length > 0;
  }

  /**
   * 测试连接
   */
  async testConnection(config?: WebDAVConfig): Promise<boolean> {
    const cfg = config || this.config;
    if (!cfg) {
      throw new Error('WebDAV not configured');
    }
    return invoke<boolean>('webdav_test_connection', { config: cfg });
  }

  /**
   * 列出远程目录
   */
  async listRemote(path: string = ''): Promise<RemoteEntry[]> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<RemoteEntry[]>('webdav_list_remote', {
      config: this.config,
      path,
    });
  }

  /**
   * 列出所有远程文件（递归）
   */
  async listAllRemote(): Promise<RemoteEntry[]> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<RemoteEntry[]>('webdav_list_all_remote', {
      config: this.config,
    });
  }

  /**
   * 下载远程文件
   */
  async download(remotePath: string): Promise<string> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<string>('webdav_download', {
      config: this.config,
      remotePath,
    });
  }

  /**
   * 上传文件到远程
   */
  async upload(remotePath: string, content: string): Promise<void> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke('webdav_upload', {
      config: this.config,
      remotePath,
      content,
    });
  }

  /**
   * 在远程创建目录
   */
  async createDir(remotePath: string): Promise<void> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke('webdav_create_dir', {
      config: this.config,
      remotePath,
    });
  }

  /**
   * 删除远程文件/目录
   */
  async delete(remotePath: string): Promise<void> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke('webdav_delete', {
      config: this.config,
      remotePath,
    });
  }

  /**
   * 计算同步计划
   */
  async computeSyncPlan(vaultPath: string): Promise<SyncPlan> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<SyncPlan>('webdav_compute_sync_plan', {
      config: this.config,
      vaultPath,
    });
  }

  /**
   * 执行同步
   */
  async executeSync(vaultPath: string, plan: SyncPlan): Promise<SyncResult> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<SyncResult>('webdav_execute_sync', {
      config: this.config,
      vaultPath,
      plan,
    });
  }

  /**
   * 快速同步（跳过冲突）
   */
  async quickSync(vaultPath: string): Promise<SyncResult> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<SyncResult>('webdav_quick_sync', {
      config: this.config,
      vaultPath,
    });
  }

  /**
   * 扫描本地文件
   */
  async scanLocal(vaultPath: string): Promise<LocalFileInfo[]> {
    if (!this.config) {
      throw new Error('WebDAV not configured');
    }
    return invoke<LocalFileInfo[]>('webdav_scan_local', {
      config: this.config,
      vaultPath,
    });
  }
}

// 导出单例实例
export const webdavService = new WebDAVService();

// 便捷函数
export async function testWebDAVConnection(config: WebDAVConfig): Promise<boolean> {
  return invoke<boolean>('webdav_test_connection', { config });
}

export async function saveWebDAVConfig(config: WebDAVConfig): Promise<void> {
  return invoke('webdav_set_config', { config });
}

export async function loadWebDAVConfig(): Promise<WebDAVConfig | null> {
  return invoke<WebDAVConfig | null>('webdav_get_config', {});
}
