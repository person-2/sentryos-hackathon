import { useState, useEffect, useRef, useCallback } from 'react'

interface UseVoiceInputOptions {
  onTranscript?: (transcript: string) => void
  onError?: (error: string) => void
  continuous?: boolean
  language?: string
}

interface UseVoiceInputReturn {
  isListening: boolean
  transcript: string
  startListening: () => void
  stopListening: () => void
  isSupported: boolean
  error: string | null
}

export function useVoiceInput({
  onTranscript,
  onError,
  continuous = false,
  language = 'en-US'
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const onErrorRef = useRef(onError)

  // Keep callback refs current without triggering effect re-runs
  useEffect(() => { onTranscriptRef.current = onTranscript }, [onTranscript])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  // Initialise SpeechRecognition once
  useEffect(() => {
    if (typeof window === 'undefined') return

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition
    setIsSupported(!!SpeechRecognition)
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += t + ' '
        } else {
          interimTranscript += t
        }
      }

      const fullTranscript = (finalTranscript || interimTranscript).trim()
      setTranscript(fullTranscript)

      if (finalTranscript) {
        onTranscriptRef.current?.(fullTranscript.trim())
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage: string
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.'
          break
        case 'audio-capture':
          errorMessage = 'Microphone not found or not accessible.'
          break
        case 'not-allowed':
          errorMessage = 'Microphone permission denied.'
          break
        case 'network':
          errorMessage = 'Network error occurred.'
          break
        default:
          errorMessage = `Speech recognition error: ${event.error}`
      }
      setError(errorMessage)
      setIsListening(false)
      onErrorRef.current?.(errorMessage)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
      recognitionRef.current = null
    }
  }, [continuous, language])

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return
    setTranscript('')
    setError(null)
    try {
      recognitionRef.current.start()
    } catch {
      setError('Failed to start voice recognition')
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }, [isListening])

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
    error
  }
}
