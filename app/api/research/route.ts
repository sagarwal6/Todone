import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndResearchTask, isPersonalTask } from '@/lib/gemini';
import { ResearchRequest, ResearchResponse } from '@/lib/types';

// Simple in-memory cache for research results (24 hours)
const researchCache = new Map<string, { result: ResearchResponse; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting (server-side tracking by IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const existing = rateLimitMap.get(ip);

  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  existing.count++;
  rateLimitMap.set(ip, existing);
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count };
}

function getCacheKey(taskTitle: string): string {
  return taskTitle.toLowerCase().trim();
}

export async function POST(request: NextRequest) {
  try {
    const body: ResearchRequest = await request.json();
    const { taskId, taskTitle } = body;

    if (!taskId || !taskTitle) {
      return NextResponse.json(
        { success: false, error: 'Missing taskId or taskTitle' },
        { status: 400 }
      );
    }

    // Quick check for personal tasks (no API call needed)
    if (isPersonalTask(taskTitle)) {
      return NextResponse.json({
        success: true,
        isPersonal: true,
      } as ResearchResponse);
    }

    // Check cache first
    const cacheKey = getCacheKey(taskTitle);
    const cached = researchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.result);
    }

    // Check rate limit
    const ip = request.headers.get('x-forwarded-for') ||
               request.headers.get('x-real-ip') ||
               'anonymous';
    const { allowed, remaining } = checkRateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. You can make 10 research requests per day.'
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitMap.get(ip)?.resetAt.toString() || '',
          }
        }
      );
    }

    // Perform research
    const { isPersonal, research } = await evaluateAndResearchTask(taskTitle);

    const response: ResearchResponse = {
      success: true,
      isPersonal,
      research: research || undefined,
    };

    // Cache the result
    researchCache.set(cacheKey, { result: response, timestamp: Date.now() });

    return NextResponse.json(response, {
      headers: {
        'X-RateLimit-Remaining': remaining.toString(),
      }
    });
  } catch (error) {
    console.error('Research API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Research failed'
      },
      { status: 500 }
    );
  }
}
