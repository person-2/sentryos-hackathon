import { query } from '@anthropic-ai/claude-agent-sdk'
import * as Sentry from '@sentry/nextjs'
import {
  logInfo,
  logWarn,
  logError,
  incrementCounter,
  recordDistribution,
  startSpan,
  buildRequestAttributes,
  buildChatAttributes,
  buildToolAttributes,
  buildErrorAttributes,
  generateRequestId,
} from '@/lib/sentry-utils'

const SYSTEM_PROMPT = `You are a helpful personal assistant designed to help with general research, questions, and tasks.

Your role is to:
- Answer questions on any topic accurately and thoroughly
- Help with research by searching the web for current information
- Assist with writing, editing, and brainstorming
- Provide explanations and summaries of complex topics
- Help solve problems and think through decisions

Guidelines:
- Be friendly, clear, and conversational
- Use web search when you need current information, facts you're unsure about, or real-time data
- Keep responses concise but complete - expand when the topic warrants depth
- Use markdown formatting when it helps readability (bullet points, code blocks, etc.)
- Be honest when you don't know something and offer to search for answers`

interface MessageInput {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  const requestId = generateRequestId()
  const requestStartTime = Date.now()

  try {
    const { messages } = await request.json() as { messages: MessageInput[] }

    // Log incoming request
    logInfo('Chat request received', buildRequestAttributes(
      requestId,
      'POST',
      '/api/chat',
      {
        'chat.messages_count': messages?.length || 0,
      }
    ))

    // Increment total requests counter
    incrementCounter('chat.requests.total')

    if (!messages || !Array.isArray(messages)) {
      logWarn('Invalid request: messages array missing', buildRequestAttributes(
        requestId,
        'POST',
        '/api/chat',
        { 'validation.error': 'missing_messages_array' }
      ))
      incrementCounter('chat.requests.invalid', 1, { reason: 'missing_messages' })

      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Track message count and length metrics
    incrementCounter('chat.messages.count', messages.length)
    const totalMessageLength = messages.reduce((sum, m) => sum + m.content.length, 0)
    recordDistribution('chat.message.length', totalMessageLength, {}, 'character')

    // Get the last user message
    const lastUserMessage = messages.filter(m => m.role === 'user').pop()
    if (!lastUserMessage) {
      logWarn('Invalid request: no user message found', buildRequestAttributes(
        requestId,
        'POST',
        '/api/chat',
        { 'validation.error': 'no_user_message' }
      ))
      incrementCounter('chat.requests.invalid', 1, { reason: 'no_user_message' })

      return new Response(
        JSON.stringify({ error: 'No user message found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build conversation context
    const conversationContext = messages
      .slice(0, -1) // Exclude the last message since we pass it as the prompt
      .map((m: MessageInput) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const fullPrompt = conversationContext
      ? `${SYSTEM_PROMPT}\n\nPrevious conversation:\n${conversationContext}\n\nUser: ${lastUserMessage.content}`
      : `${SYSTEM_PROMPT}\n\nUser: ${lastUserMessage.content}`

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Wrap the entire streaming operation in a Sentry span
        await startSpan(
          'chat.stream',
          {
            op: 'ai.chat.stream',
            attributes: {
              'request.id': requestId,
              'chat.message_count': messages.length,
            },
          },
          async (span) => {
            try {
              const streamStartTime = Date.now()
              let textDeltaCount = 0
              let toolExecutionCount = 0
              const toolsUsed = new Set<string>()

              logInfo('Claude query starting', buildChatAttributes(
                requestId,
                messages.length,
                {
                  'chat.prompt_length': fullPrompt.length,
                }
              ))

              // Use the claude-agent-sdk query function with all default tools enabled
              for await (const message of query({
                prompt: fullPrompt,
                options: {
                  maxTurns: 10,
                  // Use the preset to enable all Claude Code tools including WebSearch
                  tools: { type: 'preset', preset: 'claude_code' },
                  // Bypass all permission checks for automated tool execution
                  permissionMode: 'bypassPermissions',
                  allowDangerouslySkipPermissions: true,
                  // Enable partial messages for real-time text streaming
                  includePartialMessages: true,
                  // Set working directory to the app's directory for sandboxing
                  cwd: process.cwd(),
                }
              })) {
                // Handle streaming text deltas (partial messages)
                if (message.type === 'stream_event' && 'event' in message) {
                  const event = message.event
                  // Handle content block delta events for text streaming
                  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    textDeltaCount++
                    controller.enqueue(encoder.encode(
                      `data: ${JSON.stringify({ type: 'text_delta', text: event.delta.text })}\n\n`
                    ))
                  }
                }

                // Send tool start events from assistant messages
                if (message.type === 'assistant' && 'message' in message) {
                  const content = message.message?.content
                  if (Array.isArray(content)) {
                    for (const block of content) {
                      if (block.type === 'tool_use') {
                        toolExecutionCount++
                        toolsUsed.add(block.name)

                        logInfo('Tool execution started', buildToolAttributes(
                          block.name,
                          block.input,
                          {
                            'request.id': requestId,
                            'tool.id': block.id,
                          }
                        ))

                        incrementCounter('chat.tool.executions', 1, { tool: block.name })

                        controller.enqueue(encoder.encode(
                          `data: ${JSON.stringify({ type: 'tool_start', tool: block.name })}\n\n`
                        ))
                      }
                    }
                  }
                }

                // Send tool progress updates
                if (message.type === 'tool_progress') {
                  logInfo('Tool progress update', buildToolAttributes(
                    message.tool_name,
                    undefined,
                    {
                      'request.id': requestId,
                      'tool.elapsed_seconds': message.elapsed_time_seconds,
                    }
                  ))

                  recordDistribution('chat.tool.duration', message.elapsed_time_seconds, {
                    tool: message.tool_name,
                  }, 'second')

                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'tool_progress', tool: message.tool_name, elapsed: message.elapsed_time_seconds })}\n\n`
                  ))
                }

                // Signal completion
                if (message.type === 'result' && message.subtype === 'success') {
                  const streamDuration = (Date.now() - streamStartTime) / 1000

                  logInfo('Claude query completed successfully', buildChatAttributes(
                    requestId,
                    messages.length,
                    {
                      'stream.duration_seconds': streamDuration,
                      'stream.text_delta_count': textDeltaCount,
                      'stream.tool_execution_count': toolExecutionCount,
                      'stream.tools_used': Array.from(toolsUsed).join(','),
                    }
                  ))

                  // Record stream metrics
                  recordDistribution('chat.stream.duration', streamDuration, {}, 'second')
                  recordDistribution('chat.stream.text_deltas', textDeltaCount)
                  recordDistribution('chat.stream.tool_count', toolExecutionCount)

                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'done' })}\n\n`
                  ))
                }

                // Handle errors
                if (message.type === 'result' && message.subtype !== 'success') {
                  logWarn('Claude query did not complete successfully', buildChatAttributes(
                    requestId,
                    messages.length,
                    {
                      'result.subtype': message.subtype,
                    }
                  ))

                  incrementCounter('chat.stream.error', 1, { type: 'incomplete' })

                  controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ type: 'error', message: 'Query did not complete successfully' })}\n\n`
                  ))
                }
              }

              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              controller.close()

              // Set span attributes
              if (span) {
                span.setAttribute('text_delta_count', textDeltaCount)
                span.setAttribute('tool_execution_count', toolExecutionCount)
                span.setAttribute('tools_used', Array.from(toolsUsed).join(','))
              }
            } catch (error) {
              const err = error as Error

              logError('Stream error occurred', buildErrorAttributes(
                err.name || 'StreamError',
                err.message,
                {
                  'request.id': requestId,
                  'error.stack': err.stack?.substring(0, 500),
                }
              ), err)

              incrementCounter('chat.stream.error', 1, { type: 'exception' })

              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Stream error occurred' })}\n\n`
              ))
              controller.close()

              // Mark span as error
              if (span) {
                span.setStatus({ code: 2 }) // 2 = ERROR status code
                span.setAttribute('error', true)
                span.setAttribute('error.message', err.message)
              }
            }
          }
        )
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    const err = error as Error
    const requestDuration = (Date.now() - requestStartTime) / 1000

    logError('Chat API error', buildErrorAttributes(
      err.name || 'ChatAPIError',
      err.message,
      {
        'request.id': requestId,
        'request.duration_seconds': requestDuration,
        'error.stack': err.stack?.substring(0, 500),
      }
    ), err)

    incrementCounter('chat.requests.error', 1, { type: 'api_error' })

    return new Response(
      JSON.stringify({ error: 'Failed to process chat request. Check server logs for details.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
