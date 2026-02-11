'use client'

import { useState, useCallback, createContext, useContext, ReactNode } from 'react'
import { WindowState } from './types'
import {
  logInfo,
  logDebug,
  incrementCounter,
  recordDistribution,
  setGauge,
  buildWindowAttributes,
} from '@/lib/sentry-utils'

interface WindowManagerContextType {
  windows: WindowState[]
  openWindow: (window: Omit<WindowState, 'zIndex' | 'isFocused'>) => void
  closeWindow: (id: string) => void
  minimizeWindow: (id: string) => void
  maximizeWindow: (id: string) => void
  restoreWindow: (id: string) => void
  focusWindow: (id: string) => void
  updateWindowPosition: (id: string, x: number, y: number) => void
  updateWindowSize: (id: string, width: number, height: number) => void
  topZIndex: number
}

const WindowManagerContext = createContext<WindowManagerContextType | null>(null)

export function useWindowManager() {
  const context = useContext(WindowManagerContext)
  if (!context) {
    throw new Error('useWindowManager must be used within WindowManagerProvider')
  }
  return context
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([])
  const [topZIndex, setTopZIndex] = useState(100)

  const openWindow = useCallback((window: Omit<WindowState, 'zIndex' | 'isFocused'>) => {
    setTopZIndex(currentZ => {
      const newZ = currentZ + 1
      setWindows(prev => {
        const existing = prev.find(w => w.id === window.id)
        const isNewWindow = !existing

        if (existing) {
          if (existing.isMinimized) {
            logInfo('Window restored from minimized', buildWindowAttributes(
              window.id,
              window.id,
              {
                'window.title': window.title,
              }
            ))
            return prev.map(w =>
              w.id === window.id
                ? { ...w, isMinimized: false, isFocused: true, zIndex: newZ }
                : { ...w, isFocused: false }
            )
          }
          return prev.map(w =>
            w.id === window.id
              ? { ...w, isFocused: true, zIndex: newZ }
              : { ...w, isFocused: false }
          )
        }

        // Log new window opened
        logInfo('Window opened', buildWindowAttributes(
          window.id,
          window.id,
          {
            'window.title': window.title,
            'window.width': window.width,
            'window.height': window.height,
            'window.x': window.x,
            'window.y': window.y,
          }
        ))

        incrementCounter('desktop.window.opened', 1, { app: window.id })

        const newWindows = [
          ...prev.map(w => ({ ...w, isFocused: false })),
          { ...window, zIndex: newZ, isFocused: true }
        ]

        // Update active windows gauge
        setGauge('desktop.windows.active', newWindows.length)

        return newWindows
      })
      return newZ
    })
  }, [])

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        logInfo('Window closed', buildWindowAttributes(
          window.id,
          window.id,
          {
            'window.title': window.title,
          }
        ))

        incrementCounter('desktop.window.closed', 1, { app: window.id })
      }

      const newWindows = prev.filter(w => w.id !== id)

      // Update active windows gauge
      setGauge('desktop.windows.active', newWindows.length)

      return newWindows
    })
  }, [])

  const minimizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        logInfo('Window minimized', buildWindowAttributes(
          window.id,
          window.id,
          {
            'window.title': window.title,
          }
        ))

        incrementCounter('desktop.window.minimized', 1, { app: window.id })
      }

      return prev.map(w =>
        w.id === id ? { ...w, isMinimized: true, isFocused: false } : w
      )
    })
  }, [])

  const maximizeWindow = useCallback((id: string) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        const willBeMaximized = !window.isMaximized

        logInfo(willBeMaximized ? 'Window maximized' : 'Window unmaximized', buildWindowAttributes(
          window.id,
          window.id,
          {
            'window.title': window.title,
            'window.is_maximized': willBeMaximized,
          }
        ))

        if (willBeMaximized) {
          incrementCounter('desktop.window.maximized', 1, { app: window.id })
        }
      }

      return prev.map(w =>
        w.id === id ? { ...w, isMaximized: !w.isMaximized } : w
      )
    })
  }, [])

  const restoreWindow = useCallback((id: string) => {
    setTopZIndex(currentZ => {
      const newZ = currentZ + 1
      setWindows(prev => prev.map(w =>
        w.id === id
          ? { ...w, isMinimized: false, isFocused: true, zIndex: newZ }
          : { ...w, isFocused: false }
      ))
      return newZ
    })
  }, [])

  const focusWindow = useCallback((id: string) => {
    setTopZIndex(currentZ => {
      const newZ = currentZ + 1
      setWindows(prev => {
        const window = prev.find(w => w.id === id)
        if (window) {
          logDebug('Window focused', buildWindowAttributes(
            window.id,
            window.id,
            {
              'window.title': window.title,
            }
          ))

          incrementCounter('desktop.window.focused', 1, { app: window.id })
        }

        return prev.map(w =>
          w.id === id
            ? { ...w, isFocused: true, zIndex: newZ }
            : { ...w, isFocused: false }
        )
      })
      return newZ
    })
  }, [])

  const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        logDebug('Window position updated', buildWindowAttributes(
          window.id,
          window.id,
          {
            'window.x': x,
            'window.y': y,
          }
        ))
      }

      return prev.map(w =>
        w.id === id ? { ...w, x, y } : w
      )
    })
  }, [])

  const updateWindowSize = useCallback((id: string, width: number, height: number) => {
    setWindows(prev => {
      const window = prev.find(w => w.id === id)
      if (window) {
        logDebug('Window size updated', buildWindowAttributes(
          window.id,
          window.id,
          {
            'window.width': width,
            'window.height': height,
          }
        ))

        // Track window dimensions
        recordDistribution('desktop.window.width', width, { app: window.id }, 'pixel')
        recordDistribution('desktop.window.height', height, { app: window.id }, 'pixel')
      }

      return prev.map(w =>
        w.id === id ? { ...w, width, height } : w
      )
    })
  }, [])

  return (
    <WindowManagerContext.Provider value={{
      windows,
      openWindow,
      closeWindow,
      minimizeWindow,
      maximizeWindow,
      restoreWindow,
      focusWindow,
      updateWindowPosition,
      updateWindowSize,
      topZIndex
    }}>
      {children}
    </WindowManagerContext.Provider>
  )
}
