import React from 'react';
import { Link } from 'react-router-dom';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /**
   * When this value changes, the boundary will reset its error state.
   * Useful so navigating away from a failing route recovers automatically.
   */
  resetKey?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep this very lightweight and non-intrusive. We don't want secondary
    // failures from logging. The console helps during development.
    // eslint-disable-next-line no-console
    console.error('UI crashed:', error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      // Route changed; attempt to recover.
      // (If the new route also throws, getDerivedStateFromError will set it again.)
      this.setState({ error: null });
    }
  }

  private onReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error?.message || 'Unknown error';

    return (
      <section className="stack" aria-live="assertive" aria-label="Application error">
        <div className="card" role="alert">
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            The app hit an unexpected error on this screen.
          </p>
          <pre
            style={{
              marginTop: 12,
              whiteSpace: 'pre-wrap',
              background: 'rgba(0,0,0,0.25)',
              padding: 12,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              overflowX: 'auto'
            }}
          >
            {message}
          </pre>

          <div className="actions" style={{ marginTop: 14 }}>
            <Link to="/" className="btn btn-primary">
              Back to Home
            </Link>
            <button type="button" className="btn btn-secondary" onClick={this.onReload}>
              Reload
            </button>
          </div>
        </div>
      </section>
    );
  }
}
