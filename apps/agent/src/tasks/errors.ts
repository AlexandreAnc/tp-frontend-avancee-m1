/**
 * Erreur de tâche. `retryable: false` : une autre tentative donnerait le même résultat.
 * `fatal` : la tâche entière doit s'arrêter (token refusé), même si l'erreur survient dans un outil.
 */
export class TaskError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly fatal = retryable) {
    super(message);
    this.name = 'TaskError';
  }
}

export class TaskCancelledError extends Error {
  constructor() {
    super('Tâche annulée');
    this.name = 'TaskCancelledError';
  }
}
