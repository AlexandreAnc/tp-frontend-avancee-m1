import type { AgentStats, AgentStep, FileStatus, PendingActionStatus, ReminderStatus } from '@app/shared';

/** Événements poussés au navigateur via `/api/events` (Server-Sent Events). */
export type ClientEvent =
  | { type: 'agent.status'; online: boolean; agent: AgentSummary | null }
  | { type: 'file.updated'; fileId: string; status: FileStatus }
  | { type: 'file.deleted'; fileId: string }
  | { type: 'message.status'; conversationId: string; messageId: string; status: 'queued' | 'processing' | 'done' | 'failed' }
  | { type: 'message.created'; conversationId: string; message: ChatMessage }
  | { type: 'agent.step'; conversationId: string; messageId: string; position: number; step: AgentStep; at: string }
  | { type: 'action.created'; actionId: string }
  | { type: 'action.updated'; actionId: string; status: PendingActionStatus }
  | { type: 'reminder.updated'; reminderId: string; status: ReminderStatus }
  | { type: 'activity.created'; activityId: string }
  /** Dossiers créés, renommés, déplacés ou supprimés, fichiers déplacés ou renommés. */
  | { type: 'drive.changed' };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'queued' | 'processing' | 'done' | 'failed' | null;
  replyToId: string | null;
  createdAt: string;
}

export interface AgentSummary {
  name: string;
  chatModel: string;
  activeTasks: number;
  stats: AgentStats | null;
}
