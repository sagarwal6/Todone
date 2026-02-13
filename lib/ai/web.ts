/**
 * Web Search and Fetch Utilities
 *
 * Provides web research capabilities:
 * - Web search using Tavily API (or fallback)
 * - Web page fetching and content extraction
 */

// ============================================================================
// Types
// ============================================================================

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  searchTime?: number;
}

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  excerpt?: string;
  publishedDate?: string;
  error?: string;
}

// ============================================================================
// Web Search
// ============================================================================

/**
 * Search the web using Tavily API or Gemini as fallback
 */
export async function webSearch(
  query: string,
  maxResults: number = 5
): Promise<WebSearchResponse> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  console.log('=== Web Search ===');
  console.log('Query:', query);
  console.log('Tavily key available:', !!tavilyApiKey);
  console.log('Gemini key available:', !!geminiApiKey);

  // Try Tavily first (best for AI agents)
  if (tavilyApiKey) {
    try {
      console.log('Trying Tavily...');
      return await searchWithTavily(query, maxResults, tavilyApiKey);
    } catch (error) {
      console.error('Tavily search failed, trying Gemini fallback:', error);
    }
  }

  // Fallback to Gemini's grounded search
  if (geminiApiKey) {
    try {
      console.log('Trying Gemini grounded search...');
      return await searchWithGemini(query, maxResults, geminiApiKey);
    } catch (error) {
      console.error('Gemini search also failed:', error);
      // Return empty results with error info
      return {
        query,
        results: [],
        searchTime: 0,
      };
    }
  }

  // No search API available
  console.log('No search API keys available');
  return {
    query,
    results: [],
    searchTime: 0,
  };
}

/**
 * Search using Gemini with Google Search grounding
 * Uses Gemini 2.0 Flash with Google Search tool for real web search
 *
 * The grounding metadata in the response contains the actual search results.
 * See: https://ai.google.dev/gemini-api/docs/google-search
 */
async function searchWithGemini(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<WebSearchResponse> {
  const startTime = Date.now();

  try {
    // Use Gemini with Google Search grounding tool
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: query,
                },
              ],
            },
          ],
          tools: [
            {
              google_search: {},
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini API error response:', errorBody);
      throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    console.log('Gemini grounding response received');

    // Extract grounding metadata which contains the search results
    const candidate = data.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const textResponse = candidate?.content?.parts?.[0]?.text || '';

    console.log('Has grounding metadata:', !!groundingMetadata);
    console.log('Grounding chunks count:', groundingMetadata?.groundingChunks?.length || 0);

    const results: WebSearchResult[] = [];

    // Extract results from groundingChunks (contains URLs and titles)
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks.slice(0, maxResults)) {
        if (chunk.web) {
          results.push({
            title: chunk.web.title || '',
            url: chunk.web.uri || '',
            snippet: '', // Will be filled from groundingSupports
          });
        }
      }
    }

    // Add snippets from groundingSupports if available
    if (groundingMetadata?.groundingSupports && results.length > 0) {
      for (const support of groundingMetadata.groundingSupports) {
        const text = support.segment?.text || '';
        // Match supports to results by index
        if (support.groundingChunkIndices) {
          for (const idx of support.groundingChunkIndices) {
            if (results[idx] && !results[idx].snippet) {
              results[idx].snippet = text;
            }
          }
        }
      }
    }

    // If no grounding metadata, fall back to parsing the text response
    if (results.length === 0 && textResponse) {
      console.log('No grounding chunks, using text response as summary');
      results.push({
        title: 'Search Summary',
        url: '',
        snippet: textResponse.slice(0, 500),
      });
    }

    return {
      query,
      results,
      searchTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Gemini search error:', error);
    throw error;
  }
}

/**
 * Search using Tavily API
 * Tavily is designed for AI agents and provides clean, relevant results
 */
async function searchWithTavily(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<WebSearchResponse> {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        include_answer: false,
        include_raw_content: false,
        search_depth: 'basic',
      }),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = await response.json();

    const results: WebSearchResult[] = (data.results || []).map((r: {
      title: string;
      url: string;
      content: string;
      published_date?: string;
    }) => ({
      title: r.title,
      url: r.url,
      snippet: r.content?.substring(0, 300) || '',
      content: r.content,
      publishedDate: r.published_date,
    }));

    return {
      query,
      results,
      searchTime: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Tavily search error:', error);
    throw error;
  }
}

// ============================================================================
// Web Fetch
// ============================================================================

/**
 * Fetch and extract content from a URL
 */
export async function webFetch(url: string): Promise<WebFetchResult> {
  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL protocol. Must be http or https.');
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TodoneBot/1.0; +https://todone.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await response.text();

    // Extract content from HTML
    const extracted = extractContent(html, url);

    return extracted;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      url,
      title: '',
      content: '',
      error: `Failed to fetch URL: ${errorMessage}`,
    };
  }
}

/**
 * Extract readable content from HTML
 * Simple extraction without heavy dependencies
 */
function extractContent(html: string, url: string): WebFetchResult {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '';

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const excerpt = descMatch ? decodeHtmlEntities(descMatch[1]) : '';

  // Extract published date
  const dateMatch = html.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  const publishedDate = dateMatch ? dateMatch[1] : undefined;

  // Remove script, style, and other non-content elements
  let content = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to find main content area
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                    content.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                    content.match(/<div[^>]+class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);

  if (mainMatch) {
    content = mainMatch[1];
  }

  // Convert to plain text
  content = content
    // Replace block elements with newlines
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    // Replace links with text + URL
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '$2')
    // Remove remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  // Truncate if too long (keep it reasonable for the model)
  // Reduced from 8000 to 5000 chars (~1250 tokens) for cost optimization
  const MAX_CONTENT_LENGTH = 5000;
  if (content.length > MAX_CONTENT_LENGTH) {
    content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated...]';
  }

  return {
    url,
    title,
    content,
    excerpt,
    publishedDate,
  };
}

/**
 * Decode basic HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}
