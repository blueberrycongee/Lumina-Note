import { useState } from 'react';
import { ChevronRight, Bot, Palette, Info } from 'lucide-react';
import { useAIStore } from '@/stores/useAIStore';
import { useUIStore } from '@/stores/useUIStore';

type SettingsSection = 'main' | 'ai' | 'appearance';

export function MobileSettings() {
  const [section, setSection] = useState<SettingsSection>('main');
  const { config, setConfig } = useAIStore();
  const { isDarkMode, toggleTheme } = useUIStore();
  
  // 主设置页
  if (section === 'main') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4">设置</h2>
          
          <div className="space-y-2">
            <SettingsItem
              icon={<Bot className="w-5 h-5" />}
              title="AI 设置"
              subtitle="配置 API Key 和模型"
              onClick={() => setSection('ai')}
            />
            <SettingsItem
              icon={<Palette className="w-5 h-5" />}
              title="外观"
              subtitle="主题和显示设置"
              onClick={() => setSection('appearance')}
            />
            <SettingsItem
              icon={<Info className="w-5 h-5" />}
              title="关于"
              subtitle="Lumina Note v0.1.0"
            />
          </div>
        </div>
      </div>
    );
  }
  
  // AI 设置
  if (section === 'ai') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4">
          <button
            onClick={() => setSection('main')}
            className="flex items-center gap-2 text-primary mb-4"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            <span>返回</span>
          </button>
          
          <h2 className="text-lg font-semibold mb-4">AI 设置</h2>
          
          <div className="space-y-4">
            {/* Provider */}
            <div>
              <label className="block text-sm font-medium mb-2">服务提供商</label>
              <select
                value={config.provider}
                onChange={(e) => setConfig({ provider: e.target.value as any })}
                className="w-full px-4 py-3 bg-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="deepseek">DeepSeek</option>
                <option value="moonshot">Moonshot</option>
                <option value="ollama">Ollama (本地)</option>
              </select>
            </div>
            
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium mb-2">API Key</label>
              <input
                type="password"
                value={config.apiKey || ''}
                onChange={(e) => setConfig({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-4 py-3 bg-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            
            {/* Model */}
            <div>
              <label className="block text-sm font-medium mb-2">模型</label>
              <input
                type="text"
                value={config.model || ''}
                onChange={(e) => setConfig({ model: e.target.value })}
                placeholder="gpt-4o"
                className="w-full px-4 py-3 bg-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            
            {/* Base URL */}
            <div>
              <label className="block text-sm font-medium mb-2">Base URL (可选)</label>
              <input
                type="text"
                value={config.baseUrl || ''}
                onChange={(e) => setConfig({ baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="w-full px-4 py-3 bg-muted rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // 外观设置
  if (section === 'appearance') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4">
          <button
            onClick={() => setSection('main')}
            className="flex items-center gap-2 text-primary mb-4"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            <span>返回</span>
          </button>
          
          <h2 className="text-lg font-semibold mb-4">外观</h2>
          
          <div className="space-y-4">
            {/* Theme */}
            <div>
              <label className="block text-sm font-medium mb-3">主题</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => !isDarkMode && toggleTheme()}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    !isDarkMode
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-accent'
                  }`}
                >
                  浅色
                </button>
                <button
                  onClick={() => isDarkMode && toggleTheme()}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-accent'
                  }`}
                >
                  深色
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

interface SettingsItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
}

function SettingsItem({ icon, title, subtitle, onClick }: SettingsItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
    >
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 text-left">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {onClick && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
    </button>
  );
}
