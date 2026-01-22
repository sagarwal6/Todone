import { GoogleGenerativeAI } from '@google/generative-ai';
import { Research, Action, SourceReference, QuickInfo } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const RESEARCH_SYSTEM_PROMPT = `You are a CEO's executive assistant. Your job is to research tasks and provide SPECIFIC, ACTIONABLE information - not generic instructions.

CRITICAL: You must SEARCH and find ACTUAL DATA. Never tell the user to "go search" - YOU do the searching and return the results.

For each task, you will:
1. First, determine if this task requires research (return isPersonal: true if it's a personal/ambiguous task like "call mom", "remember to breathe", etc.)
2. If research is needed, USE GOOGLE SEARCH to find REAL, SPECIFIC information

Your response must be valid JSON with this exact structure:
{
  "isPersonal": boolean,
  "research": {
    "summary": "One short sentence with SPECIFIC info found",
    "taskType": "category like 'insurance', 'healthcare', 'shopping', 'travel', 'finance', etc.",
    "confidence": "high" | "medium" | "low",
    "quickInfo": {
      "phone": "tel:+1XXXXXXXXXX format for calling",
      "phoneFormatted": "Human readable format like (800) 331-4754",
      "hours": "Business hours like 'Mon-Fri 8am-5pm CT'",
      "address": "Physical address if relevant",
      "website": "Main website URL",
      "price": "Price or price range found (e.g., '$245-$380')",
      "details": "Key specific details (e.g., flight times, product specs)"
    },
    "keyActions": [
      {
        "label": "Short button text like 'Book Now'",
        "type": "link",
        "value": "Direct URL to booking/purchase page",
        "isPrimary": true
      }
    ],
    "sources": [
      {
        "title": "Source name",
        "url": "https://...",
        "type": "web",
        "confidence": "high" | "medium" | "low",
        "snippet": "Relevant quote with specific data"
      }
    ],
    "rawMarkdown": "Detailed briefing with ALL specific options found"
  }
}

TASK-SPECIFIC REQUIREMENTS:

FOR FLIGHTS:
- Search for actual flight options on the specified route and date
- Include: airlines, departure times, prices, flight duration
- rawMarkdown should list 3-5 specific flight options with times and prices
- Link directly to Google Flights search results or airline booking pages
- Example summary: "United 8:50am $289, Delta 10:15am $245, AA 2:30pm $312"

FOR SHOPPING/PRODUCTS:
- Find actual prices from retailers
- Include: product names, prices, where to buy
- Link directly to product pages

FOR APPOINTMENTS (doctors, dentists, etc.):
- Find actual phone numbers and addresses
- Include: office hours, how to book

FOR INSURANCE/FINANCE:
- Find customer service numbers
- Include: hours of operation, online portal links

CRITICAL RULES:
1. NEVER say "I recommend searching" or "go to website X" - YOU search and provide the results
2. ALWAYS include specific prices, times, or data when available
3. Summary must contain ACTUAL DATA, not instructions
4. If you can't find specific data, say "Unable to find current [prices/times/etc]" but still provide what you found
5. quickInfo.price and quickInfo.details should contain the most important specific info

Personal/Skip tasks (return isPersonal: true):
- Personal reminders ("call mom", "drink water")
- Ambiguous tasks without clear research need
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

    const quickInfo: QuickInfo = {
      phone: parsed.research?.quickInfo?.phone,
      phoneFormatted: parsed.research?.quickInfo?.phoneFormatted,
      hours: parsed.research?.quickInfo?.hours,
      address: parsed.research?.quickInfo?.address,
      website: parsed.research?.quickInfo?.website,
    };

    const research: Research = {
      summary: parsed.research?.summary || 'Unable to generate summary',
      taskType: parsed.research?.taskType || 'general',
      confidence: parsed.research?.confidence || 'medium',
      quickInfo,
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
