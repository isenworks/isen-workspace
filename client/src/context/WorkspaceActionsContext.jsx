import { createContext, useContext } from 'react';

// 工作台跨组件动作注入层：替代原先挂在 window.__* 上的全局函数
// 由 Workspace 顶层 Provider 注入，子组件（KeyTasks / HabitsPanel / Timeline 等）
// 通过 useWorkspaceActions() 取用，避免全局可变状态与隐式耦合。
const WorkspaceActionsContext = createContext({});

export function WorkspaceActionsProvider({ value, children }) {
  return (
    <WorkspaceActionsContext.Provider value={value}>
      {children}
    </WorkspaceActionsContext.Provider>
  );
}

// 未注入 Provider 时返回空对象：字段为 undefined，调用方保持原有 falsy 兜底语义
export function useWorkspaceActions() {
  return useContext(WorkspaceActionsContext);
}
