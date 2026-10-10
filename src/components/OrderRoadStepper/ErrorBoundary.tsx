import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback: ReactNode;
  onError?: (error: unknown, info?: ErrorInfo) => void;
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    try {
      this.props.onError?.(error, info);
    } catch {
      // never let a consumer callback break the boundary
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
