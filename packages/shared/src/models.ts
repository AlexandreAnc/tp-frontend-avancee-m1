/**
 * Dimension des vecteurs stockés en base (colonne pgvector).
 * Elle dépend du modèle d'embeddings, qui doit être identique sur toutes les machines.
 * Changer de modèle implique une migration et la réindexation de tous les fichiers.
 */
export const EMBEDDING_DIMENSIONS = 1024;

/** Modèle d'embeddings par défaut (multilingue, 1024 dimensions). */
export const DEFAULT_EMBED_MODEL = 'bge-m3';

/** Découpage du texte en chunks avant calcul des embeddings (en caractères). */
export const CHUNK_SIZE = 1200;
export const CHUNK_OVERLAP = 200;
