import React from 'react';

interface Props {
  children: React.ReactNode;
  onReturnHome: () => void;
}
interface State { failed: boolean; }

// Keep a faulty notification list from taking down the player, menu or entire app.
export class NotificationErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Notification screen isolated error:', error, info.componentStack);
  }

  private retry = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="mx-auto max-w-xl p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-center space-y-3">
        <h2 className="font-bold text-slate-900 dark:text-slate-100">通知頁暫時無法開啟</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">其他功能沒有受到影響，你可以重新開啟通知或先回首頁。</p>
        <div className="flex gap-2 justify-center">
          <button type="button" onClick={this.retry} className="rounded-xl px-4 py-2 text-sm font-bold border border-slate-300 dark:border-slate-600">重新開啟通知</button>
          <button type="button" onClick={this.props.onReturnHome} className="rounded-xl px-4 py-2 text-sm font-bold bg-slate-800 text-white">返回首頁</button>
        </div>
      </section>
    );
  }
}
