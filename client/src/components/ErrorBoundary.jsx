import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-accent-red/5">
          <div className="card p-6 max-w-lg w-full">
            <div className="text-2xl mb-2">⚠️ 渲染出错</div>
            <div className="text-sm text-ink-700 mb-3">
              前端组件运行时抛出错误，请把下方信息发给开发者：
            </div>
            <pre className="bg-accent-red/5 border border-accent-red/15 text-accent-red text-xs p-3 rounded-lg whitespace-pre-wrap break-all max-h-[40vh] overflow-auto">
{String(this.state.error?.message || this.state.error)}

{"\n"}
Component stack: {this.state.info?.componentStack || '(none)'}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-ghost"
                onClick={() => {
                  localStorage.removeItem('pw_user');
                  location.reload();
                }}
              >清除登录并刷新</button>
              <button className="btn-primary" onClick={() => location.reload()}>刷新页面</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
