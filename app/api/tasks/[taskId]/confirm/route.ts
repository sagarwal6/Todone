/**
 * Draft Confirmation Endpoint
 *
 * Handles user confirmation, rejection, or editing of agent-generated drafts.
 * This endpoint is idempotent - confirming the same draft multiple times
 * will not result in duplicate actions.
 *
 * SAFETY: This endpoint NEVER sends emails or creates calendar events directly.
 * - For emails: Creates a Gmail draft (user must manually send from Gmail)
 * - For calendar: Creates a tentative calendar event marked as draft
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin, logAuditEvent } from '@/lib/supabase/server';
import * as gmail from '@/lib/google/gmail';
import * as calendar from '@/lib/google/calendar';
import { getValidAccessToken } from '@/lib/google/auth';
import type {
  PendingDraft,
  EmailDraft,
  CalendarEventDraft,
  DraftConfirmation,
  ConfirmationResult,
} from '@/lib/ai/types';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  // Get session
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get user from database
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', session.user.email)
    .single();

  if (!profile) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = profile.id;

  // Parse request body
  let confirmation: DraftConfirmation;
  try {
    confirmation = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Validate confirmation
  if (!confirmation.draftId || !confirmation.action) {
    return new Response(
      JSON.stringify({ error: 'Missing draftId or action' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!['confirm', 'reject', 'edit'].includes(confirmation.action)) {
    return new Response(
      JSON.stringify({ error: 'Invalid action. Must be confirm, reject, or edit' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Get task and verify ownership
  const { data: task, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (taskError || !task) {
    return new Response(JSON.stringify({ error: 'Task not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Find the draft
  const pendingDrafts = (task.pending_drafts || []) as PendingDraft[];
  const draft = pendingDrafts.find((d) => d.id === confirmation.draftId);

  if (!draft) {
    return new Response(
      JSON.stringify({ error: 'Draft not found' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Check if draft was already confirmed
  if (task.confirmed_at && task.original_draft) {
    const originalDraft = task.original_draft as { id?: string };
    if (originalDraft.id === confirmation.draftId) {
      return new Response(
        JSON.stringify({
          error: 'Draft was already confirmed',
          confirmedAt: task.confirmed_at,
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // Get OAuth tokens for executing actions
  // SECURITY: Uses getValidAccessToken which handles decryption and refresh
  const accessToken = await getValidAccessToken(userId) ?? undefined;

  let result: ConfirmationResult;

  // Handle the action
  switch (confirmation.action) {
    case 'confirm':
      result = await handleConfirm(draft, accessToken);
      break;
    case 'reject':
      result = await handleReject(draft, confirmation.feedback);
      break;
    case 'edit':
      if (!confirmation.editedData) {
        return new Response(
          JSON.stringify({ error: 'editedData required for edit action' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      result = await handleEdit(draft, confirmation.editedData, accessToken);
      break;
    default:
      result = { success: false, action: 'rejected', error: 'Unknown action' };
  }

  // Update task with confirmation result
  const updatedDrafts = pendingDrafts.filter((d) => d.id !== confirmation.draftId);
  const draftHistory = (task.draft_history || []) as unknown[];

  const updateData: Record<string, unknown> = {
    pending_drafts: updatedDrafts,
    draft_history: [...draftHistory, {
      draftId: confirmation.draftId,
      action: confirmation.action,
      result,
      timestamp: Date.now(),
    }],
    user_feedback: confirmation.action,
  };

  if (confirmation.action === 'confirm' || confirmation.action === 'edit') {
    updateData.confirmed_at = new Date().toISOString();
    updateData.confirmed_by = userId;
    updateData.original_draft = draft;
    updateData.final_draft = confirmation.action === 'edit'
      ? { ...draft, data: confirmation.editedData }
      : draft;
  }

  if (confirmation.action === 'reject' && confirmation.feedback) {
    updateData.user_feedback_text = confirmation.feedback;
  }

  // If all drafts are processed and confirmed, mark task as done
  if (updatedDrafts.length === 0 && result.success) {
    updateData.status = 'done';
    updateData.completed_at = new Date().toISOString();
  }

  await supabaseAdmin
    .from('tasks')
    .update(updateData)
    .eq('id', taskId);

  // Log audit event (SECURITY: only IDs and action, no user data)
  await logAuditEvent(
    userId,
    taskId,
    `draft_${confirmation.action}`,
    {
      draftId: confirmation.draftId,
      draftType: draft.type,
      success: result.success,
      action: result.action,
      // Intentionally NOT logging result.details or result.error to avoid storing user data
    },
    request.headers.get('x-forwarded-for') || undefined,
    request.headers.get('user-agent') || undefined
  );

  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle draft confirmation - save as draft (NEVER send directly)
 *
 * SAFETY: This function creates drafts only, never sends or creates directly.
 * - Emails: Saved to Gmail Drafts folder
 * - Calendar: NOT created - user must manually create from draft details
 */
async function handleConfirm(
  draft: PendingDraft,
  accessToken?: string
): Promise<ConfirmationResult> {
  if (!accessToken) {
    return {
      success: false,
      action: 'rejected',
      error: 'No access token available. Please reconnect your Google account.',
    };
  }

  try {
    if (draft.type === 'email_draft') {
      const emailData = draft.data as EmailDraft;
      // SAFETY: Use createDraft, NOT sendEmail - user must send manually from Gmail
      const result = await gmail.createDraft(accessToken, emailData);
      return {
        success: true,
        action: 'draft_saved',
        details: {
          ...result,
          message: 'Email draft saved to Gmail. Open Gmail to review and send.',
        },
      };
    } else if (draft.type === 'calendar_event') {
      // SAFETY: Do NOT create calendar events directly
      // Just record that the draft was confirmed - user must create manually
      const eventData = draft.data as CalendarEventDraft;
      return {
        success: true,
        action: 'calendar_draft_confirmed',
        details: {
          event: eventData,
          message: 'Calendar event details confirmed. Please create the event manually in Google Calendar.',
        },
      };
    }

    return {
      success: false,
      action: 'rejected',
      error: `Unknown draft type: ${draft.type}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: 'rejected',
      error: errorMessage,
    };
  }
}

/**
 * Handle draft rejection
 */
async function handleReject(
  draft: PendingDraft,
  feedback?: string
): Promise<ConfirmationResult> {
  // Rejection doesn't require any API calls
  // Just record that it was rejected
  return {
    success: true,
    action: 'rejected',
    details: {
      draftId: draft.id,
      draftType: draft.type,
      feedback,
    },
  };
}

/**
 * Handle draft edit - save edited version as draft (NEVER send directly)
 *
 * SAFETY: This function creates drafts only, never sends or creates directly.
 */
async function handleEdit(
  draft: PendingDraft,
  editedData: EmailDraft | CalendarEventDraft,
  accessToken?: string
): Promise<ConfirmationResult> {
  if (!accessToken) {
    return {
      success: false,
      action: 'rejected',
      error: 'No access token available. Please reconnect your Google account.',
    };
  }

  try {
    if (draft.type === 'email_draft') {
      // SAFETY: Use createDraft, NOT sendEmail - user must send manually from Gmail
      const result = await gmail.createDraft(accessToken, editedData as EmailDraft);
      return {
        success: true,
        action: 'draft_saved',
        details: {
          ...result,
          wasEdited: true,
          message: 'Edited email draft saved to Gmail. Open Gmail to review and send.',
        },
      };
    } else if (draft.type === 'calendar_event') {
      // SAFETY: Do NOT create calendar events directly
      // Just record that the edited draft was confirmed
      return {
        success: true,
        action: 'calendar_draft_confirmed',
        details: {
          event: editedData,
          wasEdited: true,
          message: 'Calendar event details confirmed. Please create the event manually in Google Calendar.',
        },
      };
    }

    return {
      success: false,
      action: 'rejected',
      error: `Unknown draft type: ${draft.type}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action: 'rejected',
      error: errorMessage,
    };
  }
}
