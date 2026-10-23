import { getChatLlmConfig } from '../../services/ai-providers';
import { defineAppHandler } from '../../utils/handler';
import { AppError } from '../../utils/errors';
import { requireTaskToken } from '../../utils/task-auth';

/** Modèle de conversation de l'utilisateur pour une réponse du chat (clé déchiffrée, jamais mise en file). */
export default defineAppHandler(async (event) => {
  const { userId, conversationId } = await requireTaskToken(event);
  if (!conversationId) throw new AppError('forbidden', 'Réservé aux réponses de conversation');
  return getChatLlmConfig(userId);
});
