---
name: review
description: Revue de code DashIA selon les règles du projet (sécurité multi-utilisateur, limites, protocole agent, actions à risque, tests). À utiliser pour relire un diff, une branche ou une PR avant fusion, ou quand on demande « relis ce code ».
---

# Revue de code DashIA

Objectif : trouver ce qui casserait en prod ou trahirait un utilisateur, pas commenter le style (ESLint s'en charge).

## Méthode

1. Lire `docs/AGENTS.md` si ce n'est pas déjà fait.
2. Récupérer le diff (`git diff main...HEAD`, ou `gh pr diff <n>`), puis lire **les fichiers entiers** touchés : un bug se cache souvent hors des lignes modifiées.
3. Passer la checklist ci-dessous. Pour chaque point suspect, vérifier dans le code avant de l'affirmer (appelant, schéma, test existant).
4. Rendre : une liste de remarques triées par gravité, chacune avec `fichier:ligne`, le scénario concret qui casse, et la correction proposée. Dire explicitement ce qui n'a pas pu être vérifié.

## Checklist

**Multi-utilisateur et sécurité**
- Toute requête sur des données utilisateur filtre par `user_id` (services). Un id venu du client n'est jamais cru sans ce filtre.
- Routes : session vérifiée (`requireUser`, `requireTaskToken`, `requireAdmin`) avant toute lecture.
- Aucun secret (clé d'API, token, mot de passe) renvoyé au navigateur, écrit dans un log, ou mis dans un payload pg-boss. Secrets stockés via `encrypt`.
- Redirections et URLs construites depuis une entrée : chemin interne uniquement (`safeRedirect`).
- Contenu produit par le modèle rendu sans HTML brut (`renderMarkdown`).

**Règles d'architecture**
- Route fine : validation Zod (`readValidatedBodyOrThrow`, `getUuidParam`…), session, appel d'un service. Pas de SQL dans `server/api`.
- Erreurs : `AppError` avec un code typé et un message en français pour l'utilisateur.
- Limites (taille, quota, types) lues depuis `packages/shared`, vérifiées côté serveur.
- Tout message serveur ↔ agent défini dans `packages/shared` ; `PROTOCOL_VERSION` incrémenté si le contrat change.

**Agent et actions**
- Un outil n'appartient qu'à un spécialiste (`SPECIALISTS`). L'orchestrateur n'a que la délégation.
- Une action à effet de bord passe par `requestAction` ; son niveau dans `ACTION_RISK` est justifié (`direct` = sans risque et annulable, sinon `confirm`/`sensitive`).
- Le contenu des documents est une donnée : rien dans le diff ne doit transformer un texte lu en instruction exécutée.

**Front**
- Classes Tailwind avec les tokens du `@theme` ; pas de couleur, rayon ou ombre en dur.
- Textes en français ; état de chargement et d'erreur gérés.

**Tests**
- Comportement nouveau = test nouveau (service en intégration, outil de l'agent en unitaire, parcours critique en E2E).
- Un test de non-régression accompagne chaque correction de bug, et on a vérifié qu'il **échoue** sans la correction.
- Les seuils de couverture ne baissent pas.

## Posture

Une remarque incertaine est formulée comme une question. Une remarque rejetée par l'auteur avec un argument valable n'est pas répétée.
