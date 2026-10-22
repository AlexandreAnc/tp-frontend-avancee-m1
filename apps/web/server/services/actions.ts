import {
  PENDING_ACTION_TTL_MS,
  proposedActionSchema,
  type ActionDecision,
  type ActionTrigger,
  type CreateActionResponse,
  type PendingActionStatus,
  type ProposedAction,
} from '@app/shared';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { assertActionExecutable, executeAction, riskOf } from '../connectors/registry';
import { generateToken, hashToken, safeEqual } from '../utils/crypto';
import { AppError, notFound } from '../utils/errors';
import { runDirectAction } from './activity';
import { requireStepUpIfEnabled } from './step-up';
import { publishToUser } from './events';
import { sendToUser } from './push';

const { pendingActions } = schema;

type ActionRow = typeof pendingActions.$inferSelect;

export function toActionDto(row: ActionRow) {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    summary: row.summary,
    status: row.status,
    risk: row.risk,
    conversationId: row.conversationId,
    expiresAt: row.expiresAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    result: row.result,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

export type ActionDto = ReturnType<typeof toActionDto>;

/**
 * Point d'entrée de toute action demandée par l'agent (ou une routine). Le niveau de risque,
 * défini dans `packages/shared`, décide : exécution directe journalisée, ou validation demandée.
 */
export async function requestAction(userId: string, input: {
  action: ProposedAction;
  summary: string;
  conversationId: string | null;
  trigger: ActionTrigger;
  triggerRef?: string | null;
}): Promise<CreateActionResponse> {
  if (riskOf(input.action.type) === 'direct') {
    const activity = await runDirectAction(userId, {
      action: input.action,
      summary: input.summary,
      trigger: input.trigger,
      triggerRef: input.triggerRef ?? input.conversationId,
    });
    if (activity.status === 'failed') throw new AppError('upstream', activity.error ?? "L'action a échoué.");
    return { status: 'executed', activityId: activity.id, result: activity.result };
  }
  return createPendingAction(userId, input);
}

/**
 * Enregistre une action à valider. Elle ne sera exécutée par le serveur
 * qu'après validation explicite de l'utilisateur, avant `expiresAt`.
 */
async function createPendingAction(userId: string, input: {
  action: ProposedAction;
  summary: string;
  conversationId: string | null;
}) {
  const token = generateToken();
  const [row] = await db.insert(pendingActions).values({
    userId,
    conversationId: input.conversationId,
    type: input.action.type,
    payload: input.action.payload,
    summary: input.summary,
    risk: riskOf(input.action.type),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PENDING_ACTION_TTL_MS),
  }).returning();

  publishToUser(userId, { type: 'action.created', actionId: row!.id });
  const sensitive = row!.risk === 'sensitive';
  await sendToUser(userId, {
    title: sensitive ? 'Validation requise' : 'Action à valider',
    body: input.summary,
    url: `/actions/${row!.id}`,
    tag: `action-${row!.id}`,
    // Une action sensible se valide dans l'app (Face ID impossible depuis une notification) : pas de boutons.
    action: sensitive ? undefined : { id: row!.id, token },
    badge: await countPendingActions(userId),
  });

  return { actionId: row!.id, status: 'pending' as const, expiresAt: row!.expiresAt.toISOString() };
}

export async function countPendingActions(userId: string): Promise<number> {
  const rows = await db.select({ id: pendingActions.id }).from(pendingActions)
    .where(and(eq(pendingActions.userId, userId), eq(pendingActions.status, 'pending')));
  return rows.length;
}

export async function listActions(userId: string, status?: PendingActionStatus) {
  await expireActions(userId);
  const rows = await db.select().from(pendingActions)
    .where(and(eq(pendingActions.userId, userId), status ? eq(pendingActions.status, status) : undefined))
    .orderBy(desc(pendingActions.createdAt))
    .limit(50);
  return rows.map(toActionDto);
}

export async function getAction(userId: string, actionId: string): Promise<ActionDto> {
  await expireActions(userId);
  const [row] = await db.select().from(pendingActions)
    .where(and(eq(pendingActions.id, actionId), eq(pendingActions.userId, userId)));
  if (!row) throw notFound('Action');
  return toActionDto(row);
}

async function updateStatus(row: ActionRow, values: Partial<ActionRow> & { status: PendingActionStatus }): Promise<ActionRow> {
  const [updated] = await db.update(pendingActions).set(values).where(eq(pendingActions.id, row.id)).returning();
  publishToUser(row.userId, { type: 'action.updated', actionId: row.id, status: values.status });
  return updated!;
}

/**
 * Applique la décision de l'utilisateur. Autorisée si la session appartient au propriétaire
 * de l'action, ou si le token à usage unique de la notification est fourni.
 * Valider une action sensible exige la session et une vérification biométrique récente.
 * Le passage `pending → approved/rejected` est atomique : une action ne peut être décidée qu'une fois.
 */
export async function decideAction(
  actionId: string,
  decision: ActionDecision,
  session: { userId: string; sessionId: string } | null,
): Promise<ActionDto> {
  const [row] = await db.select().from(pendingActions).where(eq(pendingActions.id, actionId));
  const ownSession = Boolean(row && session && row.userId === session.userId);
  const authorized = row && (ownSession || (decision.token !== undefined && safeEqual(row.tokenHash, hashToken(decision.token))));
  if (!row || !authorized) throw notFound('Action');

  if (row.risk === 'sensitive' && decision.decision === 'approve' && row.status === 'pending') {
    if (!ownSession || !session) throw new AppError('step_up_required', 'Ouvrez DashIA pour valider cette action avec Face ID.');
    await requireStepUpIfEnabled(row.userId, session.sessionId);
  }

  if (row.status === 'pending' && row.expiresAt <= new Date()) {
    await updateStatus(row, { status: 'expired' });
    throw new AppError('action_expired', 'Cette action a expiré et a été annulée.');
  }

  const action = proposedActionSchema.parse({ type: row.type, payload: row.payload });
  if (decision.decision === 'approve' && row.status === 'pending') {
    await assertActionExecutable(row.userId, action.type);
  }

  const [claimed] = await db.update(pendingActions)
    .set({ status: decision.decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date() })
    .where(and(eq(pendingActions.id, actionId), eq(pendingActions.status, 'pending')))
    .returning();
  if (!claimed) throw new AppError('conflict', 'Cette action a déjà été traitée.');
  publishToUser(claimed.userId, { type: 'action.updated', actionId, status: claimed.status });

  if (decision.decision === 'reject') return toActionDto(claimed);

  try {
    const result = await executeAction(claimed.userId, action);
    return toActionDto(await updateStatus(claimed, { status: 'executed', result }));
  } catch (error) {
    const message = error instanceof AppError ? error.message : "L'exécution de l'action a échoué.";
    if (!(error instanceof AppError)) console.error('[actions] exécution', error);
    return toActionDto(await updateStatus(claimed, { status: 'failed', error: message }));
  }
}

/** Une action expirée est annulée, jamais exécutée par défaut. */
export async function expireActions(userId?: string): Promise<void> {
  const expired = await db.update(pendingActions)
    .set({ status: 'expired' })
    .where(and(
      eq(pendingActions.status, 'pending'),
      lt(pendingActions.expiresAt, new Date()),
      userId ? eq(pendingActions.userId, userId) : undefined,
    ))
    .returning({ id: pendingActions.id, userId: pendingActions.userId });
  for (const row of expired) {
    publishToUser(row.userId, { type: 'action.updated', actionId: row.id, status: 'expired' });
  }
}
