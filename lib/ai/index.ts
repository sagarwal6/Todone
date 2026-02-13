// Types
export type {
  ToolResult,
  ToolCall,
  AgentStep,
  AgentFailureState,
  AgentProgressEvent,
  AgentConfig,
  AgentResult,
  PendingDraft,
  EmailDraft,
  CalendarEventDraft,
  TypedTool,
  ToolContext,
  AgentLoopContext,
  ConversationMessage,
  ContentBlock,
  DraftConfirmation,
  ConfirmationResult,
} from './types';

export { DEFAULT_AGENT_CONFIG } from './types';

// Tools
export {
  agenticTools,
  gmailSearchTool,
  gmailReadTool,
  gmailDraftTool,
  calendarListTool,
  calendarCreateTool,
  contactsSearchTool,
  webSearchTool,
  CONFIRMATION_REQUIRED_TOOLS,
  READ_ONLY_TOOLS,
  getToolByName,
  requiresConfirmation,
} from './tools';

// Execution
export { executeTool } from './execute-tool';

// Agentic loop
export { runAgenticLoop, appendProgressEvent } from './anthropic';
