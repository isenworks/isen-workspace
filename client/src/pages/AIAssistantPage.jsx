import { useState } from 'react';
import AIChat from '../components/AIChat.jsx';
import AIConfigModal from '../components/AIConfigModal.jsx';

/* AI 助手主页面：单栏居中对话，无场景栏
   仅 AIChat 组件 + 模型配置弹窗 */
export default function AIAssistantPage() {
  const [mode, setMode] = useState('general');
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div style={{
      height: '100%', display: 'flex', justifyContent: 'center',
      padding: '0 12px',
    }}>
      <div style={{
        width: '100%', maxWidth: '680px',
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <AIChat
          mode={mode}
          onModeChange={setMode}
          onConfigClick={() => setConfigOpen(true)}
          storageKey="ai_messages_main"
        />
      </div>
      <AIConfigModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
