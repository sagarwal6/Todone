import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Research, ChatMessage } from '@/lib/types';

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
    const body: ChatRequest = await request.json();
    const { taskTitle, taskResearch, message, history } = body;

    if (!message) {
      return NextResponse.json({ reply: 'Please provide a message.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    // Build context from task and research
    const context = `You are a helpful assistant answering follow-up questions about a task.

Task: "${taskTitle}"

${taskResearch ? `
Research Summary: ${taskResearch.summary}

Contact Info:
- Phone: ${taskResearch.quickInfo?.phoneFormatted || 'Not available'}
- Hours: ${taskResearch.quickInfo?.hours || 'Not available'}
- Address: ${taskResearch.quickInfo?.address || 'Not available'}
- Website: ${taskResearch.quickInfo?.website || 'Not available'}

Full Briefing:
${taskResearch.rawMarkdown}
` : 'No research available for this task.'}

Guidelines:
- Be concise and helpful
- Use the research information above to answer questions
- If you don't know something, say so
- Keep responses short (2-3 sentences unless more detail is needed)`;

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
