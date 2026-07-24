import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  chunkError: boolean
}

/**
 * Top-level error boundary. Catches chunk-load failures (common after
 * deployments when the browser caches a stale index.html) and offers
 * a single automatic retry via hard reload.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, chunkError: false }

  static getDerivedStateFromError(error: Error): State {
    const isChunk =
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Loading CSS chunk') ||
      error.name === 'ChunkLoadError'

    return { hasError: true, chunkError: isChunk }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleClearAndReload = () => {
    try {
      localStorage.removeItem('platform-auth')
      localStorage.removeItem('platform-app')
    } catch {
      // ignore
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-lowest">
        <div className="max-w-md rounded-xl border border-outline-variant bg-surface-low p-8 text-center">
          <h2 className="mb-2 font-display text-xl font-semibold text-on-surface">
            {this.state.chunkError
              ? 'Update available'
              : 'Something went wrong'}
          </h2>
          <p className="mb-6 font-body text-sm text-on-surface-variant">
            {this.state.chunkError
              ? 'A new version of the app is available. Reload to get the latest.'
              : 'An unexpected error occurred. Try reloading the page.'}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={this.handleReload}
              className="rounded-lg bg-primary px-4 py-2 font-body text-sm font-medium text-on-primary transition-colors hover:bg-primary/90"
            >
              Reload
            </button>
            {!this.state.chunkError && (
              <button
                onClick={this.handleClearAndReload}
                className="rounded-lg border border-outline-variant px-4 py-2 font-body text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface"
              >
                Clear session &amp; reload
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
