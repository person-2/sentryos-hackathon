/**
 * Sentry Observability Utilities
 *
 * Centralized utilities for structured logging, custom metrics, and tracing
 * with Sentry SDK. Provides type-safe helpers and consistent usage patterns.
 */

import * as Sentry from '@sentry/nextjs';

// ============================================================================
// TYPES
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogAttributes {
  [key: string]: string | number | boolean | undefined | null;
}

export interface MetricTags {
  [key: string]: string;
}

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Log a debug message with structured attributes
 * Use for high-frequency events (window moves, focus changes)
 */
export function logDebug(message: string, attributes?: LogAttributes): void {
  Sentry.logger.debug(message, attributes);
}

/**
 * Log an info message with structured attributes
 * Use for important events (requests, completions, user actions)
 */
export function logInfo(message: string, attributes?: LogAttributes): void {
  Sentry.logger.info(message, attributes);
}

/**
 * Log a warning with structured attributes
 * Use for degraded states (validation failures, parse errors)
 */
export function logWarn(message: string, attributes?: LogAttributes): void {
  Sentry.logger.warn(message, attributes);
}

/**
 * Log an error with structured attributes
 * Use for actual errors with full context
 */
export function logError(message: string, attributes?: LogAttributes, error?: Error): void {
  Sentry.logger.error(message, attributes);

  // Also capture the exception if provided for better error tracking
  if (error) {
    Sentry.captureException(error, {
      extra: attributes,
    });
  }
}

// ============================================================================
// METRICS UTILITIES
// ============================================================================

/**
 * Increment a counter metric
 * Use for counting events (requests, errors, operations)
 */
export function incrementCounter(
  metricName: string,
  value: number = 1,
  tags?: MetricTags
): void {
  // Metrics API may not be available in all Sentry SDK versions
  // Use type assertion to access potentially undefined API
  const sentryMetrics = (Sentry as any).metrics;
  if (sentryMetrics && typeof sentryMetrics.increment === 'function') {
    sentryMetrics.increment(metricName, value, { tags });
  } else {
    // Log as a fallback if metrics API is not available
    logDebug(`Metric: ${metricName}`, {
      metric_type: 'counter',
      metric_value: value,
      ...tags,
    });
  }
}

/**
 * Record a distribution metric (for tracking values over time)
 * Use for measurements (durations, sizes, counts)
 */
export function recordDistribution(
  metricName: string,
  value: number,
  tags?: MetricTags,
  unit?: string
): void {
  // Metrics API may not be available in all Sentry SDK versions
  const sentryMetrics = (Sentry as any).metrics;
  if (sentryMetrics && typeof sentryMetrics.distribution === 'function') {
    sentryMetrics.distribution(metricName, value, {
      tags,
      unit: unit || 'none',
    });
  } else {
    // Log as a fallback if metrics API is not available
    logDebug(`Metric: ${metricName}`, {
      metric_type: 'distribution',
      metric_value: value,
      metric_unit: unit || 'none',
      ...tags,
    });
  }
}

/**
 * Set a gauge metric (for current state values)
 * Use for point-in-time measurements (active connections, queue size)
 */
export function setGauge(
  metricName: string,
  value: number,
  tags?: MetricTags,
  unit?: string
): void {
  // Metrics API may not be available in all Sentry SDK versions
  const sentryMetrics = (Sentry as any).metrics;
  if (sentryMetrics && typeof sentryMetrics.gauge === 'function') {
    sentryMetrics.gauge(metricName, value, {
      tags,
      unit: unit || 'none',
    });
  } else {
    // Log as a fallback if metrics API is not available
    logDebug(`Metric: ${metricName}`, {
      metric_type: 'gauge',
      metric_value: value,
      metric_unit: unit || 'none',
      ...tags,
    });
  }
}

// ============================================================================
// TRACING UTILITIES
// ============================================================================

/**
 * Start a custom span for performance tracing
 * Returns a span that must be finished when the operation completes
 *
 * @example
 * await startSpan('my.operation', { op: 'custom' }, async (span) => {
 *   // do work
 *   span.setAttribute('result', 'success');
 * });
 */
export function startSpan<T>(
  name: string,
  options: any,
  callback: (span: any) => T
): T {
  return Sentry.startSpan(
    {
      name,
      ...options,
    },
    callback
  );
}

// ============================================================================
// COMMON ATTRIBUTE BUILDERS
// ============================================================================

/**
 * Build request attributes for API routes
 */
export function buildRequestAttributes(
  requestId: string,
  method: string,
  path: string,
  additionalAttrs?: LogAttributes
): LogAttributes {
  return {
    'request.id': requestId,
    'request.method': method,
    'request.path': path,
    ...additionalAttrs,
  };
}

/**
 * Build chat message attributes
 */
export function buildChatAttributes(
  messageId: string,
  messageCount: number,
  additionalAttrs?: LogAttributes
): LogAttributes {
  return {
    'chat.message_id': messageId,
    'chat.message_count': messageCount,
    ...additionalAttrs,
  };
}

/**
 * Build tool execution attributes
 */
export function buildToolAttributes(
  toolName: string,
  toolInput?: unknown,
  additionalAttrs?: LogAttributes
): LogAttributes {
  return {
    'tool.name': toolName,
    'tool.input': toolInput ? JSON.stringify(toolInput).substring(0, 200) : undefined,
    ...additionalAttrs,
  };
}

/**
 * Build window attributes for desktop tracking
 */
export function buildWindowAttributes(
  windowId: string,
  appId: string,
  additionalAttrs?: LogAttributes
): LogAttributes {
  return {
    'window.id': windowId,
    'window.app_id': appId,
    ...additionalAttrs,
  };
}

/**
 * Build error attributes
 */
export function buildErrorAttributes(
  errorType: string,
  errorMessage: string,
  additionalAttrs?: LogAttributes
): LogAttributes {
  return {
    'error.type': errorType,
    'error.message': errorMessage,
    ...additionalAttrs,
  };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Set session attributes in Sentry isolation scope
 */
export function setSessionAttributes(sessionId: string, additionalAttrs?: Record<string, unknown>): void {
  Sentry.withIsolationScope((scope) => {
    scope.setTag('session.id', sessionId);
    if (additionalAttrs) {
      Object.entries(additionalAttrs).forEach(([key, value]) => {
        scope.setContext(key, value as any);
      });
    }
  });
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/**
 * Generate a unique request ID for correlation
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Measure execution time of a function
 */
export async function measureDuration<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const startTime = Date.now();
  const result = await fn();
  const durationMs = Date.now() - startTime;
  return { result, durationMs };
}

/**
 * Safely stringify JSON with error handling
 */
export function safeJsonStringify(value: unknown, maxLength: number = 1000): string {
  try {
    const str = JSON.stringify(value);
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  } catch (error) {
    return '[Unable to stringify]';
  }
}
