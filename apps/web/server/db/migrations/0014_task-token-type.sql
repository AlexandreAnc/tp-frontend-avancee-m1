-- Les tokens existants n'ont pas de type : ils durent au plus 35 min et sont réémis à chaque attribution de tâche.
DELETE FROM "task_tokens";--> statement-breakpoint
ALTER TABLE "task_tokens" ADD COLUMN "task_type" text NOT NULL;
