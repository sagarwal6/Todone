export type TaskStatus = 'pending' | 'researching' | 'ready' | 'personal' | 'completed' | 'archived';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type ActionType = 'link' | 'phone' | 'email' | 'copy';

export type SourceType = 'web' | 'email' | 'document';

export type FeedbackType = 'positive' | 'negative';

export interface Action {
  label: string;
  type: ActionType;
  value: string;
  isPrimary: boolean;
}

export interface SourceReference {
  title: string;
  url: string | null;
  type: SourceType;
  confidence: ConfidenceLevel;
  snippet: string | null;
}

export interface StructuredData {
  [key: string]: string | number | boolean | null | StructuredData | StructuredData[];
}

// Generic option card for comparing choices (flights, hotels, products, services, etc.)
export interface OptionCard {
  id: string;
  title: string;           // e.g., "United Airlines", "Hilton Garden Inn", "iPhone 15 Pro"
  subtitle?: string;       // e.g., "Flight UA 123", "4-star hotel", "128GB Space Gray"
  price?: string;          // e.g., "$382", "$150/night", "$999"
  priceValue?: number;     // For sorting: 382, 150, 999
  details: string[];       // e.g., ["8:50 AM - 1:39 PM", "4h 49m", "Nonstop"]
  badge?: string;          // e.g., "Best Price", "Recommended", "Fast"
  actionLabel: string;     // e.g., "Book Flight", "Reserve", "Buy Now"
  actionUrl: string;       // Deep link to booking/purchase page
  provider?: string;       // e.g., "Google Flights", "Booking.com", "Amazon"
}

export interface QuickInfo {
  phone?: string;
  phoneFormatted?: string;
  hours?: string;
  address?: string;
  website?: string;
  price?: string;
  details?: string;
}

// UI types the AI can choose based on the task
export type UIType =
  | 'options_list'     // List of comparable options (flights, hotels, products)
  | 'contact_card'     // Phone, hours, address - for appointments, support calls
  | 'info_card'        // General information display
  | 'comparison_table' // Side-by-side comparison
  | 'steps_list';      // Step-by-step instructions

export interface Research {
  summary: string;
  taskType: string;
  confidence: ConfidenceLevel;
  quickInfo: QuickInfo;
  keyActions: Action[];
  sources: SourceReference[];
  rawMarkdown: string;
  researchedAt: number;
  structuredData?: StructuredData;
  options?: OptionCard[];  // Comparable options (flights, hotels, products, etc.)
  uiType?: UIType;         // AI-selected UI type for this task
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Feedback {
  type: FeedbackType;
  comment?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  order: number;
  research: Research | null;
  feedback: Feedback | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface ResearchRequest {
  taskId: string;
  taskTitle: string;
}

export interface ResearchResponse {
  success: boolean;
  research?: Research;
  isPersonal?: boolean;
  error?: string;
}

export interface RateLimitInfo {
  count: number;
  resetAt: number;
}

export interface StorageData {
  tasks: Task[];
  rateLimit: RateLimitInfo;
}

export interface ProgressStatus {
  stage: 'analyzing' | 'searching' | 'synthesizing' | 'formatting';
  message: string;
  progress: number;
}

export const PROGRESS_STAGES: ProgressStatus[] = [
  { stage: 'analyzing', message: 'Analyzing your task...', progress: 15 },
  { stage: 'searching', message: 'Searching for relevant information...', progress: 45 },
  { stage: 'synthesizing', message: 'Synthesizing insights...', progress: 75 },
  { stage: 'formatting', message: 'Preparing your briefing...', progress: 95 },
];
