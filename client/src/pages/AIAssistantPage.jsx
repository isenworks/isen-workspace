import { useState } from 'react';
import AIChat from '../components/AIChat.jsx';
import AIConfigModal from '../components/AIConfigModal.jsx';

/* AI 助手主页面：glass-card 容器内单栏居中对话（风格对齐工作台） */
export default function AIAssistantPage() {
  const [mode, setMode] = useState('general');
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="glass-card rounded-2xl flex-1 min-h-0 flex flex-col px-5 pt-4 pb-4 mx-auto w-full max-w-[760px]">
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
