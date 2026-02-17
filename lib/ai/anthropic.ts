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
import { agenticTools } from './tools';
import { executeTool } from './execute-tool';
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
3. Match intent — "message/text" = sms link, "call" = tel link, "email" = draft. Read the task verb.
4. Use tools liberally — tool calls are cheap, wrong answers are expensive. Don't try to be clever with one query when multiple queries give a better answer.
5. Verify before proposing — show what you found, confirm it's right, then build on it. Don't propose plans on unverified assumptions.
6. Respect stated intent — the task description is what the user wants. Lead with what helps them accomplish it.

STYLE:
- Facts first. No preambles, no "Based on what I found...", no hand-holding.
- Scannable: one line per item, bullet lists, ⚡ for time-sensitive.
- Business phone numbers should include hours + timezone when available.
- No results? Say so once: "No results for X." Don't speculate or over-explain.
- Only present exact matches — similar names are not the same entity.
- This is a task list, not a chat. State what you found and what to do. 2-3 sentences max.

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

      // Call Claude with better error handling
      let response;
      try {
        console.log(`=== Anthropic API Call (iteration ${iteration}) ===`);
        const client = getAnthropicClient();
        // Adaptive max_tokens: early iterations (planning/tool use) need fewer tokens
        // Later iterations may need full capacity for final response
        const maxTokens = iteration <= 2 ? 1500 : 2500;

        response = await client.messages.create({
          model: config.model,
          max_tokens: maxTokens,
          // Enable prompt caching for system prompt (40-50% savings on repeated calls)
          system: [
            {
              type: 'text',
              text: getSystemPrompt(userProfile),
              cache_control: { type: 'ephemeral' }
            }
          ],
          tools: agenticTools,
          messages,
        });
        console.log('API call succeeded, model:', response.model);
      } catch (apiError: any) {
        console.error('=== Anthropic API Error ===');
        console.error('Error type:', apiError?.constructor?.name);
        console.error('Error message:', apiError?.message);
        console.error('Status:', apiError?.status);
        console.error('Error body:', JSON.stringify(apiError?.error, null, 2));
        throw apiError; // Re-throw to be caught by outer handler
      }

      // Track tokens
      totalTokens += response.usage.input_tokens + response.usage.output_tokens;

      // Process response
      const { toolCalls, textContent, stopReason } = parseResponse(response);

      // Only emit thinking event for intermediate responses (when there are more tool calls)
      // Don't emit for final response - that goes through the complete event
      if (textContent && toolCalls.length > 0) {
        await onProgress({
          type: 'thinking',
          message: textContent,
          timestamp: Date.now(),
        });
      }

      // If no tool calls and stop_reason is end_turn, we're done
      if (toolCalls.length === 0 && stopReason === 'end_turn') {
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

      // Process tool calls
      const toolResults: Anthropic.MessageParam = {
        role: 'user',
        content: [],
      };

      for (const toolCall of toolCalls) {
        attemptedSteps.push(toolCall.name);

        // Create step record
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

        // Persist step to database
        await persistStep(taskId, step);

        // Emit tool start
        await onProgress({
          type: 'tool_start',
          tool: toolCall.name,
          args: toolCall.input,
          timestamp: Date.now(),
        });

        const startTime = Date.now();

        // Execute tool
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

        // Update step
        step.completedAt = new Date();
        step.durationMs = duration;

        if (result.success) {
          step.status = 'completed';
          step.toolOutput = result.data;
          succeededSteps.push(toolCall.name);

          // Handle pending draft
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

        // Update step in database
        await updateStep(taskId, step);

        // Emit tool result
        await onProgress({
          type: 'tool_result',
          tool: toolCall.name,
          success: result.success,
          duration_ms: duration,
          timestamp: Date.now(),
        });

        // Add tool result to messages (with truncation to avoid token explosion)
        const resultContent = result.success
          ? truncateToolResult(JSON.stringify(result.data), 8000) // ~2000 tokens max per tool result
          : `Error: ${result.error}`;

        (toolResults.content as ContentBlock[]).push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: resultContent,
          is_error: !result.success,
        });
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
async function updateStep(taskId: string, step: AgentStep): Promise<void> {
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
