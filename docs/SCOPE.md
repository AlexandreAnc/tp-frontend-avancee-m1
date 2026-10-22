# SCOPE — Hub personnel piloté par l'agent

Évolution de la PWA : une seule app installée qui connaît les documents, le planning et la maison de l'utilisateur, pilotable par la discussion, un tap sur un tag NFC ou un panel.

## Avancement (22/10/2026)

| Phase | État |
|---|---|
| 1. Planning | ✅ Livrée : niveaux de risque `direct` / `confirm`, journal, rappels push, échéances, résumé du matin, panel, pastille d'icône |
| 2. Sécurité | ✅ Livrée : passkeys (connexion Face ID / empreinte), verrouillage de l'app, validation forte des actions sensibles |
| 3. Maison | ✅ Code livré et testé contre un faux serveur Hue ; **à valider sur le pont réel** (nécessite une app développeur Philips, voir README) |
| 4. Routines & NFC | ✅ Livrée : routines (heure, tag, manuel, agent), tags NFC (écriture Android, URL iPhone), écran au tap |

Ajouts issus de la maquette DashIA : formats images (vision) et Excel, catégories du drive, aperçu des documents, stats CPU/RAM/VRAM de l'agent, choix du modèle de chat (admin), test de connexion, export des données.

Code de secours : fait (6 chiffres, haché scrypt, bloqué 15 min après 5 erreurs ; il déverrouille l'app mais ne remplace pas Face ID pour les actions sensibles).

Reste à faire : **Wake-on-LAN** (nécessite un relais toujours allumé sur le réseau local, ex. Raspberry Pi), déclencheur par lieu (non faisable en PWA).

## Décisions validées

| Sujet | Décision |
|---|---|
| Philips Hue | Pont Hue présent. Pilotage par l'**API cloud Hue** (OAuth Philips), exécuté par le **serveur**, comme Google Agenda. Fonctionne même si le PC de l'agent est éteint. |
| Validation des actions | **Niveaux de risque** : les actions sans risque (lampes, scènes) sont exécutées directement ; le reste reste validé ; les actions sensibles exigent la biométrie. |
| Plateformes | **iPhone et Android**. Chaque fonctionnalité a une alternative là où iOS bloque. |
| NFC | Un tag contient une **URL** (`https://<app>/t/<tagId>`) : lu nativement par iOS et Android, app fermée comprise. Un tag **déclenche** une routine, il n'**authentifie** jamais. |
| Déverrouillage | **Passkeys** (WebAuthn : Face ID, Touch ID, empreinte) via le plugin passkey de Better Auth. |

## Modules

### 1. Panel (tableau de bord, page d'accueil)

- **Aujourd'hui / semaine** : événements Google Agenda, rappels, échéances détectées dans les documents.
- **À valider** : actions en attente (carte avec Valider / Refuser).
- **Maison** : pièces et lampes (état, on/off, luminosité), scènes en un tap.
- **Routines** : boutons de lancement manuel.
- **Drive** : derniers documents analysés, stockage utilisé.
- **Agent** : en ligne / hors ligne, tâches en cours.
- **Barre de commande** : question ou ordre à l'agent depuis le panel.

Données hors ligne : le panel est mis en cache comme l'historique (dernière version consultable).

### 2. Planning et rappels

- **Rappels natifs** : action `reminder.create`, exécutée par le serveur (pas de connecteur requis) ; un job pg-boss planifié envoie le push à l'heure dite.
- **Échéances automatiques** : à l'analyse d'un document, chaque date d'échéance détectée devient une suggestion « Me le rappeler N jours avant ? ».
- **Résumé quotidien** (optionnel, heure réglable) : push « 2 échéances cette semaine, 1 action à valider ».
- **Vue planning** : agenda Google (lecture, scope `calendar.events` déjà accordé) + rappels + échéances.
- Rappels gérables : liste, modification, suppression, report (« dans 1 h », « demain »).

### 3. Maison : Philips Hue

- Connecteur **Hue Remote API (CLIP v2)** : OAuth avec le compte Philips, puis appairage distant du pont (une fois). Tokens chiffrés en base, comme Google.
- Serveur MCP `hue` (même modèle que `google-calendar`) : `list_lights`, `set_light`, `list_scenes`, `activate_scene`, `set_room`.
- Lecture de l'état (pièces, lampes, scènes) pour le panel et pour l'agent.
- Prérequis : compte développeur Philips Hue et application enregistrée (client id / secret, URI de redirection `<BETTER_AUTH_URL>/api/connectors/hue/callback`).

### 4. Routines et NFC

Une **routine** = un nom + un ou plusieurs **déclencheurs** + une liste d'**actions**.

- **Déclencheurs** : tag NFC, heure (cron), bouton du panel, phrase à l'agent (« lance Bonne nuit »).
- **Actions** : scène / lampes Hue, rappel, question à l'agent avec réponse en push, ouverture d'un document ou d'une page.
- **Niveau de risque d'une routine** = le plus élevé de ses actions.

Exemples livrés comme modèles : « Je pars » (tout éteindre + récap du jour), « Je rentre » (scène salon + résumé de ce que l'agent a traité), « Bonne nuit » (extinction + rappels du lendemain), « Mode travail », « Classeur » (ouvre les documents liés à un tag posé sur un dossier papier).

**Tags NFC**

- Un tag porte uniquement une URL `https://<app>/t/<tagId>` (identifiant aléatoire, non devinable).
- Au tap : le téléphone ouvre l'app sur `/t/<tagId>` → la routine associée s'exécute (ou demande la biométrie si elle est sensible) → retour visuel.
- Écriture du tag : **Android** depuis l'app (Web NFC) ; **iPhone** : l'app affiche l'URL à copier dans une app d'écriture NFC (ex. NFC Tools), une seule fois par tag.
- Un tag est révocable ; un tag inconnu ou révoqué n'exécute rien.

### 5. Sécurité : passkeys et verrouillage

- **Connexion sans mot de passe** par passkey (le mot de passe reste possible).
- **Verrouillage de l'app** (option) : biométrie demandée à la réouverture après N minutes d'inactivité ; l'historique en cache reste masqué tant que l'app est verrouillée.
- **Validation forte** : les actions de niveau `sensitive` exigent une vérification passkey récente (moins de 5 min), contrôlée **côté serveur**.
- Limite connue : un bouton de notification ne peut pas déclencher la biométrie → une action `sensitive` n'a pas de boutons Valider / Refuser dans la notification ; le clic ouvre la carte dans l'app.

## Niveaux de risque des actions

| Niveau | Exécution | Exemples |
|---|---|---|
| `direct` | Exécutée tout de suite par le serveur, journalisée, annulable quand c'est possible | lampes, scènes, rappel pour soi |
| `confirm` | `pending_action` + validation (notification ou carte), 15 min | créer un événement agenda, futures actions externes |
| `sensitive` | `pending_action` + validation **avec passkey** | supprimer des données, envoyer un message au nom de l'utilisateur |

- Le niveau est défini **par type d'action dans `packages/shared`**, jamais choisi par l'agent.
- Toute action `direct` apparaît dans un journal d'activité (panel), avec le déclencheur (agent, routine, tag).

## Impacts techniques

- `packages/shared` : niveaux de risque par type d'action ; nouveaux types d'action (`reminder.create`, `hue.set_light`, `hue.activate_scene`…) ; nouveaux outils de l'agent (`create_reminder`, `list_reminders`, `get_agenda`, `control_lights`, `run_routine`).
- Base : tables `reminders`, `routines`, `routine_triggers`, `nfc_tags`, `action_log`, `passkey` (Better Auth) ; colonne `risk` sur `pending_actions`.
- Serveur : services `reminders`, `routines`, `hue` ; jobs pg-boss planifiés (rappels, résumé, routines horaires) ; connecteur MCP Hue.
- PWA : page panel, planning, maison, routines, tags ; écran de verrouillage ; raccourcis d'app (manifest) ; pastille d'icône (Badging API) pour les actions en attente.

## Phases

1. **Planning** : niveaux de risque `direct` / `confirm` et journal d'activité, rappels natifs, échéances automatiques, résumé quotidien, panel v1 (agenda, rappels, actions, drive, agent), pastille d'icône.
   *Terminé quand* : « rappelle-moi de payer le plombier la veille à 9h » produit un push à l'heure exacte sur iPhone et Android.
2. **Sécurité** : passkeys, verrouillage de l'app, niveau `sensitive` (vérification passkey récente exigée côté serveur).
   *Terminé quand* : connexion par Face ID / empreinte, et une action `sensitive` est refusée sans vérification passkey récente.
3. **Maison** : connecteur Hue (OAuth + appairage), section Maison du panel, outil `control_lights` de l'agent.
   *Terminé quand* : « éteins le salon » éteint les lampes sans validation, même PC éteint (panel) ou PC allumé (agent).
4. **Routines et NFC** : routines, déclencheurs (tag, heure, panel, agent), tags NFC (écriture Android, URL sur iPhone), journal d'activité.
   *Terminé quand* : taper le tag « Je pars » éteint les lampes et affiche le récap du jour sur les deux téléphones.

## Compatibilité

| Fonctionnalité | Android / desktop | iPhone (PWA installée, iOS 16.4+) |
|---|---|---|
| Push, rappels, résumé | ✅ | ✅ |
| Boutons dans les notifications | ✅ | ❌ → carte dans l'app |
| Pastille d'icône | ✅ | ✅ |
| Passkeys / biométrie | ✅ | ✅ |
| Lecture d'un tag NFC (URL) | ✅ | ✅ (iPhone XS et +) |
| Écriture d'un tag depuis l'app | ✅ (Chrome) | ❌ → URL à copier dans une app NFC |

## Hors périmètre (pour l'instant)

- Autres marques domotiques (Matter, Home Assistant) : l'architecture MCP le permettra plus tard.
- Géolocalisation / géofencing (non disponible en arrière-plan pour une PWA).
- Commande vocale (prévue séparément : dictée transcrite en local par l'agent).
