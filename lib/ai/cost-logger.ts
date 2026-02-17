/**
 * AI Cost Logger
 *
 * Logs per-call cost data as JSONL for pricing analysis and Haiku routing decisions.
 * Writes to logs/ai-costs.jsonl (gitignored).
 */

import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ============================================================================
// Pricing (per million tokens, as of 2025)
// ============================================================================

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Claude Sonnet 4
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  // Claude Haiku 3.5
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 },
  // Gemini 2.0 Flash (approximate)
  'gemini-2.0-flash': { input: 0.1, output: 0.4, cacheRead: 0, cacheWrite: 0 },
};

// ============================================================================
// Types
// ============================================================================

export interface CostEntry {
  timestamp: string;
  callType: 'agent' | 'scan' | 'research' | 'chat';
  model: string;
  taskId?: string;
  iteration?: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd: number;
  /** Breakdown for debugging */
  costBreakdown: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

// ============================================================================
// Logger
// ============================================================================

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'ai-costs.jsonl');

async function ensureLogDir(): Promise<void> {
  if (!existsSync(LOG_DIR)) {
    await mkdir(LOG_DIR, { recursive: true });
  }
}

/**
 * Log an AI API call's cost. Fire-and-forget — never throws.
 */
export async function logCost(params: {
  callType: CostEntry['callType'];
  model: string;
  taskId?: string;
  iteration?: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}): Promise<void> {
  try {
    const pricing = PRICING[params.model] || PRICING['claude-sonnet-4-20250514'];

    const inputTokens = params.inputTokens;
    const outputTokens = params.outputTokens;
    const cacheReadTokens = params.cacheReadTokens || 0;
    const cacheCreationTokens = params.cacheCreationTokens || 0;

    // Cost calculation: cached tokens replace regular input tokens
    // input_tokens already excludes cache_read tokens in Anthropic's API
    const costBreakdown = {
      input: (inputTokens / 1_000_000) * pricing.input,
      output: (outputTokens / 1_000_000) * pricing.output,
      cacheRead: (cacheReadTokens / 1_000_000) * pricing.cacheRead,
      cacheWrite: (cacheCreationTokens / 1_000_000) * pricing.cacheWrite,
    };

    const entry: CostEntry = {
      timestamp: new Date().toISOString(),
      callType: params.callType,
      model: params.model,
      taskId: params.taskId,
      iteration: params.iteration,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
      costUsd: costBreakdown.input + costBreakdown.output + costBreakdown.cacheRead + costBreakdown.cacheWrite,
      costBreakdown,
    };

    await ensureLogDir();
    await appendFile(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Fire-and-forget — log errors silently
  }
}
