import { GoogleGenerativeAI } from '@google/generative-ai';
import { Research, Action, SourceReference } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const RESEARCH_SYSTEM_PROMPT = `You are a CEO's executive assistant. Your job is to research tasks and provide concise, actionable briefings.

For each task, you will:
1. First, determine if this task requires research (return isPersonal: true if it's a personal/ambiguous task like "call mom", "remember to breathe", etc.)
2. If research is needed, gather information and provide a briefing

Your response must be valid JSON with this exact structure:
{
  "isPersonal": boolean,
  "research": {
    "summary": "2-3 sentence executive summary of key findings",
    "taskType": "category like 'healthcare', 'shopping', 'travel', 'finance', etc.",
    "confidence": "high" | "medium" | "low",
    "keyActions": [
      {
        "label": "Button text (e.g., 'Call Office', 'Book Now', 'View Website')",
        "type": "link" | "phone" | "email" | "copy",
        "value": "URL, phone number, email, or text to copy",
        "isPrimary": true for the most important action, false otherwise
      }
    ],
    "sources": [
      {
        "title": "Source name",
        "url": "https://...",
        "type": "web",
        "confidence": "high" | "medium" | "low",
        "snippet": "Relevant quote from the source"
      }
    ],
    "followUpQuestion": "Optional follow-up question to clarify user intent" or null,
    "rawMarkdown": "Full briefing in markdown format for expanded view"
  }
}

Guidelines:
- Be concise but comprehensive
- Always include at least one actionable button
- Phone numbers should be formatted as tel:+1XXXXXXXXXX
- Email addresses should be formatted as mailto:email@example.com
- Include 2-4 key actions maximum
- Mark ONE action as isPrimary: true (the most important next step)
- Sources should be real, verifiable URLs from your search
- If you can't find specific information, say so honestly
- For time-sensitive tasks, prioritize urgency in your summary

Personal/Skip tasks (return isPersonal: true):
- Personal reminders ("call mom", "drink water")
- Ambiguous tasks without clear research need ("think about life")
- Tasks that require personal context you don't have`;

export async function evaluateAndResearchTask(taskTitle: string): Promise<{
  isPersonal: boolean;
  research: Research | null;
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  const prompt = `Task: "${taskTitle}"

Research this task and provide a CEO-style briefing. Use web search to find current, accurate information including phone numbers, websites, and actionable links.

Remember: Return isPersonal: true for personal tasks that don't need research.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: RESEARCH_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
    } as never);

    const response = await result.response;
    const text = response.text();

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.isPersonal) {
      return { isPersonal: true, research: null };
    }

    const research: Research = {
      summary: parsed.research?.summary || 'Unable to generate summary',
      taskType: parsed.research?.taskType || 'general',
      confidence: parsed.research?.confidence || 'medium',
      keyActions: (parsed.research?.keyActions || []).map((a: Partial<Action>) => ({
        label: a.label || 'Action',
        type: a.type || 'link',
        value: a.value || '#',
        isPrimary: a.isPrimary || false,
      })),
      sources: (parsed.research?.sources || []).map((s: Partial<SourceReference>) => ({
        title: s.title || 'Source',
        url: s.url || null,
        type: s.type || 'web',
        confidence: s.confidence || 'medium',
        snippet: s.snippet || null,
      })),
      followUpQuestion: parsed.research?.followUpQuestion || null,
      rawMarkdown: parsed.research?.rawMarkdown || parsed.research?.summary || '',
      researchedAt: Date.now(),
    };

    return { isPersonal: false, research };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

export function isPersonalTask(title: string): boolean {
  const personalPatterns = [
    /^call\s+(mom|dad|mum|mother|father|family|friend)/i,
    /^text\s+/i,
    /^remind\s+me\s+to\s+(breathe|relax|meditate)/i,
    /^drink\s+water/i,
    /^take\s+a\s+break/i,
    /^go\s+to\s+(bed|sleep)/i,
    /^eat\s+(breakfast|lunch|dinner)/i,
    /^exercise/i,
    /^workout/i,
    /^think\s+about/i,
    /^remember\s+to\s+(breathe|relax)/i,
  ];

  return personalPatterns.some(pattern => pattern.test(title.toLowerCase()));
}
