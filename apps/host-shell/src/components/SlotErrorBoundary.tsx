import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  slotId: string;
  moduleId?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class SlotErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[SlotErrorBoundary] Error in Slot '${this.props.slotId}' (Module: ${this.props.moduleId}):`,
      error,
      errorInfo
    );
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
          <div className="flex items-center space-x-2 font-bold mb-1">
            <span>⚠️ ไม่สามารถโหลดโมดูลส่วนขยาย ({this.props.moduleId || 'Unknown'})</span>
          </div>
          <p className="text-slate-600 mb-2">
            โมดูลเกิดข้อผิดพลาดในการแสดงผลบน Slot: <code>{this.props.slotId}</code>
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-2.5 py-1 bg-white border border-amber-300 rounded text-amber-900 hover:bg-amber-100 text-[11px] font-medium"
          >
            ลองโหลดใหม่อีกครั้ง
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
