'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { logError, incrementCounter, buildErrorAttributes } from '@/lib/sentry-utils'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches React component errors
 * and reports them to Sentry with full context
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to Sentry with component stack
    logError('React component error caught by boundary', buildErrorAttributes(
      error.name || 'ComponentError',
      error.message,
      {
        'error.stack': error.stack?.substring(0, 1000),
        'error.component_stack': errorInfo.componentStack?.substring(0, 1000),
      }
    ), error)

    // Increment error boundary metric
    incrementCounter('app.errors.boundary', 1, {
      error_name: error.name || 'unknown',
    })

    // Also capture to Sentry directly with error info
    Sentry.captureException(error, {
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f0c14] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#1e1a2a] border border-[#362552] rounded-lg p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-[#e8e4f0]">
                  Oops! Something went wrong
                </h1>
                <p className="text-sm text-[#9086a3]">
                  An unexpected error occurred
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-4 p-3 bg-[#0f0c14] rounded border border-[#362552]">
                <p className="text-xs font-mono text-red-400 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm text-[#c4b5fd]">
                This error has been automatically reported to our monitoring system.
              </p>
              <button
                onClick={this.handleReload}
                className="w-full px-4 py-2 bg-[#7553ff] hover:bg-[#8c6fff] text-white rounded transition-colors font-medium"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
