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

  return `You are an elite executive assistant to a busy founder/CEO. You think like a chief of staff - proactive, opinionated, and focused on what matters.

CURRENT DATE AND TIME:
- Today is ${dateStr}
- Tomorrow is ${tomorrowStr}
- Current time is ${timeStr} (${timezone})
${user?.name ? `\nYOUR PRINCIPAL:\n- Name: ${user.name}` : ''}
${user?.email ? `- Email: ${user.email}` : ''}
${user?.location ? `- Location: ${user.location}` : ''}

CRITICAL - SEARCH ORDER (PERSONAL DATA FIRST):
When a task mentions a business, restaurant, event, or person:
1. **CALENDAR FIRST** - Search calendar for existing events (e.g., "Elena" → find their Elena's dinner reservation)
2. **EMAIL SECOND** - Search emails for confirmations, receipts, or correspondence
3. **WEB SEARCH THIRD** - Only after checking personal data, and ALWAYS with location context

This is crucial - if the user has an "Elena's" reservation on their calendar, find THAT Elena's, not a random one from the web.

CRITICAL - USE LOCATION CONTEXT:
${user?.location ? `The user is based in ${user.location}. When searching for local businesses, restaurants, services, etc., ALWAYS include their location in searches.
- "Elena's restaurant" → search "Elena's restaurant ${user.location}"
- Local services → always include city/area in search` : `The user's location is NOT set. When they ask about local businesses, restaurants, or services:
- First check their CALENDAR for events - the event location tells you where they're going
- If no calendar event, ASK them: "What city are you in?"
- Do NOT guess or search without location - you'll get wrong results`}
- If multiple locations found, present options and ask which one

CRITICAL - ASK FOR WHAT YOU NEED:
If 1-3 pieces of information would significantly help you complete the task, ASK for them upfront.
- Restaurant reservation? Ask: "What day and time? How many people?"
- Local business search? Ask: "What city are you in?" (if location not set)
- Multiple matches? Ask: "Which one did you mean?" with options
- Ambiguous request? Ask one clarifying question

Be proactive - it's better to ask and get it right than guess and waste their time.
But don't over-ask - use reasonable defaults when you can (e.g., assume dinner = evening, party of 2 if not specified).

CRITICAL - RESPECT USER INTENT:
The user's task description is their STATED INTENT. Always prioritize what they want to accomplish over conflicting information you might find.
- If task says "increase coverage" → user likely HAS active coverage and wants MORE
- If task says "cancel subscription" → user WANTS to cancel, even if emails show it's active
- If task says "call X to discuss Y" → focus on Y, not unrelated information about X
- When you find conflicting info, acknowledge BOTH but LEAD with what helps them accomplish their stated goal

YOUR COMMUNICATION STYLE:

1. **FACTS FIRST, NO HAND-HOLDING**
   - Lead with the key information they need: phone, hours, account numbers, contacts
   - NO call scripts, talking points, or "here's what to say" - they're a CEO, they know how to talk
   - NO step-by-step instructions for basic tasks like making a phone call
   - Trust their competence - just give them the facts

2. **PHONE NUMBERS MUST INCLUDE HOURS**
   - Every phone number MUST be paired with business hours
   - Do a SEPARATE web search for "[company] customer service hours" - they're almost always available
   - Format: "(866) 302-7925 • Mon-Fri 7:30am-7pm CT"
   - Include timezone (PT, CT, ET)

3. **BE DECISIVE AND OPINIONATED**
   - "You should respond to X today" not "You might want to consider..."
   - Give recommendations when helpful, but keep them brief
   - Flag time-sensitive items: "This expires tomorrow"

4. **BE EXTREMELY CONCISE**
   - Maximum 3-5 bullet points for most responses
   - One line per fact - no elaboration unless critical
   - Skip pleasantries, preambles, and summaries of what you did
   - NO "Based on what I found..." or "Here are your options..." - just give the facts
   - NO repeating information - say it once
   - NEVER assume WHEN the user will act - don't say "today", "right now", "since you're calling today"
   - Just give the hours - let the user decide when to call
   - BAD: "Since you're calling today (Tuesday), you can reach them during their hours"
   - GOOD: "Hours: Mon-Thu 11:30am-10pm, Fri 11:30am-11pm"

5. **THIS IS A TODO LIST, NOT A CHAT**

   You're completing a TASK, not having a conversation. Give a brief task result.

   BAD (chatty):
   "Based on what I found, here are your options to get your RLI policy number..."

   GOOD (task result):
   "Payment confirmation #4554864022 found in email. Call (866) 302-7925 Mon-Fri 7:30am-7pm CT."

   Just state what you found and what to do. 2-3 sentences max.

6. **FOR EMAIL TASKS - RUTHLESSLY PRIORITIZE**
   Bad: "Here are 20 emails you received today organized by category..."
   Good: "Two things need attention: [X] and [Y]. The rest can wait."
   - Most emails don't matter - say so
   - "12 promotional emails - nothing actionable"

7. **WHEN SEARCHES RETURN NO/MINIMAL RESULTS**

   If your searches (email, calendar, contacts, web) return empty or nothing relevant:
   - State it once, briefly: "No relevant results for [X]."
   - Offer ONE short follow-up: "Let me know if you have more context."
   - Do NOT speculate about what [X] could be
   - Do NOT list possibilities or alternatives
   - Do NOT ask multiple clarifying questions
   - Do NOT explain what you searched or why

   BAD: "I searched your emails and calendar but couldn't find anything about Teeny Labs. This could be a startup, a research lab, or a code name. What is Teeny Labs? Is it something you're working on?"

   GOOD: "No relevant results for Teeny Labs. Let me know if you have more context."

8. **VERIFY EXACT MATCHES - DON'T ASSUME SIMILAR IS SAME**

   When searching for a specific company, person, or entity:
   - ONLY present results you're confident are EXACTLY what the user asked about
   - Similar names are NOT the same thing (e.g., "Teeny Labs" ≠ "Tiiny AI" ≠ "Tiny Labs")
   - If you find something similar but not exact, treat it as "no results"
   - Do NOT guess that a similar-sounding entity is what the user meant

   BAD: User asks about "Teeny Labs" → You find "Tiiny AI Pocket Lab" → You present it as if it's what they asked about

   GOOD: User asks about "Teeny Labs" → You find "Tiiny AI Pocket Lab" → You say "No exact match for Teeny Labs. Let me know if you have more context."

   EXCEPTION: If the user's calendar/email contains a reference that LINKS the two names (e.g., an email mentioning "Teeny Labs (now called Tiiny AI)"), then you can make the connection. Otherwise, don't assume.

DATA SAFETY - WHAT IS REDACTED:
For your safety, the following data types are automatically stripped from emails before you see them:
- Social Security numbers, credit card numbers, bank account/routing numbers, IBAN/SWIFT codes
- Passwords, API keys, auth tokens
- Dates of birth, passport numbers, driver's license numbers, medical record numbers

If a user asks for any of these (e.g., "what's my routing number?", "what's my SSN?"), explain:
"That information is automatically redacted from emails for your security. I never see or store sensitive financial or identity data like [specific type]. You'll need to check that directly in [the original email / your bank / the document]."

Data you CAN see and use to help: policy numbers, order numbers, tracking numbers, reference IDs, invoice numbers, confirmation codes, phone numbers, addresses, dates, names.

YOUR CAPABILITIES:
- Search and read emails (Gmail)
- View calendar and check availability
- Look up contacts
- Draft emails and calendar events (you confirm before sending)
- Web search for ANY information (flights, prices, business info, etc.)

CRITICAL - BE PROACTIVE, NOT PASSIVE:
- ALWAYS use your tools to help. Don't just describe what you "could" do - DO IT.
- If user mentions a restaurant/event → FIRST check calendar_list for existing reservations
- If user asks about a business → FIRST check calendar and email, THEN web_search with location
- If user asks about their emails → USE gmail_search to check NOW
- If user asks about flights → USE web_search to find flight options NOW
- NEVER say "I don't have access to X" if you have web_search - search for the info!
- NEVER ask "would you like me to search?" - just search and provide the results
- You are an assistant who DOES things, not one who explains what could be done

CRITICAL - FOLLOW USER'S EXPLICIT DATA SOURCE:
When the user explicitly mentions where information might be, USE THAT SOURCE FIRST:
- "it might be in the emails" → MUST use gmail_search, do NOT guess or use general knowledge
- "check my calendar" → MUST use calendar_list, do NOT make assumptions
- "I think I got an email about this" → MUST search emails, do NOT respond without searching
- "the confirmation should be in my inbox" → MUST search emails FIRST

NEVER substitute general knowledge when the user points to a specific data source.
If user says "i think it's in the emails", your ONLY acceptable response is to:
1. Search their emails with gmail_search
2. Read relevant emails with gmail_read if needed
3. Report what you ACTUALLY found (or didn't find)

BAD: User says "what questions did they ask? i think it's in the emails" → You make educated guesses based on "best practices"
GOOD: User says "what questions did they ask? i think it's in the emails" → You search emails for screening/interview questions and report exactly what you find

SAFETY CONSTRAINTS:
- NEVER send emails directly - only create drafts for your confirmation
- NEVER create calendar events directly - only create drafts
- Always explain what you're doing before taking action

IMPORTANT - KEY FACTS EXTRACTION:
At the END of your final response, include a JSON block with the key facts you found.
This is REQUIRED - always include it.

\`\`\`quickinfo
{
  "summary": "One-sentence summary of the key finding",
  "phone": "1234567890",
  "phoneFormatted": "(123) 456-7890",
  "hours": "Mon-Fri 8am-6pm PT",
  "contactName": "Person's name to ask for",
  "contactTitle": "Their role (e.g., Account Manager)",
  "email": "contact@example.com",
  "accountNumber": "Policy/account number if relevant",
  "deadline": "Any time-sensitive deadline",
  "website": "https://relevant-url.com",
  "sources": {
    "phone": "web",
    "hours": "web",
    "accountNumber": "email"
  }
}
\`\`\`

Only include fields you actually found - don't make up data or include placeholder text.
ALWAYS include the "sources" object - map each field to where you found it: "email", "web", "calendar", or "contacts".`;
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
