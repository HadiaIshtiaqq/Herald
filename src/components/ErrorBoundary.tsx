import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label ?? "unknown", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-red-50/40 dark:bg-red-950/20">
          <AlertTriangle className="w-10 h-10 text-red-400 mb-4" />
          <h2 className="text-base font-bold text-red-700 dark:text-red-300 mb-2">
            {this.props.label ?? "Component"} crashed
          </h2>
          <p className="text-xs text-red-600 dark:text-red-400 font-mono bg-red-100 dark:bg-red-950/40 px-3 py-2 rounded max-w-md break-all mb-6">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
