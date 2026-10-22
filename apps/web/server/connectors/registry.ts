import { ACTION_RISK, type ProposedAction, type RiskLevel } from '@app/shared';
import type { ConnectorProvider } from '../db/schema';
import { getGoogleClient, hasConnector } from '../services/connectors';
import { ensureFolderPath, moveFiles } from '../services/drive';
import { getFile } from '../services/files';
import { getHueApi } from '../services/hue';
import { cancelReminder, createReminder } from '../services/reminders';
import { AppError } from '../utils/errors';
import { createGoogleCalendarMcpServer } from './google/calendar-mcp';
import { createHueMcpServer } from './hue/hue-mcp';
import { callMcpTool } from './mcp';

type PayloadOf<T extends ProposedAction['type']> = Extract<ProposedAction, { type: T }>['payload'];

interface ActionHandler<T extends ProposedAction['type']> {
  /** Connecteur requis (absent : action interne au serveur, ex. rappel). */
  provider?: ConnectorProvider;
  execute: (userId: string, payload: PayloadOf<T>) => Promise<unknown>;
  /** Annule l'effet d'une action directe, à partir de son résultat (journal d'activité). */
  undo?: (userId: string, result: unknown) => Promise<void>;
}

const CONNECTOR_LABELS: Record<ConnectorProvider, string> = {
  google: 'Google Agenda',
  hue: 'Philips Hue',
};

/** Actions Hue : exécutées par le serveur MCP Hue, annulables en rétablissant l'état précédent. */
function hueHandler<T extends 'hue.set_room' | 'hue.set_light' | 'hue.activate_scene'>(tool: string): ActionHandler<T> {
  return {
    provider: 'hue',
    execute: async (userId, payload) => callMcpTool(createHueMcpServer(await getHueApi(userId)), tool, payload),
    undo: async (userId, result) => {
      await callMcpTool(createHueMcpServer(await getHueApi(userId)), 'restore', result as Record<string, unknown>);
    },
  };
}

/**
 * Exécution de chaque type d'action défini dans `packages/shared`. Les connecteurs externes
 * passent par un serveur MCP ; ajouter un connecteur = écrire son serveur MCP et l'associer ici.
 */
const ACTION_HANDLERS: { [T in ProposedAction['type']]: ActionHandler<T> } = {
  'google_calendar.create_event': {
    provider: 'google',
    execute: async (userId, payload) =>
      callMcpTool(createGoogleCalendarMcpServer(await getGoogleClient(userId)), 'create_event', payload),
  },
  'reminder.create': {
    execute: async (userId, payload) => {
      const reminder = await createReminder(userId, { ...payload, source: 'agent' });
      return { reminderId: reminder.id };
    },
    undo: async (userId, result) => {
      const { reminderId } = result as { reminderId: string };
      await cancelReminder(userId, reminderId);
    },
  },
  'drive.move_file': {
    execute: async (userId, payload) => {
      const file = await getFile(userId, payload.fileId);
      const folderId = await ensureFolderPath(userId, payload.folderPath);
      await moveFiles(userId, [file.id], folderId);
      return { fileId: file.id, previousFolderId: file.folderId, folderId };
    },
    undo: async (userId, result) => {
      const { fileId, previousFolderId } = result as { fileId: string; previousFolderId: string | null };
      // Le dossier d'origine a pu être supprimé depuis : le fichier revient alors à la racine.
      await moveFiles(userId, [fileId], previousFolderId).catch(async (error: unknown) => {
        if (!(error instanceof AppError && error.code === 'not_found' && previousFolderId)) throw error;
        await moveFiles(userId, [fileId], null);
      });
    },
  },
  'hue.set_room': hueHandler('set_room'),
  'hue.set_light': hueHandler('set_light'),
  'hue.activate_scene': hueHandler('activate_scene'),
};

function handlerFor(type: ProposedAction['type']) {
  return ACTION_HANDLERS[type] as ActionHandler<ProposedAction['type']>;
}

export function riskOf(type: ProposedAction['type']): RiskLevel {
  return ACTION_RISK[type];
}

export function canUndo(type: string): boolean {
  return type in ACTION_HANDLERS && Boolean(handlerFor(type as ProposedAction['type']).undo);
}

/** Vérifie, avant de consommer une validation, que le connecteur nécessaire est branché. */
export async function assertActionExecutable(userId: string, type: ProposedAction['type']): Promise<void> {
  const { provider } = handlerFor(type);
  if (provider && !await hasConnector(userId, provider)) {
    throw new AppError('connector_missing', `Connectez ${CONNECTOR_LABELS[provider]} dans les réglages, puis validez à nouveau cette action.`);
  }
}

/** Exécute une action côté serveur (validée par l'utilisateur, ou de niveau `direct`). */
export async function executeAction(userId: string, action: ProposedAction): Promise<unknown> {
  return handlerFor(action.type).execute(userId, action.payload);
}

export async function undoAction(userId: string, type: ProposedAction['type'], result: unknown): Promise<void> {
  const { undo } = handlerFor(type);
  if (!undo) throw new AppError('conflict', 'Cette action ne peut pas être annulée.');
  await undo(userId, result);
}
