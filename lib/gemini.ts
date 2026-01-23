import { GoogleGenerativeAI } from '@google/generative-ai';
import { Research, Action, SourceReference, QuickInfo, OptionCard, UIType } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const RESEARCH_SYSTEM_PROMPT = `You are a CEO's executive assistant. Your job is to research tasks and provide SPECIFIC, ACTIONABLE information - not generic instructions.

CRITICAL: You must SEARCH and find ACTUAL DATA. Never tell the user to "go search" - YOU do the searching and return the results.

For each task, you will:
1. First, determine if this task requires research (return isPersonal: true if it's a personal/ambiguous task like "call mom", "remember to breathe", etc.)
2. If research is needed, USE GOOGLE SEARCH to find REAL, SPECIFIC information
3. When there are MULTIPLE OPTIONS to compare (flights, hotels, products, services), return them in the "options" array

Your response must be valid JSON with this exact structure:
{
  "isPersonal": boolean,
  "research": {
    "summary": "One short sentence with SPECIFIC info found",
    "taskType": "category like 'insurance', 'healthcare', 'shopping', 'travel', 'finance', etc.",
    "uiType": "options_list" | "contact_card" | "info_card" | "comparison_table" | "steps_list",
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
    "options": [
      {
        "id": "unique-id-1",
        "title": "Provider/Product name (e.g., 'United Airlines', 'Hilton', 'iPhone 15')",
        "subtitle": "Secondary info (e.g., 'Flight UA 123', '4-star', '128GB')",
        "price": "$XXX",
        "priceValue": 123,
        "details": ["Detail 1", "Detail 2", "Detail 3"],
        "badge": "Best Price" | "Recommended" | "Fastest" | null,
        "actionLabel": "Book Flight" | "Reserve" | "Buy Now",
        "actionUrl": "CONSTRUCTED URL with parameters - see URL rules below",
        "provider": "Source like 'Google Flights', 'Amazon', 'Booking.com'"
      }
    ],
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

URL CONSTRUCTION RULES (CRITICAL):
You MUST construct working URLs with proper parameters:

FOR FLIGHTS - Use Google Flights URL format:
https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI2LTAzLTAxagcIARID[ORIGIN]cgcIARID[DEST]&curr=USD
OR simpler format:
https://www.google.com/travel/flights?q=Flights+from+[ORIGIN]+to+[DEST]+on+[DATE]
Example: https://www.google.com/travel/flights?q=Flights+from+MEX+to+SFO+on+March+1+2026

FOR HOTELS - Use Google Hotels URL format:
https://www.google.com/travel/hotels/[CITY]?q=[CITY]+hotels&dates=[CHECKIN]_[CHECKOUT]
Example: https://www.google.com/travel/hotels/San+Francisco?q=San+Francisco+hotels&dates=2026-03-01_2026-03-05

FOR PRODUCTS - Link directly to product pages on retailers (Amazon, Best Buy, etc.)

FOR RESTAURANTS - Use Google Maps or OpenTable:
https://www.google.com/maps/search/[RESTAURANT]+[CITY]

TASK-SPECIFIC REQUIREMENTS:

FOR FLIGHTS:
- Return 3-5 flight options in the "options" array
- Each option: airline name, departure/arrival times, duration, price, number of stops
- actionUrl MUST be a working Google Flights URL with origin, destination, and date
- Mark cheapest as "Best Price", fastest as "Fastest"
- Example option details: ["8:50 AM - 1:39 PM", "4h 49m", "Nonstop"]

FOR HOTELS:
- Return 3-5 hotel options in the "options" array
- Each option: hotel name, star rating, price per night, amenities
- actionUrl should link to booking page with dates pre-filled

FOR SHOPPING/PRODUCTS:
- Return 3-5 product options from different retailers
- Each option: product name, store, price, key specs
- actionUrl links directly to product page

FOR APPOINTMENTS (doctors, dentists, etc.):
- Use quickInfo for phone/hours (not options array)
- Include: office hours, how to book

FOR INSURANCE/FINANCE:
- Use quickInfo for phone/hours (not options array)
- Include: hours of operation, online portal links

CRITICAL RULES:
1. NEVER say "I recommend searching" or "go to website X" - YOU search and provide the results
2. ALWAYS include specific prices, times, or data when available
3. Summary must contain ACTUAL DATA, not instructions
4. If you can't find specific data, say "Unable to find current [prices/times/etc]" but still provide what you found
5. quickInfo.price should show the price RANGE (e.g., "$245-$380")
6. options array should have individual items with their specific prices
7. actionUrl MUST be a fully constructed, working URL - never a placeholder

UI TYPE SELECTION (choose the best UI for the task):
- "options_list": Use for comparing multiple options (flights, hotels, products, restaurants, services)
- "contact_card": Use for tasks that need phone/contact info (call insurance, make appointment, contact support)
- "info_card": Use for general information lookup (what is X, how does Y work)
- "comparison_table": Use when comparing features of 2-3 specific items
- "steps_list": Use for how-to tasks (how to file taxes, how to apply for X)

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
      price: parsed.research?.quickInfo?.price,
      details: parsed.research?.quickInfo?.details,
    };

    // Parse options if present
    const options: OptionCard[] = (parsed.research?.options || []).map((o: Partial<OptionCard>, index: number) => ({
      id: o.id || `option-${index}`,
      title: o.title || 'Option',
      subtitle: o.subtitle,
      price: o.price,
      priceValue: o.priceValue,
      details: o.details || [],
      badge: o.badge,
      actionLabel: o.actionLabel || 'Select',
      actionUrl: o.actionUrl || '#',
      provider: o.provider,
    }));

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
      options: options.length > 0 ? options : undefined,
      uiType: parsed.research?.uiType as UIType || 'info_card',
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
