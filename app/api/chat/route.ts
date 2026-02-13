import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Research, ChatMessage } from '@/lib/types';
import { supabaseAdmin, checkRateLimit } from '@/lib/supabase/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ChatRequest {
  taskId: string;
  taskTitle: string;
  taskResearch: Research | null;
  message: string;
  history: ChatMessage[];
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require authentication to prevent API abuse
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user profile for rate limiting
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', session.user.email)
      .single();

    if (profile) {
      // SECURITY: Rate limit chat requests (20/min, 100/hour, 500/day)
      const rateLimit = await checkRateLimit(profile.id, 'chat', {
        perMinute: 20,
        perHour: 100,
        perDay: 500,
      });

      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            limitType: rateLimit.limitType,
            resetAt: rateLimit.resetAt?.toISOString(),
          },
          { status: 429 }
        );
      }
    }

    const body: ChatRequest = await request.json();
    const { taskTitle, taskResearch, message, history } = body;

    if (!message) {
      return NextResponse.json({ reply: 'Please provide a message.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    });

    // Build context from task and research
    const context = `You are a knowledgeable assistant helping someone complete a task. You have already researched this task and have the information below.

TASK: "${taskTitle}"

${taskResearch ? `
RESEARCH FINDINGS:
${taskResearch.summary}

${taskResearch.quickInfo?.phoneFormatted ? `Phone: ${taskResearch.quickInfo.phoneFormatted}` : ''}
${taskResearch.quickInfo?.hours ? `Hours: ${taskResearch.quickInfo.hours}` : ''}
${taskResearch.quickInfo?.address ? `Address: ${taskResearch.quickInfo.address}` : ''}
${taskResearch.quickInfo?.website ? `Website: ${taskResearch.quickInfo.website}` : ''}

DETAILED INFORMATION:
${taskResearch.rawMarkdown}
` : 'No research available for this task.'}

YOUR ROLE:
- You are the user's knowledgeable assistant who has already done the research
- Give specific, actionable advice based on the research above
- When suggesting questions to ask, make them specific and useful (e.g., "What's the current deductible on my policy?" not generic questions)
- When drafting scripts, make them natural and include specific details from the research
- Be direct and helpful, not vague
- Format responses clearly with bullet points or numbered lists when appropriate`;

    // Build conversation history
    const conversationHistory = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    }));

    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: context }] },
        { role: 'model', parts: [{ text: 'I understand. I\'ll help answer questions about this task using the research provided.' }] },
        ...conversationHistory,
        { role: 'user', parts: [{ text: message }] },
      ],
    });

    const response = await result.response;
    const reply = response.text();

    return NextResponse.json({ reply });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { reply: 'Sorry, I encountered an error. Please try again.' },
      { status: 500 }
    );
  }
}
