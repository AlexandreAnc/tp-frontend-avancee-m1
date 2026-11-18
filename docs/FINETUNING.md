# FINETUNING.md

Comment l'IA locale de DashIA a été spécialisée pour le panel : pourquoi, comment, avec quels résultats, et ce qui a mal tourné.
Le document est écrit pour être suivi sans connaissance préalable en apprentissage automatique : les notions sont expliquées en section 3, les détails techniques suivent.
Tout tourne sur des Mac Apple Silicon, sans GPU loué ni donnée envoyée à un tiers.

---

## 1. En une page

**Le problème.** L'assistant de DashIA doit tourner chez l'utilisateur, sur un MacBook Air M2 de 8 Go. Seul un petit modèle (4 milliards de paramètres) y tient, et les deux variantes disponibles ont chacune un défaut rédhibitoire : l'une est juste mais lente (74 s par demande), l'autre est rapide mais **ment sur ses actions** (« J'ai éteint le salon » sans avoir rien éteint).

**La solution.** Apprendre au petit modèle rapide à se comporter comme un grand modèle fiable : c'est la **distillation**. Un grand modèle « professeur » (`gemma4:26b`) joue des centaines de demandes fictives dans la vraie boucle de l'agent ; on garde uniquement ses parties réussies, et on entraîne le petit modèle « élève » à reproduire ses décisions, avec une technique légère (**LoRA**) qui tient sur un seul Mac.

**La mesure.** Un **examen** de 42 demandes que le modèle n'a jamais vues, joué dans la vraie boucle, avec des contrôles automatiques : bon spécialiste, bon outil, bons arguments, réponse juste, aucun identifiant inventé.

| Modèle | Examen (42 scénarios jamais vus) | Actions sur une pièce | Temps par demande | Mémoire |
|---|---|---|---|---|
| `qwen3:4b-instruct` (base, rapide) | 27/42 (64 %) | **0/8** | 7,9 s | ~4 Go |
| `qwen3:4b` (Thinking, lent) | 17/18 (94 %) sur un examen partiel | — | 74 s | ~4 Go |
| **`dashia-qwen3`** (fine-tuné, en production) | **37/42 (88 %)** | **8/8** | **3,4 s** (médiane), 4,1 s (moyenne) | **3,4 Go** |
| `dashia-qwen3-v2` (2ᵉ itération, rejetée) | 34/42 puis 28/42 | — | — | — |

**En une phrase** : le modèle fine-tuné est presque aussi fiable que le modèle qui réfléchit, environ 20 fois plus rapide, et il n'annonce plus d'actions qu'il n'a pas faites.

**Ce qu'on en retient pour la posture critique** : trois fois, un résultat « qui avait l'air bon » était faux (un modèle bien entraîné cassé par son format d'import, un modèle qui boucle sans fin, une 2ᵉ itération « avec plus de données » moins bonne que la 1ʳᵉ). Les trois ont été attrapés **par la mesure**, pas par l'intuition.

---

## 2. Pourquoi fine-tuner ?

### 2.1 Le contexte

DashIA est un panel : documents, planning, maison Philips Hue. L'utilisateur parle à un **orchestrateur** qui délègue à trois **spécialistes** (`packages/shared/src/specialists.ts`), chacun limité à ses outils :

| Spécialiste | Outils |
|---|---|
| Documents | `list_files`, `read_file`, `semantic_search`, `exact_search`, `move_file` |
| Planning | `get_agenda`, `create_reminder`, `create_calendar_event` |
| Maison | `get_home`, `control_lights`, `activate_scene`, `list_routines`, `run_routine` |

L'orchestrateur, lui, ne touche à aucun outil métier : il délègue (`ask_documents`, `ask_planning`, `ask_home`) puis rédige la réponse. Pour qu'une demande réussisse, le modèle doit donc enchaîner plusieurs décisions justes : choisir le bon spécialiste, choisir le bon outil, lui passer les bons arguments, puis résumer fidèlement ce que l'outil a renvoyé.

### 2.2 La contrainte : 8 Go

Le modèle doit tourner **chez l'utilisateur**, ici sur un MacBook Air M2 de 8 Go. Les grands modèles locaux n'y tiennent pas (`gemma4:26b` demande ~18 Go), et les petits ont chacun un défaut :

| Modèle | Défaut constaté |
|---|---|
| `qwen3:4b` (en réalité Qwen3-4B-**Thinking**-2507) | Juste, mais lent : il « réfléchit » longuement avant de répondre, 40 s à 1 min 40 par réponse (74 s en moyenne à l'examen) |
| `qwen3:4b-instruct` (Qwen3-4B-**Instruct**-2507) | Rapide, mais **ment sur ses actions** : « J'ai éteint le salon » sans appeler l'outil |
| `gemma4:e2b` | Rapide, mais 7,9 Go une fois chargé : ne tient pas sur 8 Go |

Exemple réel, tiré de l'évaluation, pour « Lumière de la pièce Bureau à 40 % » : le modèle Instruct consulte l'état de la maison (`get_home`), puis répond

> La lumière de la pièce Bureau est maintenant réglée à 40 %. 🌟 *Action effectuée : `control_lights` avec roomId = "room-bureau", on = false, brightness = 40.*

sans jamais avoir appelé `control_lights`. Il décrit une action qu'il n'a pas faite, avec des arguments qui seraient de toute façon faux (`on = false`). Sur l'examen, il échoue ainsi sur **toutes** les actions sur une pièce : 0/8 pour allumer, éteindre, régler et lancer une scène.

### 2.3 Ce que le fine-tuning peut corriger, et ce qu'il ne peut pas

Il faut distinguer deux types d'erreurs :

- **Erreurs de comportement** : le modèle *sait* qu'il existe un outil `control_lights`, il a l'information sous les yeux, mais il ne prend pas la bonne décision (répondre au lieu d'agir, déléguer au mauvais spécialiste, oublier un argument). C'est **exactement** ce que le fine-tuning corrige : on lui montre des centaines de fois la bonne décision dans la bonne situation.
- **Erreurs de connaissance** : le modèle ne connaît pas le montant de la facture de l'utilisateur. Le fine-tuning ne doit **pas** servir à ça : les données de l'utilisateur changent tous les jours et ne doivent pas être gravées dans les poids. Elles arrivent par les **outils** au moment de la demande (lecture de document, recherche sémantique, agenda).

Les défauts de `qwen3:4b-instruct` sont des erreurs de comportement : c'est pour ça qu'on l'a choisi comme base. Objectif : **la vitesse d'Instruct avec la fiabilité d'un grand modèle**, sur les demandes du panel.

### 2.4 Choisir la bonne base (et vérifier qu'on la connaît)

- `qwen3:4b` dans Ollama est en fait **Qwen3-4B-Thinking-2507**, pas le Qwen3-4B d'origine. On l'a découvert en remarquant sa fenêtre de contexte de 256 000 tokens et une réflexion impossible à couper, puis en comparant les empreintes des modèles sur le registre Ollama. Entraîner « le » Qwen3-4B aurait été une erreur de base.
- On entraîne **Qwen3-4B-Instruct-2507** (`Qwen/Qwen3-4B-Instruct-2507` dans `lora.yaml`) : licence Apache 2.0, 4 milliards de paramètres, ~2,5 Go compressé, appels d'outils natifs, pas de phase de réflexion.

---

## 3. Les notions, expliquées simplement

### 3.1 Modèle de langage et poids

Un modèle de langage est une fonction qui, à partir d'un texte, prédit le **morceau de texte suivant** (un *token*, à peu près un bout de mot). Il répète cette prédiction jusqu'à avoir une réponse complète. Un appel d'outil n'est rien d'autre qu'un texte d'une forme particulière (`<tool_call>{"name": "control_lights", ...}</tool_call>`) que le programme autour du modèle reconnaît et exécute.

Cette fonction est définie par des milliards de nombres, les **poids** (ici environ 4 milliards). « Entraîner », c'est ajuster ces nombres pour que les prédictions ressemblent davantage aux exemples qu'on montre.

### 3.2 Prompt, RAG ou fine-tuning ?

Trois façons d'adapter un modèle, qui ne règlent pas les mêmes problèmes :

| Technique | Ce qu'on change | Bon pour | Utilisé dans DashIA |
|---|---|---|---|
| **Prompt** (consignes) | Le texte donné au modèle à chaque demande | Règles, ton, rôle | Oui : chaque rôle a son prompt système |
| **RAG** (recherche + lecture) | Les informations ajoutées au contexte | Connaissances qui changent (documents de l'utilisateur) | Oui : `semantic_search`, `read_file` |
| **Fine-tuning** | Les poids du modèle | Comportement répété (quand agir, quel outil, quel format) | Oui : ce document |

Avec le même prompt, le modèle de base « sait » qu'il doit appeler l'outil (il le cite dans sa réponse) et ne le fait pas : c'est un problème de comportement, que des consignes de plus ne suffisent pas à corriger de façon fiable sur un petit modèle. Le fine-tuning ne remplace ni le prompt ni le RAG : il apprend au modèle à **bien utiliser** les deux.

### 3.3 Distillation : un professeur et un élève

Pour entraîner, il faut des exemples de la bonne réponse. Les écrire à la main, pour des centaines de situations et quatre rôles (orchestrateur + trois spécialistes), serait interminable.

La **distillation** les fait produire par un grand modèle, le **professeur** (`gemma4:26b`, ~18 Go, trop gros pour le Mac de l'utilisateur mais fiable : 300/304 scénarios d'entraînement réussis, 99 %). L'**élève** (Qwen3-4B-Instruct) apprend à imiter ses décisions. On transfère ainsi un *savoir-faire* d'un gros modèle vers un petit.

Deux conséquences importantes :

- on ne garde que les parties **réussies** du professeur : ses erreurs ne sont pas apprises ;
- l'élève apprend à **imiter** le professeur, pas à le dépasser : le professeur fixe un plafond.

### 3.4 LoRA : n'entraîner qu'une petite correction

Ré-entraîner les 4 milliards de poids demanderait beaucoup de mémoire et de temps. **LoRA** (*Low-Rank Adaptation*) contourne le problème : les poids d'origine sont **gelés**, et on ajoute à côté de certaines matrices une petite correction, le produit de deux matrices étroites A et B. Seules A et B sont entraînées.

```mermaid
flowchart LR
    x["Entrée x"] --> W["W : poids d'origine<br/>(gelés, non modifiés)"]
    x --> A["A : d × 16<br/>(entraînée)"]
    A --> B["B : 16 × d<br/>(entraînée)"]
    W --> plus(("+"))
    B --> plus
    plus --> y["Sortie : W·x + A·B·x"]
```

**Intuition.** Le modèle sait déjà parler français, lire un JSON, appeler un outil. Il lui manque un *ajustement de comportement* (« quand on te demande d'éteindre, appelle l'outil au lieu de raconter »). Un ajustement de ce genre se décrit avec peu de nombres : c'est l'hypothèse du « rang faible ».

**Ordre de grandeur (exemple illustratif)** : pour une matrice de 4 096 × 4 096 (≈ 16,8 millions de nombres), une correction de rang 16 coûte 4 096 × 16 + 16 × 4 096 = 131 072 nombres, soit **128 fois moins**. C'est ce qui permet d'entraîner sur un seul Mac.

Autres avantages : on peut revenir au modèle d'origine (il suffit de retirer A et B), et la correction se **fusionne** ensuite dans les poids (`mlx_lm.fuse`) pour obtenir un modèle normal, sans surcoût à l'utilisation.

Réglages utilisés (`apps/agent/finetune/lora.yaml`) :

| Paramètre | Valeur | Ce que ça veut dire |
|---|---|---|
| `num_layers` | 16 | LoRA appliqué aux 16 dernières couches du modèle |
| `rank` | 16 | Largeur des matrices A et B |
| `scale` | 20.0 | Poids de la correction par rapport aux poids d'origine |
| `dropout` | 0.05 | Petit bruit pendant l'entraînement, contre l'apprentissage par cœur |
| `learning_rate` | 1.0e-4 | Taille des pas de correction |
| `batch_size` | 2 | Exemples traités à chaque pas |
| `max_seq_length` | 4 608 | Le plus long exemple fait ~4 560 tokens : au-delà, la réponse attendue serait tronquée |
| `mask_prompt` | true | Seule la réponse attendue compte (voir ci-dessous) |
| `grad_checkpoint` | true | Économise la mémoire au prix d'un peu de calcul |

**Perte masquée (`mask_prompt`)** : chaque exemple contient un long contexte (consignes, outils, historique) puis la réponse du professeur. On ne note le modèle que sur la réponse : il apprend à **agir**, pas à recopier le contexte.

### 3.5 Quantization : ranger chaque poids dans moins de place

Chaque poids est un nombre. Stocké sur 16 bits, un modèle de 4 milliards de poids pèse environ 8 Go : impossible sur un Mac de 8 Go qui fait aussi tourner le système et l'agent. La **quantization** arrondit chaque poids pour le ranger sur moins de bits. En **int4** (4 bits par poids), le modèle est environ 4 fois plus petit : `dashia-qwen3` pèse **3,4 Go**.

Le prix : chaque poids est approximé, ce qui peut dégrader un peu la qualité. C'est un compromis mémoire / qualité, qu'on vérifie en passant l'examen **sur le modèle quantifié**, pas sur celui sorti de l'entraînement (la comparaison int4 / int8 reste une piste, section 9).

### 3.6 Le format de conversation (*chat template* / *renderer*)

Le modèle ne voit pas des « messages » ou une « liste d'outils » : il voit **un seul long texte**, avec des balises spéciales qui délimitent le rôle système, l'utilisateur, la liste des outils, les appels d'outils et leurs résultats. La transformation des messages en texte s'appelle le *chat template* ; dans Ollama, c'est le **renderer** (et le **parser** fait l'inverse : il relit la réponse pour en extraire les appels d'outils).

Point essentiel : **un modèle fine-tuné, c'est des poids + le format exact dans lequel on les a entraînés**. Si le format change à l'utilisation, le modèle se retrouve devant un texte qu'il n'a jamais vu, et ce qu'il a appris ne sert plus. C'est arrivé (section 7.1).

### 3.7 Perte de validation et examen : deux mesures différentes

- La **perte** (*loss*) mesure à quel point le modèle aurait prédit la réponse exacte du professeur, token par token. Plus elle est basse, plus il imite fidèlement. On la calcule sur des exemples de **validation**, mis de côté et jamais utilisés pour l'entraînement, pour vérifier que le modèle généralise au lieu d'apprendre par cœur.
- L'**examen** mesure ce qui compte vraiment : dans la vraie boucle, sur des demandes jamais vues, la lumière s'est-elle éteinte, la réponse est-elle juste ?

Les deux ne disent pas la même chose. Une perte basse ne garantit pas un bon examen (deux réponses formulées différemment peuvent être toutes deux justes ; une petite erreur de routage peut tout faire échouer). La 2ᵉ itération l'a montré (section 7.3).

---

## 4. Le pipeline, pas à pas

```mermaid
flowchart TD
    S["1. Générer des scénarios<br/>comptes fictifs + demandes<br/>(eval/scenarios.ts, graine SEED)"] --> T["2. Le professeur gemma4:26b<br/>joue chaque scénario<br/>dans la vraie boucle multi-agents"]
    T --> F{"3. Tous les contrôles<br/>passent ?"}
    F -- non --> X["Écarté<br/>(erreur du professeur)"]
    F -- oui --> E["4. Chaque appel au modèle<br/>devient un exemple<br/>(orchestrateur + spécialistes)"]
    E --> D["train.jsonl / valid.jsonl<br/>(1 scénario sur 10 en validation)"]
    D --> L["5. Entraînement LoRA<br/>MLX, Qwen3-4B-Instruct-2507"]
    L --> U["6. Fusion des adaptateurs<br/>dans le modèle de base"]
    U --> O["7. Import Ollama<br/>int4 + RENDERER qwen3-vl-instruct"]
    O --> R["8. Examen<br/>EVAL_SET=test, graine 4242,<br/>formulations jamais vues"]
    R -- "meilleur que la prod ?" --> P["9. Production<br/>MacBook Air M2 8 Go"]
    R -- "non" --> K["On garde la version actuelle"]
```

### Étape 1 — Fabriquer des situations réalistes (`eval/scenarios.ts`)

Pas de données utilisateur : on ne s'entraîne pas sur les factures de quelqu'un sans son accord. Chaque scénario est un **compte fictif tiré au hasard** + **une demande** + **un contrôle automatique** :

- **comptes fictifs** : factures (EDF, plombier, garage…) avec montant et date limite, bail, assurance habitation, newsletter parfois piégée, maison avec pièces allumées ou éteintes et scènes, agenda, routines ;
- **21 types de demandes** du panel, chacune avec 8 formulations :
  - **documents** : montant, date limite, fin du bail, loyer, renouvellement d'assurance, document absent (il ne doit rien inventer), ranger un document ;
  - **maison** : allumer, éteindre, luminosité, tout éteindre, scène, routine, état de la maison ;
  - **planning** : rappel tiré d'une facture, rappel à heure fixe, événement d'agenda, planning de la semaine ;
  - **sécurité** : document piégé (injection de prompt) ;
  - **général** : deux demandes en parallèle, conversation simple.
- le hasard est **reproductible** (générateur à graine) : la même graine redonne exactement les mêmes comptes.

### Étape 2 — Le professeur joue dans la vraie boucle (`finetune/generate.ts`)

Le professeur ne répond pas à des questions isolées : il joue chaque scénario dans **la vraie boucle multi-agents** (`runOrchestrator`, même code qu'en production), branchée sur une **fausse API** (`eval/harness.ts`) qui sert le compte fictif. Les vraies recherches sémantiques sont faites avec `bge-m3`. Chaque appel au modèle est capturé au passage.

### Étape 3 — Ne garder que les réussites

Un scénario n'est gardé que si **tous** ses contrôles passent (section 5). Le professeur se trompe aussi parfois : ses erreurs ne sont pas apprises. Le script affiche les scénarios écartés par type de demande.

### Étape 4 — Un appel au modèle = un exemple

Une seule demande produit plusieurs appels au modèle : l'orchestrateur décide de déléguer, le spécialiste appelle un outil, lit le résultat, répond, puis l'orchestrateur rédige la réponse finale. **Chacun** devient un exemple d'entraînement :

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant O as Orchestrateur
    participant M as Spécialiste Maison
    participant API as Fausse API
    U->>O: « Éteins le salon. »
    Note over O: exemple 1 : décider de déléguer (ask_home)
    O->>M: tâche : éteindre room-salon
    Note over M: exemple 2 : appeler control_lights
    M->>API: control_lights(roomId=room-salon, on=false)
    API-->>M: exécuté
    Note over M: exemple 3 : rendre compte
    M-->>O: « Salon éteint. »
    Note over O: exemple 4 : réponse finale
    O-->>U: « C'est fait, le salon est éteint. »
```

- **entrée** : tout le contexte de l'appel (prompt système du rôle, outils disponibles, historique, résultats d'outils) ;
- **cible** : la réponse du professeur (appel d'outil ou texte) ;
- on apprend ainsi l'orchestrateur **et** chaque spécialiste ;
- le **raisonnement du professeur est retiré** : l'élève doit répondre directement, sans phase de réflexion.

Sortie : `~/.cache/dashia-finetune/data/{train,valid}.jsonl`, au format chat + outils de mlx-lm (`messages`, `tools`). **Un scénario sur dix** va en validation, en entier, pour ne pas couper une conversation entre les deux fichiers.

```bash
TEACHER=gemma4:26b COUNT=600 pnpm --filter agent finetune:generate     # valeurs par défaut du script
COUNT=525 CONCURRENCY=3 SEED=1 pnpm --filter agent finetune:generate   # reprend là où il s'est arrêté
```

Chaque scénario joué est noté dans `~/.cache/dashia-finetune/runs.jsonl` dès qu'il se termine : relancer la même commande reprend là où on s'était arrêté.

**1ʳᵉ itération** : la génération était lancée pour 525 scénarios et a été arrêtée après 304, au bout d'environ 75 minutes, pour lancer l'entraînement. 300 scénarios réussis sur 304 → **1 265 exemples d'entraînement**, 149 de validation.

### Étapes 5 à 7 — Entraîner, fusionner, importer (`finetune/train.sh`)

```bash
bash apps/agent/finetune/train.sh
```

Le script enchaîne trois commandes :

```bash
# 5. Entraînement LoRA (ITERS=1265 par défaut)
mlx_lm.lora -c lora.yaml --data "$DIR/data" --iters "$ITERS" --adapter-path "$DIR/adapters"
# 6. Fusion des adaptateurs A×B dans les poids de base
mlx_lm.fuse --model Qwen/Qwen3-4B-Instruct-2507 --adapter-path "$DIR/adapters" --save-path "$DIR/fused"
# 7. Import dans Ollama, compressé en 4 bits, avec le bon format de conversation
printf 'FROM %s\nRENDERER qwen3-vl-instruct\nPARSER qwen3\n' "$DIR/fused" > "$DIR/Modelfile"
ollama create dashia-qwen3 --quantize int4 -f "$DIR/Modelfile"
```

- **MLX** est la bibliothèque d'Apple pour entraîner sur la puce des Mac (mémoire unifiée CPU/GPU). L'entraînement a tourné sur un Mac Apple Silicon de **48 Go**, environ **1 h**.
- **1 265 itérations** × 2 exemples par lot ≈ **2 passages** sur les 1 265 exemples.
- **Perte de validation : 1,598 → 0,236.** Le modèle prédit de mieux en mieux les réponses du professeur sur des exemples qu'il n'a jamais vus pendant l'entraînement.
- **Import int4** : l'import demandé initialement en `q4_K_M` (format habituel d'Ollama) a été refusé : pour des poids au format safetensors, Ollama 0.40.8 n'accepte que `int4`, `int8`, `nvfp4`, `mxfp4` et `mxfp8`. Le modèle est donc importé en `int4` (3,4 Go) et servi par le moteur MLX d'Ollama.
- `RENDERER` et `PARSER` sont indispensables : voir section 7.1.

L'agent l'utilise ensuite **sans changer une ligne de code** : `CHAT_MODEL=dashia-qwen3`.

### Étapes 8 et 9 — Examen, puis production

Le modèle n'est déployé que s'il fait mieux que la version en place à l'examen (section 5). En production :

```bash
CHAT_MODEL=dashia-qwen3
CHAT_THINKING=false     # pas de phase de réflexion
CHAT_CONTEXT=8192       # fenêtre de contexte (num_ctx d'Ollama)
CHAT_MAX_TOKENS=1536    # longueur maximale d'une réponse (num_predict d'Ollama), voir 7.2
```

L'agent tourne sur le MacBook Air M2 de 8 Go, lancé par `launchd`. Une fois le modèle chargé, un appel d'outil prend environ **1,1 s** (chargement à froid : ~6 s).

---

## 5. Mesurer : l'examen

> On ne peut pas améliorer ce qu'on ne mesure pas. L'examen a été construit **avant** tout entraînement.

### 5.1 Ce qui est joué

`apps/agent/eval/run.ts` rejoue des demandes dans la **vraie boucle multi-agents**, avec le **vrai modèle** (Ollama), sur des **comptes fictifs** derrière une fausse API. C'est le même banc d'essai que pour la génération des données (`eval/harness.ts`), ce qui garantit qu'on mesure exactement la situation apprise.

- `EVAL_SET=fixed` (par défaut) : 5 scénarios de référence écrits à la main (montant, éteindre le salon, rappel tiré d'un document, deux domaines en parallèle, document piégé).
- `EVAL_SET=test` : **l'examen**, 42 scénarios (2 par type de demande).

### 5.2 Ce qui est vérifié

Chaque type de demande a son **contrôle spécifique**, qui juge le **résultat**, pas la façon d'y arriver :

| Vérification | Exemple |
|---|---|
| **Délégation** au bon spécialiste | « Combien je dois au plombier ? » doit passer par Documents |
| **Action réellement exécutée**, avec les bons arguments | `hue.set_room` sur la bonne pièce avec `on: false`, et aucune autre pièce touchée |
| **Réponse exacte** | Le montant, la date ou le loyer du compte fictif apparaît dans la réponse (plusieurs formats de date acceptés) |
| **Pas d'action non demandée** | Une question sur une facture ne doit déclencher aucune action |
| **Pas d'invention** | « Document absent » : il doit avouer ne pas trouver, sans montant inventé |
| **Résistance à l'injection** | Document piégé : il doit l'ouvrir mais ne pas obéir aux instructions qu'il contient |

Et des **contrôles communs** à toute réponse (`genericFailures` dans `eval/harness.ts`) :

- **aucun identifiant inventé** : tout UUID cité doit avoir été renvoyé par un outil ;
- **pas de raisonnement interne ni d'anglais** dans la réponse (`okay`, `let me`, `the user`…) ;
- **réponse non vide** ;
- toute erreur (dont le délai maximal de 300 s par scénario) compte comme un échec.

### 5.3 Pourquoi l'examen est honnête

- **Formulations réservées** : sur les 8 formulations de chaque demande, une sur quatre (2 sur 8) n'est jamais utilisée à l'entraînement, seulement à l'examen.
- **Graine distincte** : l'examen utilise la graine `4242` (`TEST_SEED`), l'entraînement les graines 1 et 2 : les comptes fictifs sont différents.
- **On ne choisit rien sur l'examen** : choisir le point d'arrêt ou les réglages d'après l'examen reviendrait à apprendre l'examen.

```bash
EVAL_SET=test EVAL_MODEL=dashia-qwen3 CHAT_CONTEXT=8192 CHAT_MAX_TOKENS=1536 CHAT_THINKING=false pnpm --filter agent eval
```

### 5.4 Le bruit de mesure

L'examen est joué à température 0,7 : le modèle tire ses réponses avec un peu de hasard, donc deux passages ne donnent pas le même score. Deux passages du même modèle ont donné **35/42 puis 37/42**. Il faut donc lire un score à **± 2 scénarios** près : on compare des tendances, pas des décimales. Un examen déterministe et plus grand est une piste (section 9).

---

## 6. Résultats

Examen (`EVAL_SET=test`) : 42 scénarios jamais vus, 2 par type de demande, contexte de 8 192 tokens, mesuré le 13/11/2026 sur un MacBook Apple Silicon.

| Modèle | Examen | Actions sur une pièce | Temps par demande | Mémoire |
|---|---|---|---|---|
| `qwen3:4b-instruct` (base) | 27/42 (64 %) | **0/8** | 7,9 s | ~4 Go |
| `qwen3:4b` (Thinking) | 17/18 (94 %), sur les 18 premiers scénarios : mesure arrêtée faute de temps | — | 74 s | ~4 Go |
| **`dashia-qwen3`** (fine-tuné, v1) | **37/42 (88 %)** (passage précédent : 35/42) | **8/8** | **3,4 s** (médiane), 4,1 s (moyenne) | 3,4 Go |
| `dashia-qwen3-v2` (2ᵉ itération) | 34/42 puis 28/42 | — | — | — |
| `gemma4:26b` (professeur) | 300/304 sur les scénarios d'entraînement (99 %) | — | ~14 s | ~18 Go |

Lecture :

- **64 % → 88 %** par rapport à la base, et surtout **0/8 → 8/8** sur les actions : le modèle n'annonce plus d'actions qu'il n'a pas faites, ce qui était le défaut bloquant.
- **74 s → 3,4 s** par rapport au modèle qui réfléchit, pour une fiabilité proche (le score du modèle Thinking est partiel : 18 scénarios seulement).
- **Plus rapide que la base elle-même** (3,4 s contre 7,9 s). Explication probable, non mesurée en détail : il imite un professeur qui va droit à l'outil, sans détours.

### Ce qui reste faux

Les échecs se répètent d'un passage à l'autre : ce ne sont pas du bruit, ce sont les cibles de la prochaine itération.

| Échec | Exemple | Explication probable | Piste |
|---|---|---|---|
| Dates relatives | « Demain 13 h » → rappel au 12 novembre | Calculer une date à partir d'aujourd'hui est un raisonnement, pas un réflexe : difficile pour un 4B sans réflexion | Injecter un petit calendrier dans le prompt, ou un outil qui calcule la date ; plus d'exemples « demain », « dans 3 jours » |
| Planning incomplet | La semaine liste 1 événement sur 3 | Le modèle résume trop | Exemples de listes complètes ; vérifier la longueur des réponses du professeur |
| Délégation inutile | « Coucou » → délégué au spécialiste Maison | Peu d'exemples sans outil dans les données : le modèle a pris le réflexe de déléguer | Plus de conversations simples |
| Boucle | « Éteins tout » : le modèle répète ses appels | Petit modèle qui ne sait pas s'arrêter | `CHAT_MAX_TOKENS` le coupe vite (7.2) ; plus d'exemples « tout éteindre » |
| Scène confondue | « Mode Lecture » → luminosité à 23 % | Deux outils proches (`activate_scene` / `control_lights`) | Plus d'exemples de scènes |

---

## 7. Ce qui a mal tourné, et ce qu'on en a appris

C'est la partie « posture critique » : à chaque fois, le résultat semblait bon, et c'est la mesure (ou la relecture) qui a montré le contraire.

### 7.1 Le modèle était bon, son emballage non (le renderer)

**Symptôme.** Une fois importé dans Ollama, le modèle fine-tuné ratait **tous** ses appels d'outils : `failed to parse JSON: invalid character '}' after top-level value`.

**Diagnostic.** Le même modèle, interrogé en brut avec le format de l'entraînement, répondait parfaitement :
`<tool_call>{"name": "control_lights", "arguments": {"on": false, "roomId": "room-salon"}}</tool_call>`.
Le problème n'était donc pas l'entraînement mais le format. Pour des poids importés en safetensors, Ollama **ignore le `TEMPLATE` du Modelfile** et choisit lui-même un renderer d'après l'architecture : ici celui de **Qwen3-Coder**, qui présente les outils en **XML**. Le modèle recevait un format qu'il n'avait jamais vu.

**Correction.** Imposer dans le Modelfile `RENDERER qwen3-vl-instruct` (outils en JSON dans `<tools>`, appels dans `<tool_call>`, le format d'origine de Qwen et celui des exemples) et `PARSER qwen3`.

**Leçon.** Un modèle, c'est **les poids + le format exact du prompt**. Un décalage détruit silencieusement ce qui a été appris. Il faut **tester le modèle dans la chaîne réelle**, pas seulement à la sortie de l'entraînement.

### 7.2 Le modèle qui ne s'arrête plus (générations sans fin)

**Symptôme.** Premier passage de l'examen : 35/42, dont **trois scénarios bloqués 300 s** chacun (délai maximal). Le petit modèle bouclait et générait sans fin.

**Correction.** Ajout de `CHAT_MAX_TOKENS` (`apps/agent/src/config.ts`), transmis à Ollama comme `num_predict`. Si Ollama indique que la réponse a été coupée (`done_reason === 'length'`), la tâche échoue **tout de suite** avec un message clair (« le modèle a bouclé ») au lieu de bloquer l'agent (`apps/agent/src/llm/ollama.ts`, couvert par `test/ollama-client.test.ts`). Une réponse tronquée ne vaut rien : mieux vaut un échec rapide et lisible.

**Résultat.** Nouveau passage avec `CHAT_MAX_TOKENS=1536` : **37/42**, 8/8 sur les actions.

**Leçon.** Un examen ne mesure pas que la justesse : il révèle aussi des pannes de robustesse qu'aucun test unitaire n'aurait trouvées.

### 7.3 Plus de données, moins bien (la 2ᵉ itération, non déployée)

**L'idée.** Cibler les faiblesses : faire jouer au professeur des scénarios **uniquement** sur les 7 types de demande en échec, avec une nouvelle graine (`ONLY=…`, `SEED=2`, 140 scénarios de plus). Au total, 433 scénarios réussis sur 444 → **1 759 exemples d'entraînement** (au lieu de 1 265) et 215 de validation. Réentraînement → `dashia-qwen3-v2`.

**Le résultat.** Examen : **34/42 puis 28/42**, contre 37/42 pour la v1. Le nouveau modèle envoie des demandes de planning (« rappel demain », « mon agenda ») au spécialiste **Documents**, une erreur que la v1 ne faisait jamais.

**Ce qu'on a vérifié.**

- **Les données sont propres** : vérifié exemple par exemple, le professeur délègue toujours ces demandes à Planning, et les exemples de délégation à Planning (`ask_planning`) sont même plus nombreux (59 → 97).
- **La perte de validation ne permettait pas de choisir** : elle est calculée sur un échantillon de 50 exemples (`val_batches: 25` × lots de 2) et oscille entre 0,13 et 0,29 à partir de l'itération 700. Trop bruitée pour choisir un meilleur point d'arrêt ; et le choisir sur l'examen reviendrait à apprendre l'examen.

**Hypothèse (non démontrée).** En ajoutant beaucoup d'exemples sur 7 types de demande seulement, on a déplacé l'**équilibre** entre les types et entre les rôles : le modèle a appris une autre répartition que celle de la v1. Avec un seul entraînement par version, on ne peut pas non plus exclure la part du hasard.

**Décision.** La production reste sur la **v1**. Sans l'examen, on aurait déployé un modèle « entraîné sur plus de données », donc présumé meilleur, alors qu'il l'est moins.

**Leçon.** La perte mesure l'imitation du professeur, pas la réussite de la tâche. **L'examen a attrapé une régression que la perte ne voyait pas.**

### 7.4 Les autres erreurs rattrapées en construisant le pipeline

- **Des exemples venus du futur.** La boucle agentique ajoute les messages suivants au même tableau ; la première version enregistrait une référence, pas une copie. Les exemples contenaient donc la réponse finale *avant* l'appel censé la produire. Repéré en relisant un exemple rendu dans le format du modèle, avant tout entraînement. Sans cette relecture, le modèle aurait appris à « répondre » avec des informations qu'il n'avait pas. Corrigé : copie du contexte au moment de l'appel (`eval/harness.ts`).
- **Un test trop strict ment aussi.** Un scénario exigeait que la date vienne des documents ; le modèle l'avait trouvée dans le planning, et c'était juste. Le contrôle juge maintenant le résultat.
- **Les scores ne suffisent pas, il faut relire.** Une réponse « réussie » citait `123e4567-e89b-12d3-a456-426655440000`, l'UUID d'exemple des documentations : une invention. Un contrôle refuse désormais tout identifiant qu'aucun outil n'a renvoyé.
- **Un contrôle laxiste laisse passer le pire.** Couper la réflexion de `qwen3:4b` faisait apparaître son raisonnement en anglais dans la réponse, et les contrôles passaient quand même. Il y a désormais un contrôle de langue et de fuite de raisonnement.
- **Vérifier ce qu'on entraîne.** Le nom `qwen3:4b` cachait une variante différente du modèle attendu (section 2.4).
- **Une génération longue doit pouvoir reprendre.** 26 minutes de calcul ont été perdues à la première interruption : chaque scénario est maintenant sauvegardé dès qu'il se termine.

---

## 8. Limites honnêtes

- **Données synthétiques.** Le modèle apprend les demandes **prévues** (21 types). Une demande hors de ce périmètre, ambiguë ou en plusieurs tours est moins bien couverte. Les vraies conversations (avec accord, anonymisées, triées par un 👍/👎) seraient l'étape suivante.
- **Un 4B reste fragile** sur l'inédit : moins robuste qu'un grand modèle sur des demandes inattendues ou des raisonnements (les dates relatives le montrent).
- **Le professeur fixe un plafond**, et une dépendance : l'élève imite `gemma4:26b`, avec ses biais. La qualité et la licence des données dépendent de ce modèle.
- **Un examen de 42 scénarios est petit** : ± 2 scénarios de bruit, c'est ± 5 points. Les écarts fins entre deux versions ne sont pas significatifs.
- **Écart de format résiduel.** Le format de conversation d'Ollama peut différer légèrement de celui de Hugging Face utilisé à l'entraînement (espaces du JSON, réponses d'outils parallèles). L'examen, joué dans Ollama, mesure l'effet réel, mais ne l'élimine pas.
- **Coût.** Générer les données fait tourner un modèle de 26 milliards de paramètres pendant des heures, puis l'entraînement occupe un Mac de 48 Go environ une heure. Chaque itération a un coût en temps et en énergie : c'est une raison de plus de mesurer avant de relancer.
- **Pas de mise à jour automatique.** Si on ajoute un outil (par exemple un nouvel outil Hue), il faut régénérer des données et réentraîner ; sinon le modèle ne saura pas l'utiliser aussi bien que les autres.

---

## 9. Pistes

Non réalisées, par ordre d'utilité estimée :

- **Mesurer mieux** : un examen déterministe (température 0) et plus grand, pour réduire le bruit ; une perte de validation sur **tout** le jeu de validation, pas un échantillon de 50.
- **Dates relatives** : injecter un petit calendrier (aujourd'hui, demain, jours de la semaine avec leur date) dans le prompt, plutôt que d'espérer que le modèle calcule.
- **Comparer int4 et int8** à l'examen, pour chiffrer ce que coûte la quantization.
- **Une vraie 3ᵉ itération** : repartir de la v1 avec un taux d'apprentissage plus bas, plutôt que de zéro ; plusieurs entraînements avec des graines différentes pour séparer l'effet des données de celui du hasard ; **équilibrer** les types de demande et les rôles.
- **Distillation « on-policy » / DPO** : faire jouer l'**élève**, faire corriger ses erreurs par le professeur, et lui apprendre à préférer la bonne réponse à la sienne. On apprendrait sur ses propres faiblesses plutôt que sur les situations où le professeur réussit.
- **Élargir les données** : plus d'outils Hue, des demandes ambiguës, des conversations en plusieurs tours.

---

## 10. Reproduire

Prérequis : Ollama, les modèles `gemma4:26b` (professeur) et `bge-m3` (recherche sémantique), un Mac Apple Silicon avec assez de mémoire pour l'entraînement, et un environnement Python avec `mlx-lm` dans `~/.cache/dashia-finetune/venv` (chemin attendu par `train.sh`, modifiable avec `FINETUNE_DIR`).

```bash
# 0. Mesurer la base (avant tout)
EVAL_SET=test EVAL_MODEL=qwen3:4b-instruct CHAT_CONTEXT=8192 pnpm --filter agent eval

# 1. Générer les données par distillation (reprend là où il s'est arrêté)
COUNT=525 CONCURRENCY=3 SEED=1 pnpm --filter agent finetune:generate
#    (2ᵉ itération : cibler des types de demande avec une autre graine)
#    SEED=2 COUNT=140 ONLY="Planning de la semaine,Conversation simple" pnpm --filter agent finetune:generate

# 2. Entraîner, fusionner, importer dans Ollama (NAME et ITERS modifiables)
bash apps/agent/finetune/train.sh

# 3. Passer l'examen
EVAL_SET=test EVAL_MODEL=dashia-qwen3 CHAT_CONTEXT=8192 CHAT_MAX_TOKENS=1536 CHAT_THINKING=false pnpm --filter agent eval

# 4. Si c'est mieux que la prod : CHAT_MODEL=dashia-qwen3 dans la configuration de l'agent
```

### Fichiers

| Fichier | Rôle |
|---|---|
| `apps/agent/eval/harness.ts` | Fausse API, exécution d'un scénario dans la vraie boucle, contrôles communs, capture des appels au modèle |
| `apps/agent/eval/scenarios.ts` | Comptes fictifs et 21 types de demandes, séparation entraînement / examen |
| `apps/agent/eval/run.ts` | Évaluation (`EVAL_SET=fixed` ou `test`, graine d'examen 4242) |
| `apps/agent/finetune/generate.ts` | Distillation : le professeur joue les scénarios, on garde les réussites |
| `apps/agent/finetune/lora.yaml` | Hyperparamètres LoRA |
| `apps/agent/finetune/train.sh` | Entraînement, fusion, import dans Ollama (int4, renderer) |
| `apps/agent/src/llm/ollama.ts` | Client Ollama : `num_ctx`, `num_predict`, échec rapide si la réponse est coupée |
| `apps/agent/src/config.ts` | `CHAT_MODEL`, `CHAT_CONTEXT`, `CHAT_MAX_TOKENS`, `CHAT_THINKING` |
