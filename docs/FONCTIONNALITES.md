# Fonctionnalités et écrans — référence pour la maquette

Inventaire de tous les écrans, composants et états de l'app, actuels et prévus (voir [`SCOPE.md`](SCOPE.md) pour les phases).

> **État au 22/10/2026** : les phases 1 à 4 sont livrées et l'interface suit la maquette Figma DashIA (mobile + adaptation desktop). Les marqueurs 🔜 ci-dessous correspondent donc à des fonctionnalités désormais disponibles, sauf Wake-on-LAN et le déclencheur par lieu.

**Légende** : ✅ existe déjà · 🔜1 phase 1 Planning · 🔜2 phase 2 Sécurité · 🔜3 phase 3 Maison · 🔜4 phase 4 Routines & NFC · 💡 proposition (non décidée)

**À maquetter pour chaque écran** : mobile (prioritaire, 390 px) et desktop (≥ 1024 px), thème clair et sombre, et les états listés (vide, chargement, erreur, hors ligne).

---

## 0. Structure globale

### Navigation
- 💡 **Mobile : barre d'onglets en bas** (5 max) : Accueil · Discussions · Drive · Maison · Plus (Planning, Actions, Routines, Tags, Réglages, Admin). Aujourd'hui ✅ : barre horizontale en haut, à revoir pour le mobile.
- **Desktop** : barre latérale ou en-tête avec les mêmes entrées.
- Pastille rouge sur « Actions » avec le nombre d'actions à valider ✅.

### En-tête (toutes les pages connectées)
- Logo + nom de l'app (nom à définir) ✅
- **État de l'agent** : « Agent en ligne » (vert) / « Agent hors ligne » (orange) / inconnu (gris) ✅
- **Jauge de stockage** : barre + « 120 Mo / 500 Mo », orange ≥ 85 %, rouge à 100 % ✅
- Accès rapide déconnexion ✅ (à déplacer dans un menu compte sur mobile 💡)

### Bandeaux et retours système
- **Hors ligne** : « Vous êtes hors ligne : l'historique reste consultable… » ✅
- **Serveur injoignable** (appareil en ligne, serveur arrêté) ✅
- **Agent hors ligne** dans une discussion : « La demande sera traitée dès sa reconnexion » ✅
- 💡 **Toasts** (confirmation courte) : « Fichier supprimé », « Salon éteint », « Rappel créé » avec bouton « Annuler » pour les actions directes 🔜1
- 💡 **Invitation à installer l'app** (bouton « Installer » quand le navigateur le propose ; sur iPhone, mini-tutoriel « Partager → Sur l'écran d'accueil »)

### Écran de verrouillage 🔜2
- Plein écran, flouté sur l'app : logo, « App verrouillée », bouton **Déverrouiller avec Face ID / empreinte**, lien « Utiliser le mot de passe ».
- Affiché à la réouverture après N minutes d'inactivité (option).

### Éléments liés à l'installation
- Icône d'app (actuelle : carré indigo, symbole cible) ✅ — à redessiner si besoin (192, 512, version « maskable »)
- **Pastille sur l'icône** : nombre d'actions à valider 🔜1
- **Raccourcis** (appui long sur l'icône) : « Nouvelle question », « Ajouter un document », « Planning » 🔜1
- Écran de lancement (couleur de fond + icône) ✅

---

## 1. Authentification

### Connexion ✅
- Email, mot de passe, bouton « Se connecter », lien « Créer un compte ».
- 🔜2 Bouton **« Se connecter avec Face ID / empreinte »** (passkey), mis en avant.
- États : erreur « Email ou mot de passe incorrect », chargement, trop de tentatives (« Réessayez dans un instant »).
- 💡 Mot de passe oublié (nécessite l'envoi d'emails, non prévu).

### Inscription ✅
- Nom, email, mot de passe (10 caractères min., indication sous le champ).
- États : email déjà utilisé, mot de passe trop court.

### Onboarding après inscription 💡
Suite de 3-4 cartes passables : 1) installer l'app, 2) activer les notifications, 3) ajouter un premier document, 4) connecter Google Agenda / Hue. Avec progression (« 2/4 ») et « Plus tard ».

---

## 2. Panel — page d'accueil 🔜1 (Maison 🔜3, Routines 🔜4)

Grille de blocs (1 colonne mobile, 2-3 colonnes desktop) :

| Bloc | Contenu | Actions |
|---|---|---|
| **Barre de commande** | Champ « Demandez quelque chose à votre agent… » | Envoyer → ouvre la discussion |
| **Aujourd'hui** | Événements du jour (heure, titre, lieu), rappels, échéances (« Facture Plomberie Martin — 340,50 € — dans 3 jours ») | Voir le planning, marquer un rappel comme fait |
| **À valider** | 1-3 cartes d'action compactes + « Voir tout (5) » | Valider / Refuser |
| **Maison** 🔜3 | Pièces avec état (allumé/éteint), 3-4 scènes favorites | Tap = on/off, tap scène = activer |
| **Routines** 🔜4 | Boutons « Je pars », « Bonne nuit »… | Lancer |
| **Documents récents** | 3 derniers fichiers avec statut d'analyse | Ouvrir le drive |
| **Agent** | En ligne / hors ligne, tâches en cours (« Analyse de bail.pdf… »), file d'attente | — |
| **Activité récente** 🔜1 | 3 dernières actions directes (« Salon éteint par la routine Je pars, 22:14 ») | Voir le journal |

États : premier usage (blocs vides avec invitations : « Ajoutez un document », « Connectez Google Agenda »), agent hors ligne, hors ligne (données en cache + date « Mis à jour il y a 2 h »).

---

## 3. Discussions

### Liste des discussions ✅
- Zone « Que cherchez-vous ? » + champ de saisie (crée une discussion) ✅
- Liste : titre (premier message), date relative (« il y a 5 min »), supprimer (confirmation) ✅
- 💡 Recherche dans les discussions, épingler.
- État vide : « Aucune discussion pour l'instant. »

### Conversation ✅
- **Bulles** : utilisateur (à droite, couleur primaire), agent (à gauche, Markdown simple : gras, listes, code) ✅
- **Statut d'un message** : « En attente de l'agent… » (en file), « L'agent n'a pas pu répondre » + bouton **Réessayer** ✅
- **Timeline de l'agent** sous chaque question ✅ :
  - pendant le traitement : indicateur animé + étape en cours (« Recherche par le sens « Plomberie Martin » ») ;
  - ensuite repliée : « 4 étape(s) de l'agent » ▸, dépliable ;
  - types d'étape : Réflexion (texte en italique), appel d'outil (Liste des fichiers, Lecture d'un fichier, Recherche par le sens, Recherche exacte, Proposition d'événement, Contrôle des lampes 🔜3, Création de rappel 🔜1), résultat (« 1 résultat(s) »), erreur.
- 💡 **Carte d'action dans la discussion** quand l'agent propose une action (au lieu de seulement « une demande vous a été envoyée ») : résumé + Valider / Refuser.
- 💡 **Confirmation d'action directe** dans la discussion : « 💡 Salon éteint » avec « Annuler ».
- 💡 **Sources cliquables** : nom du document cité → ouvre sa fiche dans le drive.
- 💡 Suggestions de questions (puces) pour une discussion vide.
- **Zone de saisie** : texte multiligne (Entrée = envoyer, Maj+Entrée = retour à la ligne), 4 000 caractères max, bouton Envoyer ✅ · 💡 bouton micro (dictée, hors périmètre pour l'instant).
- États : agent hors ligne (bandeau), hors ligne (envoi impossible), trop de messages (« Réessayez dans une minute »), discussion introuvable.

---

## 4. Drive

### Liste ✅
- En-tête « Mon drive » + **jauge de stockage détaillée** ✅
- **Zone de dépôt** : glisser-déposer ou cliquer ; « PDF, TXT, Markdown, DOCX · 50 Mo max par fichier · 499 Mo disponibles » ✅
- Pendant l'envoi : « Envoi de facture.pdf… » ✅ · 💡 barre de progression par fichier, envoi multiple listé.
- Erreurs : format non pris en charge, fichier > 50 Mo, espace insuffisant (« 30 Mo pour 12 Mo disponibles »), drive plein ✅
- **Carte fichier** ✅ : nom, taille, date d'ajout, type de document détecté (puce « facture »), statut :
  - « En attente de l'agent » (orange), « Analyse en cours » (animé), « Analysé » (vert), « Échec » (rouge, avec message) ;
  - résumé (2-4 phrases) ;
  - « Voir les informations clés (5) » → dates 📅, montants 💶, noms 👤 ;
  - suggestions de l'agent (boutons, ex. « Ajouter l'échéance au calendrier ») → ouvre une question pré-remplie ✅ · 🔜1 bouton direct **« Me le rappeler »** sur chaque date ;
  - Réanalyser, Supprimer (confirmation « Son contenu indexé sera aussi effacé ») ✅
- 💡 Recherche / filtre par type de document, tri (date, taille, nom).
- 💡 Aperçu du fichier (PDF dans le navigateur), téléchargement.
- État vide : « Aucun fichier. Déposez un document : l'agent l'analysera automatiquement. » ✅
- 💡 Android : recevoir un fichier via le menu **Partager** d'une autre app (non disponible sur iPhone).

---

## 5. Planning 🔜1

### Vues
- **Liste chronologique** (mobile par défaut) : regroupée par jour (« Aujourd'hui », « Demain », « Jeudi 26 novembre »).
- **Semaine** et **mois** (desktop) 💡.
- Trois types d'éléments, visuellement distincts (couleur + icône) :
  - **Événement Google Agenda** (heure début-fin, titre, lieu) ;
  - **Rappel** (heure, texte, ✓ fait) ;
  - **Échéance** détectée dans un document (montant, document source).
- Filtre par type.

### Rappels
- **Créer** : texte, date, heure (raccourcis : « Dans 1 h », « Ce soir », « Demain 9h »), lien optionnel vers un document.
- **Détail** : modifier, reporter, marquer comme fait, supprimer.
- Le rappel déclenche une notification push (voir § 12).

### Résumé quotidien
- Réglage (dans Réglages) : activé/désactivé + heure d'envoi.

États : Google non connecté (bloc « Connectez Google Agenda pour voir vos événements »), aucun élément (« Rien de prévu »).

---

## 6. Actions

### Liste ✅
- « Actions proposées » + texte « Rien n'est modifié sans votre accord… » ✅
- **À valider** (en haut) puis **Historique** ✅
- 🔜1 Onglet ou filtre **Journal d'activité** (actions directes : lampes, rappels).

### Carte d'action ✅
- Résumé (« Ajouter « Réunion projet Hélios » à Google Agenda le jeudi 26 novembre 2026 à 14:00 »)
- Statut : À valider (orange), Validée, Refusée, Expirée, Exécutée (vert), Échec (rouge) ✅
- Détail selon le type : pour un événement → titre, quand, lieu, description ✅
- « Expire dans 12 minutes. Sans validation, rien ne sera fait. » ✅ · 💡 compte à rebours visuel
- Boutons Valider / Refuser, lien « Voir la discussion » ✅
- Lien « Voir dans Google Agenda » après exécution ✅
- Erreur (ex. « Connectez Google Agenda dans les réglages, puis validez à nouveau ») ✅
- 🔜2 **Niveau de risque** affiché (puce « Sensible ») ; le bouton devient **« Valider avec Face ID »**.

### Page de confirmation (ouverte depuis une notification) ✅
- Une seule carte, centrée. Indispensable sur iPhone (pas de boutons dans les notifications).

---

## 7. Maison 🔜3

- **Non connecté** : présentation + bouton « Connecter Philips Hue » → écrans Philips → retour « Appuyez sur le bouton du pont Hue » (illustration du pont) → « Connecté ».
- **Pièces** (Salon, Chambre…) : interrupteur global, luminosité (curseur), nombre de lampes allumées.
- **Détail d'une pièce** : chaque lampe (on/off, luminosité, couleur / température si la lampe le permet).
- **Scènes** : grille de vignettes (nom + couleur dominante), tap = activer.
- Retour immédiat : état mis à jour + toast « Salon éteint » avec « Annuler ».
- États : pont injoignable (« Votre pont Hue ne répond pas »), lampe injoignable (grisée), chargement de l'état.

---

## 8. Routines 🔜4

### Liste
- Cartes : nom, icône/emoji, déclencheurs (puces : 🏷️ Tag, ⏰ 22:30, 💬 « lance Bonne nuit »), résumé des actions, niveau de risque, bouton **Lancer**, interrupteur actif/inactif.
- **Modèles** proposés : Je pars, Je rentre, Bonne nuit, Mode travail.

### Création / édition (formulaire en étapes)
1. **Nom** + icône.
2. **Déclencheurs** (un ou plusieurs) : tag NFC (choisir/ajouter), heure + jours de la semaine, bouton du panel, phrase pour l'agent.
3. **Actions** (liste ordonnable) : scène Hue, pièce on/off, rappel, question à l'agent (réponse en push), ouvrir un document / une page.
4. **Récapitulatif** : niveau de risque calculé (« Directe » / « Demande une validation »), bouton Tester.

### Exécution
- Retour : « Je pars — 3 actions effectuées » avec détail (✓ lampes éteintes, ✓ récap envoyé).
- Échec partiel : « 2/3 actions effectuées — pont Hue injoignable ».

---

## 9. Tags NFC 🔜4

### Liste des tags
- Nom (« Entrée », « Chevet »), routine associée, date d'ajout, dernier usage, révoquer.

### Ajouter un tag
- **Android** : « Approchez un tag NFC du téléphone » (animation) → « Tag écrit ✓ » → choisir la routine.
- **iPhone** : l'URL du tag + bouton Copier + tutoriel en 3 étapes (installer une app d'écriture NFC, coller l'URL, approcher le tag).
- 💡 Option : imprimer un QR code équivalent (même URL) pour les appareils sans NFC.

### Écran de déclenchement (`/t/<id>`, ouvert par le tap)
Plein écran, gros pictogramme :
- « Je pars… » (en cours) → « Bonne journée ! 3 actions effectuées » (succès) ;
- « Confirmez avec Face ID » (routine sensible) 🔜2 ;
- « Ce tag n'est pas reconnu » / « Ce tag a été désactivé » ;
- Non connecté → connexion puis exécution.

---

## 10. Journal d'activité 🔜1

- Liste chronologique : action, déclencheur (agent, routine, tag, panel), heure, résultat.
- Ex. « 💡 Salon éteint — routine Je pars (tag Entrée) — 08:12 ».
- Bouton « Annuler » quand c'est possible (dernières minutes).

---

## 11. Réglages

### Notifications ✅ (+ 🔜1)
- Activer / désactiver sur cet appareil ✅ ; messages : navigateur non compatible, notifications bloquées, iPhone : installer l'app d'abord ✅
- 🔜1 Types de notifications (interrupteurs) : actions à valider, rappels, résumé quotidien (+ heure), document analysé, agent revenu en ligne.

### Sécurité 🔜2
- **Passkeys** : liste (nom de l'appareil, date), « Ajouter Face ID / empreinte sur cet appareil », supprimer.
- **Verrouillage de l'app** : interrupteur + délai (immédiat, 5 min, 15 min, 1 h).
- 💡 Sessions actives (appareils connectés), déconnexion à distance.

### Connecteurs ✅ (+ 🔜3)
- Google Agenda : état (Connecté il y a…, Non connecté, Non configuré sur le serveur), Connecter / Déconnecter ✅
- Philips Hue 🔜3 : même modèle + état du pont.
- Retour après connexion : « Google Agenda est connecté » / « Connexion annulée » / « La connexion a échoué » ✅

### Compte ✅
- Nom, email, texte de confidentialité, Se déconnecter, **Supprimer mon compte** (confirmation forte) ✅
- 💡 Modifier nom / mot de passe.

---

## 12. Notifications push (à maquetter comme des écrans)

| Notification | Titre / texte | Boutons (Android, desktop) | Clic sur le corps | Phase |
|---|---|---|---|---|
| Action à valider | « Action à valider » / résumé de l'action | Valider · Refuser | Page de confirmation | ✅ |
| Résultat de décision | « Action traitée » / « C'est fait » · « Action refusée » · erreur | — | Page de l'action | ✅ |
| Action sensible | « Validation requise » / résumé | aucun (Face ID impossible dans une notif) | Page de confirmation | 🔜2 |
| Rappel | « Rappel » / texte du rappel | Fait · +1 h | Planning | 🔜1 |
| Résumé quotidien | « Votre journée » / « 2 événements, 1 échéance, 1 action à valider » | — | Panel | 🔜1 |
| Document analysé | « bail.pdf est prêt » / type + 1 phrase | — | Fiche du document | 🔜1 |
| Agent de retour | « Agent en ligne » / « 3 demandes traitées » | — | Discussions | 🔜1 |
| Routine horaire exécutée | « Bonne nuit » / « Lampes éteintes » | Annuler | Journal | 🔜4 |

Sur iPhone : pas de boutons, seul le clic sur le corps existe → chaque notification doit mener à un écran où l'action est possible.

---

## 13. Administration ✅ (réservé aux emails admin)

- « Agents locaux » + puce « Embeddings exigés : bge-m3 ».
- **Nouvelle machine** : nom → « Générer une clé » → clé affichée une seule fois (copie).
- **Liste des clés** : nom, préfixe, état (En ligne avec modèle et tâches « 1/1 », Hors ligne « vu il y a 2 h », Révoquée), alerte « Embeddings incompatibles », bouton Révoquer (confirmation).

---

## 14. Catalogue des états à prévoir

| État | Où | Rendu actuel / attendu |
|---|---|---|
| Chargement | toutes les listes | 💡 squelettes (aujourd'hui : rien) |
| Vide | discussions, drive, actions, planning, routines, tags | texte + invitation à agir ✅ partiel |
| Hors ligne | partout | bandeau + données en cache ✅ |
| Serveur injoignable | partout | bandeau ✅ |
| Agent hors ligne | en-tête, discussion, drive (« En attente de l'agent ») | ✅ |
| Erreur | formulaires, actions | message en français, rouge ✅ |
| Stockage presque plein / plein | jauge, zone de dépôt | orange / rouge ✅ |
| Connecteur absent | planning, maison, actions | invitation à connecter ✅ partiel |
| Verrouillé | toute l'app | écran de verrouillage 🔜2 |

---

## 15. Repères visuels actuels (modifiables)

- Couleur principale : indigo `#4f46e5` (sombre : `#818cf8`) ; succès vert, attention orange, erreur rouge.
- Thème clair et sombre automatiques (selon le système).
- Police système, rayon 10 px (cartes), 16 px (bulles), puces arrondies.
- Textes de l'interface en français, ton direct et rassurant (« Rien n'est modifié sans votre accord »).

## Données d'exemple pour la maquette

- Documents : `facture.md` (Plomberie Martin, 340,50 €, échéance 15 novembre 2026), `bail.pdf` (loyer 850 €, Lyon), `reunion.docx` (projet Hélios, réunion 26 novembre 14h, salle Orion).
- Question type : « Combien je dois à Plomberie Martin et pour quand ? » → réponse sourcée + action « Ajouter un rappel la veille à 9h ».
- Pièces : Salon (3 lampes), Chambre (2), Bureau (1) ; scènes : Lecture, Détente, Concentration, Nuit.
- Routines : Je pars (tag Entrée), Bonne nuit (22:30 + tag Chevet), Mode travail (bouton).
