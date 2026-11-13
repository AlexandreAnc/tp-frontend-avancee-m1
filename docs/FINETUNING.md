# FINETUNING.md

Comment l'IA locale de DashIA a été spécialisée pour le panel : de quoi elle a besoin, comment on l'a mesurée, entraînée, et ce qu'on en retient.
Tout tourne sur un MacBook (Apple Silicon), sans GPU loué ni donnée envoyée à un tiers.

## 1. Le problème

DashIA est un panel : documents, planning, maison Philips Hue. L'utilisateur parle à un **orchestrateur** qui délègue à trois **spécialistes** (Documents, Planning, Maison), chacun limité à ses outils (voir `AGENTS.md`).

Le modèle doit tourner **chez l'utilisateur**, sur un Mac de 8 Go. Les grands modèles locaux n'y tiennent pas (`gemma4:26b` demande ~18 Go), et les petits ont chacun un défaut :

| Modèle | Défaut constaté |
|---|---|
| `qwen3:4b` (Thinking-2507) | Juste, mais lent : il « réfléchit » longuement, 40 s à 1 min 40 par réponse |
| `qwen3:4b-instruct` (Instruct-2507) | 15 fois plus rapide, mais **ment sur ses actions** : « J'ai éteint le salon » sans appeler l'outil |
| `gemma4:e2b` | Rapide, mais 7,9 Go chargé : ne tient pas sur 8 Go |

Exemple réel, tiré de l'évaluation, pour « Lumière de la pièce Bureau à 40 % » : le modèle consulte l'état de la maison (`get_home`), puis répond

> La lumière de la pièce Bureau est maintenant réglée à 40 %. 🌟 *Action effectuée : `control_lights` avec roomId = "room-bureau", on = false, brightness = 40.*

sans jamais avoir appelé `control_lights`. Il décrit une action qu'il n'a pas faite, avec des arguments qui seraient de toute façon faux (`on = false`). Sur l'examen, il échoue ainsi sur **toutes** les actions sur une pièce : 0/8 pour allumer, éteindre, régler et lancer une scène.

Le fine-tuning vise le meilleur des deux : **la vitesse d'Instruct avec la fiabilité d'un grand modèle**, sur les demandes du panel.

## 2. D'abord mesurer : l'évaluation

On ne peut pas améliorer ce qu'on ne mesure pas. Avant tout entraînement, `apps/agent/eval/` rejoue des demandes réelles dans la **vraie boucle multi-agents** (même code qu'en production), avec le **vrai modèle** (Ollama), sur des **comptes fictifs** derrière une fausse API.

- **Comptes fictifs aléatoires** (`eval/scenarios.ts`) :
  - factures (EDF, plombier, garage…), avec montant et date limite ;
  - bail, assurance habitation, newsletter parfois piégée ;
  - maison avec pièces allumées ou éteintes et scènes, agenda, routines.
- **21 types de demandes du panel**, chacune avec son contrôle automatique :
  - **documents** : montant, date limite, fin du bail, loyer, renouvellement d'assurance, document absent (il ne doit rien inventer), ranger un document ;
  - **maison** : allumer, éteindre, luminosité, tout éteindre, scène, routine, état de la maison ;
  - **planning** : rappel tiré d'une facture, rappel à heure fixe, événement d'agenda, planning de la semaine ;
  - **sécurité** : document piégé (injection de prompt) ;
  - **général** : deux demandes en parallèle, conversation simple.
- **Contrôles communs** (`eval/harness.ts`) : aucun identifiant inventé (tout UUID cité doit venir d'un outil), réponse en français sans raisonnement interne, réponse non vide.
- **Examen séparé** : une formulation sur quatre et une graine aléatoire distincte sont réservées à l'examen (`EVAL_SET=test`). Le modèle n'est jamais évalué sur une phrase vue à l'entraînement.

```bash
EVAL_SET=test EVAL_MODEL=qwen3:4b-instruct CHAT_CONTEXT=8192 pnpm --filter agent eval
```

## 3. Choisir la base

- `qwen3:4b` dans Ollama est en fait **Qwen3-4B-Thinking-2507**. On l'a découvert en remarquant sa fenêtre de contexte de 256 000 tokens et une réflexion impossible à couper, puis en comparant les empreintes des modèles sur le registre Ollama. Entraîner le Qwen3-4B d'origine aurait été une erreur de base.
- On entraîne **Qwen3-4B-Instruct-2507** : licence Apache 2.0, 4 milliards de paramètres, ~2,5 Go compressé, outils natifs, pas de phase de réflexion. Ses erreurs sont des erreurs de **comportement**, exactement ce que le fine-tuning corrige.

## 4. Les données : distillation par un professeur

Pas de données utilisateur : on ne s'entraîne pas sur les factures de quelqu'un sans son accord. Les exemples sont **fabriqués** :

1. `gemma4:26b`, le « professeur », joue des centaines de scénarios d'entraînement dans la vraie boucle ;
2. **seules les parties entièrement réussies** (tous les contrôles passent) sont gardées. Le professeur se trompe aussi parfois : ses erreurs ne sont pas apprises ;
3. **chaque appel au modèle devient un exemple** : tout le contexte (prompt système du rôle, outils disponibles, historique, résultats d'outils) en entrée, la réponse du professeur (appel d'outil ou texte) comme cible. On apprend ainsi l'orchestrateur **et** chaque spécialiste ;
4. le raisonnement du professeur est retiré : l'élève doit répondre directement.

```bash
COUNT=525 CONCURRENCY=3 SEED=1 pnpm --filter agent finetune:generate   # reprend là où il s'est arrêté
```

Sortie : `~/.cache/dashia-finetune/data/{train,valid}.jsonl` au format chat avec outils de mlx-lm. Un scénario sur dix va en validation, en entier, pour ne pas couper une conversation entre les deux fichiers.

## 5. L'entraînement : LoRA avec MLX

- **LoRA** : on n'entraîne pas les 4 milliards de paramètres, seulement de petites matrices ajoutées sur les 16 dernières couches (rang 16). C'est rapide, ça tient en mémoire, et on peut revenir au modèle d'origine.
- **MLX** (Apple) : entraînement sur la puce du Mac.
- **Perte masquée** (`mask_prompt`) : seule la réponse attendue compte. Le modèle apprend à **agir**, pas à recopier le contexte.
- Configuration : `apps/agent/finetune/lora.yaml`.

```bash
ITERS=300 bash apps/agent/finetune/train.sh
```

Le script entraîne, fusionne les poids, puis importe le résultat dans Ollama sous le nom `dashia-qwen3`, compressé en Q4_K_M, **avec le même gabarit de conversation** que le modèle d'origine. L'agent l'utilise ensuite sans changer une ligne de code : `CHAT_MODEL=dashia-qwen3`.

## 6. Résultats

*À compléter à la fin de l'entraînement.*

| Modèle | Examen (42 scénarios jamais vus) | Temps par demande | Mémoire |
|---|---|---|---|
| `qwen3:4b-instruct` (base) | 27/42 (64 %) ; 0/8 sur les actions d'une pièce | 7,9 s | ~4 Go |
| `qwen3:4b` (Thinking, prod actuelle) | 17/18 (94 %), sur les 18 premiers scénarios : mesure arrêtée faute de temps | 74 s | ~4 Go |
| **`dashia-qwen3`** (fine-tuné) | | | ~4 Go |
| `gemma4:26b` (professeur) | | | ~18 Go |

## 7. Ce que la démarche nous a appris (posture critique)

Erreurs rattrapées en construisant ce pipeline :

- **Des exemples venus du futur.** La boucle agentique ajoute les messages suivants au même tableau ; la première version enregistrait une référence, pas une copie. Les exemples contenaient donc la réponse finale *avant* l'appel censé la produire. On l'a vu en relisant un exemple rendu dans le format du modèle, avant tout entraînement. Sans cette relecture, le modèle aurait appris à « répondre » avec des informations qu'il n'avait pas.
- **Un test trop strict ment aussi.** Un scénario exigeait que la date vienne des documents ; le modèle l'avait trouvée dans le planning, et c'était juste. Le contrôle juge maintenant le résultat.
- **Les scores ne suffisent pas, il faut relire.** Une réponse « réussie » citait `123e4567-e89b-12d3-a456-426655440000`, l'UUID d'exemple des documentations : une invention. Un contrôle refuse désormais tout identifiant qu'aucun outil n'a renvoyé.
- **Un contrôle laxiste laisse passer le pire.** Couper la réflexion de `qwen3:4b` faisait apparaître son raisonnement en anglais dans la réponse, et les contrôles passaient quand même. Il y a désormais un contrôle de langue et de fuite de raisonnement.
- **Vérifier ce qu'on entraîne.** Le nom `qwen3:4b` cachait une variante différente du modèle téléchargé au départ (voir 3).
- **Une génération longue doit pouvoir reprendre.** 26 minutes de calcul ont été perdues à la première interruption : chaque scénario est maintenant sauvegardé dès qu'il se termine.

**Limites connues :**

- Le gabarit d'Ollama (Go) diffère légèrement de celui de Hugging Face utilisé à l'entraînement : espaces du JSON, saut de ligne avant `<tool_call>`, réponses d'outils parallèles non regroupées. L'examen, joué dans Ollama, mesure l'effet réel.
- Les données sont synthétiques : le modèle apprend les demandes prévues. Les vraies conversations (avec accord et anonymisation, triées par un 👍/👎) seraient l'étape suivante.
- Un modèle de 4 milliards de paramètres reste moins robuste qu'un grand modèle sur des demandes inédites ou ambiguës.
- Le professeur fixe un plafond : l'élève apprend à l'imiter, pas à le dépasser.

## 8. Fichiers

| Fichier | Rôle |
|---|---|
| `apps/agent/eval/harness.ts` | Fausse API, exécution d'un scénario dans la vraie boucle, contrôles communs, capture des appels au modèle |
| `apps/agent/eval/scenarios.ts` | Comptes fictifs et 21 types de demandes, séparation entraînement / examen |
| `apps/agent/eval/run.ts` | Évaluation (`EVAL_SET=fixed` ou `test`) |
| `apps/agent/finetune/generate.ts` | Distillation : le professeur joue les scénarios, on garde les réussites |
| `apps/agent/finetune/lora.yaml` | Hyperparamètres LoRA |
| `apps/agent/finetune/train.sh` | Entraînement, fusion, import dans Ollama |
