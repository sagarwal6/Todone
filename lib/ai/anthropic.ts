/**
 * Anthropic Agentic Loop
 *
 * Implements the core agentic workflow with:
 * - Token budget tracking (150k limit)
 * - SSE streaming for real-time progress
 * - Saga-style step persistence
 * - Proper error handling (return errors to model)
 * - Cancellation support
 * - Failure state tracking
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { agenticTools, READ_ONLY_TOOLS } from './tools';
import { executeTool } from './execute-tool';
import { logCost } from './cost-logger';
import type {
  AgentLoopContext,
  AgentResult,
  AgentStep,
  AgentFailureState,
  AgentProgressEvent,
  PendingDraft,
  ContentBlock,
  DEFAULT_AGENT_CONFIG,
  UserProfile,
  AgentQuickInfo,
} from './types';
import { supabaseAdmin } from '../supabase/server';

// Lazy-initialize Anthropic client to ensure env vars are loaded
let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    // Use TODONE_ANTHROPIC_API_KEY to avoid conflict with Claude Code's ANTHROPIC_API_KEY
    const apiKey = process.env.TODONE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    console.log('Anthropic client initialized');

    if (!apiKey) {
      throw new Error('TODONE_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) environment variable is not set');
    }

    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

/**
 * Generate system prompt for the agentic assistant with current date/time and user context
 */
function getSystemPrompt(user?: UserProfile): string {
  const now = new Date();
  const timezone = user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Tomorrow's date for context
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return `You are an elite executive assistant. Proactive, opinionated, concise. You complete tasks — you don't describe what you could do.

TODAY: ${dateStr}, ${timeStr} (${timezone}). Tomorrow: ${tomorrowStr}.
${user?.name ? `USER: ${user.name}` : ''}${user?.email ? ` · ${user.email}` : ''}${user?.location ? ` · ${user.location}` : ''}

PRINCIPLES:
1. Personal data first — check calendar and email before web search. The user's own data is more relevant than generic results.${user?.location ? ` Include "${user.location}" in local searches.` : ' Ask for location if needed for local searches.'}
2. Know the person — any task involving a person ("message X", "call X", "do I meet with X?"), use contacts_analyze FIRST. It gives you relationship history: email frequency, last contact, meeting patterns, who initiates. This is how you know which "Andrew" they mean and what the relationship looks like.
3. Right person first, then right channel — disambiguate the person BEFORE choosing how to reach them. Use context clues: an imminent meeting suggests that person; a recent email thread about the topic suggests that person. If contacts_analyze returns multiple people and the top result doesn't match the contextual signal (calendar or email), do a second lookup using the stronger match's full name or email. Once you've identified the right person, pick the channel: "text" = always sms, "email" = always draft, "message/msg" = sms if phone available (with email draft fallback), "call" = tel link. For sms links: [Text Name](sms:+1XXXXXXXXXX&body=URL_ENCODED_MESSAGE). Contact matching must be strong: a 2-letter prefix match on a last name is NOT a match (e.g., "zo" does NOT match "Zojcheski"). Require the search term to match a first name, a nickname, or a substantial portion of a name. If no strong match exists, the term is probably not a person — treat it as a thing/place/brand.
4. Be decisive — if there's a strong signal (e.g., meeting with someone in the next hour, recent email thread about the topic, or only one match), just act. Don't present multiple options when the answer is clear. Only show options when there's genuine ambiguity (multiple people, no contextual signal to disambiguate). Cross-reference: if contacts_analyze and calendar_list return different people for the same first name, weigh recency and relevance — don't default to a contact with zero recent activity.
5. Keep working until you're confident — don't present partial or uncertain results. If a search returns ambiguous results, search again with different terms. If you found a phone number but no hours, search for the hours. Tool calls are cheap; wrong or incomplete answers waste the user's time. You're done when you'd bet money on your answer. BUT — if after exhausting your tools you still can't answer, say so plainly. Never fabricate information. "I couldn't find X" is always better than a guess. NEVER construct email addresses from a person's name — only use addresses found in contacts, email history, or calendar attendee data. If you can't find a verified email, say so.
6. Verify before proposing — show what you found, confirm it's right, then build on it. Don't propose plans on unverified assumptions.
7. Respect stated intent — the task description is what the user wants. Lead with what helps them accomplish it. Parse EVERY word — if the task mentions a name, device, place, product, or any specific noun you don't recognize, you MUST research it. First check email/calendar/contacts; if those don't explain it, web_search for it. NEVER assume you know what an unfamiliar term is — "clawdbot" is not "Claude", "zoho" is not a person named Zo. If you can't find it anywhere, say so. "set up X on Y's computer" means you need to figure out who Y is AND what X is — both require research, not guessing.

STYLE:
- Facts first. No preambles, no "Based on my analysis...", no hand-holding. Never explain your reasoning process.
- Scannable: use markdown lists (- or *) with each item on its own line. Use ⚡ for time-sensitive.
- Business phone numbers should include hours + timezone when available.
- No results? Say so once: "No results for X." Don't speculate or over-explain.
- Only present exact matches — similar names are not the same entity.
- Email drafts: sound like the user wrote them. Call tone_analyze before drafting — study the returned email samples to absorb the user's vocabulary, phrasing, sentence rhythm, and punctuation. Someone who has received 100 emails from this user should think the user wrote the draft themselves. The task tells you WHAT to say; the samples show HOW they'd say it. Always end with their sign-off. If no history, be concise and professional.
- Default: concise. Lead with tappable action links, then one sentence of context. Max 3-4 lines.
- EXCEPTION — meeting prep: Be thorough. For new contacts, tell their STORY — for each company/org they built or led, include what it does, scale, and outcome (IPO, acquired, raised $X). The user should not need to click LinkedIn to know the person. For familiar contacts, lead with recent email context and open items. Scheduling details get one sentence, not a timeline. Include [clickable links](url) throughout for deep-dives. Briefs can be long — thoroughness beats brevity.

SAFETY:
- Read-only access to Gmail, Calendar, Contacts. All drafts require user confirmation.
- Sensitive data (SSN, credit cards, passwords, bank accounts) is automatically redacted from emails. If asked for redacted data, explain it's stripped for security.

KEY FACTS — include at the END of every response:
\`\`\`quickinfo
{
  "summary": "One-sentence key finding",
  "phone": "1234567890",
  "phoneFormatted": "(123) 456-7890",
  "hours": "Mon-Fri 8am-6pm PT",
  "contactName": "Name",
  "email": "contact@example.com",
  "accountNumber": "If relevant",
  "deadline": "If time-sensitive",
  "website": "https://url.com",
  "sources": { "phone": "web", "hours": "web" }
}
\`\`\`
Only include fields you actually found. Always include "sources" mapping each field to: "email", "web", "calendar", or "contacts".`;
}

/**
 * Run the agentic loop for a task
 */
export async function runAgenticLoop(context: AgentLoopContext): Promise<AgentResult> {
  const { userId, taskId, taskTitle, taskResearch, accessToken, config, onProgress, abortController, userProfile } = context;

  // Initialize tracking
  let totalTokens = 0;
  let iteration = 0;
  const steps: AgentStep[] = [];
  const pendingDrafts: PendingDraft[] = [];
  const failedSteps: { tool: string; error: string }[] = [];
  const succeededSteps: string[] = [];
  const attemptedSteps: string[] = [];

  // Track which user chat messages we've already injected (by ID)
  const injectedMessageIds = new Set<string>();

  // Build initial messages
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildInitialPrompt(taskTitle, taskResearch, context.customPrompt),
    },
  ];

  // Update task status to 'working'
  await updateTaskStatus(taskId, 'working');

  // Emit started event
  await onProgress({
    type: 'started',
    taskId,
    timestamp: Date.now(),
  });

  try {
    // Main agentic loop
    while (iteration < config.maxIterations) {
      // Check for cancellation
      if (abortController.signal.aborted) {
        return {
          status: 'cancelled',
          reason: 'User cancelled the operation',
          completedSteps: succeededSteps,
          tokensUsed: totalTokens,
        };
      }

      // Check for task cancellation in database
      const isCancelled = await isTaskCancelled(taskId);
      if (isCancelled) {
        await onProgress({
          type: 'cancelled',
          reason: 'Task cancelled',
          completedSteps: succeededSteps,
          timestamp: Date.now(),
        });
        return {
          status: 'cancelled',
          reason: 'Task cancelled by user',
          completedSteps: succeededSteps,
          tokensUsed: totalTokens,
        };
      }

      // Check token budget
      if (totalTokens > config.maxTotalTokens) {
        await onProgress({
          type: 'budget_exceeded',
          tokensUsed: totalTokens,
          timestamp: Date.now(),
        });
        return {
          status: 'budget_exceeded',
          tokensUsed: totalTokens,
          partialResult: { pendingDrafts, succeededSteps },
        };
      }

      iteration++;

      // Check for new user messages sent while agent is working.
      // Users can send additional context (links, notes) during agent execution.
      // These get injected into the conversation so Claude produces a unified response.
      await injectUserMessages(taskId, injectedMessageIds, messages, onProgress);

      // Call Claude with retry for transient errors (429, 529)
      let response;
      try {
        console.log(`=== Anthropic API Call (iteration ${iteration}) ===`);
        const client = getAnthropicClient();

        // Add cache breakpoint on last user message for incremental conversation caching
        // This means prior conversation turns are cached across iterations
        const cachedMessages = addConversationCaching(messages);

        response = await callWithRetry(client, {
          model: config.model,
          max_tokens: 4096,
          // Enable prompt caching: system + tools + conversation all get cache breakpoints
          system: [
            {
              type: 'text',
              text: getSystemPrompt(userProfile),
              cache_control: { type: 'ephemeral' }
            }
          ],
          tools: agenticTools as Anthropic.Messages.Tool[],
          messages: cachedMessages,
        });
        console.log('API call succeeded, model:', response.model);
      } catch (apiError: unknown) {
        const err = apiError as { constructor?: { name?: string }; message?: string; status?: number; error?: unknown };
        console.error('=== Anthropic API Error ===');
        console.error('Error type:', err.constructor?.name);
        console.error('Error message:', err.message);
        console.error('Status:', err.status);
        console.error('Error body:', JSON.stringify(err.error, null, 2));
        throw apiError; // Re-throw to be caught by outer handler
      }

      // Track tokens and log cost
      totalTokens += response.usage.input_tokens + response.usage.output_tokens;
      const cacheUsage = response.usage as { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
      logCost({
        callType: 'agent',
        model: config.model,
        taskId,
        iteration,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: cacheUsage.cache_read_input_tokens,
        cacheCreationTokens: cacheUsage.cache_creation_input_tokens,
      });

      // Process response
      const { toolCalls, textContent, stopReason } = parseResponse(response);

      // Handle max_tokens truncation: Claude was cut off mid-response
      // If there were tool calls, they may be incomplete — continue the loop
      // by sending what we have back and letting Claude continue
      if (stopReason === 'max_tokens') {
        console.log('Response truncated (max_tokens). Continuing conversation.');
        // Add the truncated response and ask Claude to continue
        messages.push({
          role: 'assistant',
          content: response.content,
        });
        messages.push({
          role: 'user',
          content: 'Your response was truncated. Please continue from where you left off.',
        });
        continue; // Next iteration will pick up
      }

      // Only emit thinking event for intermediate responses (when there are more tool calls)
      // Don't emit for final response - that goes through the complete event
      if (textContent && toolCalls.length > 0) {
        await onProgress({
          type: 'thinking',
          message: textContent,
          timestamp: Date.now(),
        });
      }

      // If no tool calls and stop_reason is end_turn, we're done — unless user sent new context
      if (toolCalls.length === 0 && stopReason === 'end_turn') {
        // Before finalizing, check for user messages that arrived during the Claude call.
        // Brief delay lets the client's async Supabase PUT land before we check.
        await new Promise(resolve => setTimeout(resolve, 200));
        const lateMessages = await injectUserMessages(taskId, injectedMessageIds, messages, onProgress);
        if (lateMessages) {
          // User sent context — add Claude's current response and a continuation prompt
          // to maintain strict user/assistant alternation required by the Anthropic API
          messages.push({ role: 'assistant', content: response.content });
          messages.push({
            role: 'user',
            content: 'The user provided additional context above. Please incorporate it and provide your complete updated response.',
          });
          continue;
        }

        // Extract quickinfo from the response
        const { message: cleanMessage, quickInfo } = extractQuickInfo(textContent || 'Task completed');

        // Agent completed without needing more tools
        await updateTaskStatus(taskId, pendingDrafts.length > 0 ? 'ready' : 'done', {
          pendingDrafts,
          totalTokensUsed: totalTokens,
        });

        await onProgress({
          type: 'complete',
          result: {
            status: 'completed',
            message: cleanMessage,
            pendingDrafts,
            tokensUsed: totalTokens,
            stepsCompleted: succeededSteps.length,
            quickInfo,
          },
          timestamp: Date.now(),
        });

        return {
          status: 'completed',
          message: cleanMessage,
          pendingDrafts,
          tokensUsed: totalTokens,
          stepsCompleted: succeededSteps.length,
          quickInfo,
        };
      }

      // Process tool calls — read-only tools run in parallel, write tools run sequentially after
      const toolResults: Anthropic.MessageParam = {
        role: 'user',
        content: [],
      };

      // Collect results keyed by tool_use_id to preserve ordering
      const resultsByCallId = new Map<string, ContentBlock>();

      // Split into read-only (parallelizable) and write (sequential) batches
      const readCalls = toolCalls.filter(tc => READ_ONLY_TOOLS.has(tc.name));
      const writeCalls = toolCalls.filter(tc => !READ_ONLY_TOOLS.has(tc.name));

      // Helper: execute a single tool call with full lifecycle (step, progress, result)
      const executeOneToolCall = async (toolCall: { id: string; name: string; input: Record<string, unknown> }) => {
        attemptedSteps.push(toolCall.name);

        const step: AgentStep = {
          id: uuidv4(),
          stepNumber: steps.length + 1,
          toolName: toolCall.name,
          toolInput: toolCall.input,
          status: 'running',
          isRetriable: true,
          startedAt: new Date(),
          inputTokens: 0,
          outputTokens: 0,
        };
        steps.push(step);

        await persistStep(taskId, step);
        await onProgress({
          type: 'tool_start',
          tool: toolCall.name,
          args: toolCall.input,
          timestamp: Date.now(),
        });

        const startTime = Date.now();
        const { result, pendingDraft } = await executeTool(
          toolCall.name,
          toolCall.input,
          {
            userId,
            taskId,
            accessToken,
            userEmail: userProfile?.email,
            abortSignal: abortController.signal,
          },
          config
        );
        const duration = Date.now() - startTime;

        step.completedAt = new Date();
        step.durationMs = duration;

        if (result.success) {
          step.status = 'completed';
          step.toolOutput = result.data;
          succeededSteps.push(toolCall.name);

          if (pendingDraft) {
            pendingDrafts.push(pendingDraft);
            await onProgress({
              type: 'draft_created',
              draftType: pendingDraft.type === 'email_draft' ? 'email' : 'calendar',
              draftId: pendingDraft.id,
              timestamp: Date.now(),
            });
          }
        } else {
          step.status = 'failed';
          step.error = result.error;
          step.isRetriable = result.retriable;
          failedSteps.push({ tool: toolCall.name, error: result.error });
        }

        await updateStep(taskId, step);
        await onProgress({
          type: 'tool_result',
          tool: toolCall.name,
          success: result.success,
          duration_ms: duration,
          timestamp: Date.now(),
        });

        // Compound tools return richer data — give them more room
        const truncateLimit = toolCall.name === 'meeting_prep' ? 12000
          : toolCall.name === 'gmail_triage' ? 10000
          : 8000;
        const resultContent = result.success
          ? truncateToolResult(JSON.stringify(result.data), truncateLimit)
          : `Error: ${result.error}`;

        resultsByCallId.set(toolCall.id, {
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: resultContent,
          is_error: !result.success,
        });
      };

      // Execute read-only tools in parallel
      if (readCalls.length > 0) {
        await Promise.all(readCalls.map(executeOneToolCall));
      }

      // Execute write tools sequentially (after all reads complete)
      for (const writeCall of writeCalls) {
        await executeOneToolCall(writeCall);
      }

      // Assemble results in original tool call order
      for (const toolCall of toolCalls) {
        const block = resultsByCallId.get(toolCall.id);
        if (block) {
          (toolResults.content as ContentBlock[]).push(block);
        }
      }

      // Add assistant message with tool uses
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Add tool results
      messages.push(toolResults);
    }

    // Max iterations reached - this is a failure state
    const failureState: AgentFailureState = {
      status: 'failed',
      attempted: attemptedSteps,
      succeeded: succeededSteps,
      failed: failedSteps,
      reason: `Reached maximum iterations (${config.maxIterations}) without completing the task`,
      partialResult: pendingDrafts.length > 0 ? { pendingDrafts } : undefined,
    };

    await updateTaskStatus(taskId, 'failed', { failureState });

    await onProgress({
      type: 'error',
      error: failureState.reason,
      recoverable: false,
      timestamp: Date.now(),
    });

    return failureState;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    const failureState: AgentFailureState = {
      status: 'failed',
      attempted: attemptedSteps,
      succeeded: succeededSteps,
      failed: [...failedSteps, { tool: 'system', error: errorMessage }],
      reason: `Agent loop error: ${errorMessage}`,
      partialResult: pendingDrafts.length > 0 ? { pendingDrafts } : undefined,
    };

    await updateTaskStatus(taskId, 'failed', { failureState });

    await onProgress({
      type: 'error',
      error: errorMessage,
      recoverable: false,
      timestamp: Date.now(),
    });

    return failureState;
  }
}

// ============================================================================
// API Retry & Caching Helpers
// ============================================================================

/**
 * Call Anthropic API with exponential backoff retry for transient errors
 * Retries on 429 (rate limit) and 529 (overloaded) — all other errors propagate immediately
 */
async function callWithRetry(
  client: Anthropic,
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  maxRetries: number = 3
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      const isRetriable = status === 429 || status === 529;

      if (!isRetriable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`API returned ${status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // TypeScript: unreachable, but satisfies return type
  throw new Error('Retry loop exhausted');
}

/**
 * Add cache breakpoints to conversation messages for incremental caching
 * Places cache_control on the last user message so prior turns are cached
 * across iterations of the agentic loop
 */
function addConversationCaching(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;

  // Find the last user message and add cache breakpoint
  const result = messages.map((msg, i) => {
    // Only cache the last user message
    if (msg.role !== 'user') return msg;

    // Check if this is the last user message
    const isLastUser = !messages.slice(i + 1).some(m => m.role === 'user');
    if (!isLastUser) return msg;

    // Add cache_control to the content
    if (typeof msg.content === 'string') {
      return {
        ...msg,
        content: [
          {
            type: 'text' as const,
            text: msg.content,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
      };
    }

    // Array content: add cache_control to the last block
    if (Array.isArray(msg.content) && msg.content.length > 0) {
      const lastIdx = msg.content.length - 1;
      const content = msg.content.map((block, idx) =>
        idx === lastIdx ? { ...block, cache_control: { type: 'ephemeral' as const } } : block
      );
      return { ...msg, content };
    }

    return msg;
  });

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract quickinfo JSON block from agent response
 * Returns { message, quickInfo } where message has the JSON block removed
 */
function extractQuickInfo(text: string): { message: string; quickInfo?: AgentQuickInfo } {
  const quickInfoPattern = /```quickinfo\s*([\s\S]*?)\s*```/i;
  const match = text.match(quickInfoPattern);

  if (!match) {
    return { message: text };
  }

  try {
    const jsonStr = match[1].trim();
    const quickInfo = JSON.parse(jsonStr) as AgentQuickInfo;
    // Remove the quickinfo block from the message
    const message = text.replace(quickInfoPattern, '').trim();
    return { message, quickInfo };
  } catch (e) {
    console.error('Failed to parse quickinfo JSON:', e);
    return { message: text };
  }
}

/**
 * Truncate tool results to prevent token explosion
 * Approximately 4 chars = 1 token, so 8000 chars ≈ 2000 tokens
 */
function truncateToolResult(content: string, maxChars: number = 8000): string {
  if (content.length <= maxChars) {
    return content;
  }

  // Try to truncate at a reasonable boundary
  const truncated = content.substring(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const lastBrace = truncated.lastIndexOf('}');

  let cutPoint = maxChars;
  if (lastNewline > maxChars * 0.8) {
    cutPoint = lastNewline;
  } else if (lastBrace > maxChars * 0.8) {
    cutPoint = lastBrace + 1;
  }

  return content.substring(0, cutPoint) + '\n... [truncated - result too long]';
}

/**
 * Build the initial prompt with task context
 */
function buildInitialPrompt(taskTitle: string, taskResearch?: unknown, customPrompt?: string | null): string {
  // Include current date for context
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // If we have a custom prompt (from insights), use it directly
  if (customPrompt) {
    return `Today is ${dateStr}.\n\n${customPrompt}\n\nUse your tools to help me with this task. Search the web, check my email, look at my calendar - whatever is useful. I'll review any drafts before they're sent.`;
  }

  let prompt = `Today is ${dateStr}.\n\nHelp me with this task: "${taskTitle}"`;

  if (taskResearch) {
    prompt += `\n\nI've already done some research on this task. Here's what I found:\n${JSON.stringify(taskResearch, null, 2)}`;
  }

  prompt += '\n\nUse your tools to help me with this task. Search the web, check my email, look at my calendar - whatever is useful. I\'ll review any drafts before they\'re sent.';

  return prompt;
}

/**
 * Parse Claude's response into tool calls and text
 */
function parseResponse(response: Anthropic.Message): {
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[];
  textContent: string;
  stopReason: string;
} {
  const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
  let textContent = '';

  for (const block of response.content) {
    if (block.type === 'text') {
      textContent += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
  }

  return {
    toolCalls,
    textContent,
    stopReason: response.stop_reason || 'unknown',
  };
}

/**
 * Inject new user messages into the agent conversation.
 * Handles message alternation correctly — if last user message contains
 * tool_result blocks (array content), appends a text block to the array
 * instead of overwriting it.
 * Returns true if messages were injected, false otherwise.
 */
async function injectUserMessages(
  taskId: string,
  injectedMessageIds: Set<string>,
  messages: Anthropic.MessageParam[],
  onProgress: (event: AgentProgressEvent) => Promise<void>
): Promise<boolean> {
  const newUserMessages = await getNewUserMessages(taskId, injectedMessageIds);
  if (newUserMessages.length === 0) return false;

  const combinedText = newUserMessages.map(m => m.content).join('\n\n');
  for (const msg of newUserMessages) {
    injectedMessageIds.add(msg.id);
  }

  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'user') {
    if (Array.isArray(lastMsg.content)) {
      // Last message has tool_result blocks — append a text block to preserve them
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (lastMsg.content as any[]).push({ type: 'text', text: '\n\n[Additional context from user]: ' + combinedText });
    } else {
      // Simple string content — append
      lastMsg.content = (lastMsg.content as string) + '\n\n[Additional context from user]: ' + combinedText;
    }
  } else {
    // Last message is from assistant — add new user message
    messages.push({
      role: 'user',
      content: '[Additional context from user]: ' + combinedText,
    });
  }

  await onProgress({
    type: 'thinking',
    message: 'Incorporating your message...',
    timestamp: Date.now(),
  });

  return true;
}

/**
 * Fetch new user chat messages for a task that haven't been injected yet.
 * Called between agent loop iterations to pick up messages sent while working.
 */
async function getNewUserMessages(
  taskId: string,
  alreadyInjected: Set<string>
): Promise<{ id: string; content: string }[]> {
  try {
    const { data } = await supabaseAdmin
      .from('tasks')
      .select('chat_messages')
      .eq('id', taskId)
      .single();

    if (!data?.chat_messages) return [];

    const chatMessages = data.chat_messages as unknown as { id: string; role: string; content: string }[];
    return chatMessages
      .filter(m => m.role === 'user' && !alreadyInjected.has(m.id))
      .map(m => ({ id: m.id, content: m.content }));
  } catch {
    return [];
  }
}

/**
 * Check if a task has been cancelled
 */
async function isTaskCancelled(taskId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('tasks')
    .select('cancelled_at')
    .eq('id', taskId)
    .single();

  return !!data?.cancelled_at;
}

/**
 * Update task status in database
 */
async function updateTaskStatus(
  taskId: string,
  status: 'added' | 'working' | 'ready' | 'done' | 'failed',
  extra?: {
    pendingDrafts?: PendingDraft[];
    failureState?: AgentFailureState;
    totalTokensUsed?: number;
  }
): Promise<void> {
  const update: Record<string, unknown> = { status };

  if (extra?.pendingDrafts) {
    update.pending_drafts = extra.pendingDrafts;
  }
  if (extra?.failureState) {
    update.failure_state = extra.failureState;
  }
  if (extra?.totalTokensUsed !== undefined) {
    update.total_tokens_used = extra.totalTokensUsed;
  }
  if (status === 'done') {
    update.completed_at = new Date().toISOString();
  }

  await supabaseAdmin.from('tasks').update(update).eq('id', taskId);
}

/**
 * Persist a step to the database
 */
async function persistStep(taskId: string, step: AgentStep): Promise<void> {
  await supabaseAdmin.from('agent_steps').insert({
    id: step.id,
    task_id: taskId,
    step_number: step.stepNumber,
    tool_name: step.toolName,
    tool_input: step.toolInput,
    status: step.status,
    started_at: step.startedAt?.toISOString(),
  });
}

/**
 * Update a step in the database
 */
async function updateStep(_taskId: string, step: AgentStep): Promise<void> {
  await supabaseAdmin
    .from('agent_steps')
    .update({
      tool_output: step.toolOutput,
      error_message: step.error,
      is_retriable: step.isRetriable,
      status: step.status,
      completed_at: step.completedAt?.toISOString(),
      duration_ms: step.durationMs,
    })
    .eq('id', step.id);
}

/**
 * Append progress event to task (for cross-device sync)
 */
export async function appendProgressEvent(
  taskId: string,
  event: AgentProgressEvent
): Promise<void> {
  // Use raw SQL to append to array
  // Fire-and-forget safe — errors logged but never thrown to caller
  try {
    await supabaseAdmin.rpc('append_agent_progress', {
      p_task_id: taskId,
      p_event: event,
    });
  } catch (err) {
    console.error('Failed to append progress event:', err);
  }
}
