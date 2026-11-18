import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signUp, uploadText } from './account';

/**
 * La PWA vérifiée dans un vrai Chromium, contre le build de production : manifeste, service worker, mises à jour,
 * hors ligne, push, partage vers l'app, file d'envoi, installation, nettoyage à la déconnexion, pastille de l'icône.
 * Les tests sans écriture tournent aussi contre la prod (`E2E_READONLY=1`).
 */
const readonly = Boolean(process.env.E2E_READONLY);

// Le Chromium complet plutôt que le « headless shell » par défaut : ce dernier refuse toujours la permission des notifications.
test.use({ channel: 'chromium' });

interface ManifestImage { src: string; sizes: string; type?: string; purpose?: string; form_factor?: string; label?: string }
interface Manifest {
  id: string; name: string; short_name: string; start_url: string; scope: string; display: string; lang: string;
  display_override: string[]; categories: string[]; launch_handler: { client_mode: string[] };
  icons: ManifestImage[];
  shortcuts: { name: string; url: string; icons: ManifestImage[] }[];
  screenshots: ManifestImage[];
  share_target: { action: string; method: string; enctype: string; params: { files: { name: string; accept: string[] }[] } };
  file_handlers: { action: string; accept: Record<string, string[]> }[];
}

const passwordInput = (page: Page) => page.locator('input[autocomplete$="-password"]');

/** Attend que le service worker soit actif et contrôle la page (sans rechargement, grâce à `clientsClaim`). */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
}

/** Dimensions d'une image décodée par le navigateur (PNG comme WebP). */
async function imageSize(page: Page, src: string): Promise<string> {
  return page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return `${image.naturalWidth}x${image.naturalHeight}`;
  }, src);
}

/**
 * Icône sur fond plein : coins opaques, et rayon occupé par le pictogramme (pixels différents du fond),
 * en fraction de la taille. Pour une icône maskable, il doit rester dans le cercle de sécurité (40 %).
 */
async function iconGeometry(page: Page, src: string): Promise<{ opaqueCorners: boolean; radius: number }> {
  return page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = image.naturalWidth;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, size, size);
    const pixel = (x: number, y: number) => data.slice((y * size + x) * 4, (y * size + x) * 4 + 4);
    const background = pixel(0, 0);
    const corners = [pixel(0, 0), pixel(size - 1, 0), pixel(0, size - 1), pixel(size - 1, size - 1)];
    let radius = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [r, g, b] = pixel(x, y);
        if (Math.abs(r! - background[0]!) + Math.abs(g! - background[1]!) + Math.abs(b! - background[2]!) > 60) {
          radius = Math.max(radius, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / size);
        }
      }
    }
    return { opaqueCorners: corners.every((corner) => corner[3] === 255), radius };
  }, src);
}

test.describe('manifeste', () => {
  test('lié depuis l’app et le site public, avec l’icône iOS', async ({ page }) => {
    for (const path of ['/login', '/']) {
      await page.goto(path);
      await expect(page.locator('link[rel="manifest"]'), path).toHaveAttribute('href', '/manifest.webmanifest');
      await expect(page.locator('meta[name="apple-mobile-web-app-title"]'), path).toHaveAttribute('content', 'DashIA');
    }
    const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(await imageSize(page, appleIcon!)).toBe('180x180');
    // iOS refuse la transparence (fond noir) : l'icône doit être pleine jusqu'aux coins.
    expect((await iconGeometry(page, appleIcon!)).opaqueCorners).toBe(true);
  });

  test('complet : identité, affichage, icônes, raccourcis, captures, partage, fichiers', async ({ page, request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json() as Manifest;
    expect(manifest).toMatchObject({ id: '/panel', name: 'DashIA', short_name: 'DashIA', start_url: '/panel', scope: '/', display: 'standalone', lang: 'fr' });
    expect(manifest.display_override).toContain('standalone');
    expect(manifest.launch_handler.client_mode).toContain('focus-existing');
    expect(manifest.categories).toContain('productivity');
    await page.goto('/login');

    // Icônes : servies à la taille annoncée, 192 et 512 « any » (critères d'installation de Chrome) et « maskable ».
    for (const icon of manifest.icons.filter((item) => item.type === 'image/png')) {
      expect(await imageSize(page, icon.src), icon.src).toBe(icon.sizes);
    }
    const sizesFor = (purpose: string) => manifest.icons.filter((icon) => (icon.purpose ?? 'any') === purpose).map((icon) => icon.sizes);
    expect(sizesFor('any')).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(sizesFor('maskable')).toEqual(['192x192', '512x512']);
    // Une vraie icône maskable, pas l'icône normale réutilisée : fond plein et pictogramme dans la zone sûre.
    for (const icon of manifest.icons.filter((item) => item.purpose === 'maskable')) {
      const { opaqueCorners, radius } = await iconGeometry(page, icon.src);
      expect(opaqueCorners, icon.src).toBe(true);
      expect(radius, icon.src).toBeLessThanOrEqual(0.4);
    }

    // Raccourcis : de vraies pages de l'app, chacune avec son icône.
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(['/chat', '/drive', '/maison', '/planning']);
    for (const shortcut of manifest.shortcuts) {
      expect((await request.get(shortcut.url)).status(), shortcut.url).toBe(200);
      expect(await imageSize(page, shortcut.icons[0]!.src), shortcut.url).toBe('96x96');
    }

    // Captures pour la fenêtre d'installation : au moins une mobile et une ordinateur, à la taille annoncée.
    expect(new Set(manifest.screenshots.map((screenshot) => screenshot.form_factor))).toEqual(new Set(['narrow', 'wide']));
    for (const screenshot of manifest.screenshots) {
      expect(screenshot.label, screenshot.src).toBeTruthy();
      expect(await imageSize(page, screenshot.src), screenshot.src).toBe(screenshot.sizes);
    }

    // Partage depuis le téléphone et « Ouvrir avec » sur ordinateur.
    expect(manifest.share_target).toMatchObject({ action: '/partage', method: 'POST', enctype: 'multipart/form-data' });
    expect(manifest.share_target.params.files[0]!.accept).toEqual(expect.arrayContaining(['application/pdf', 'image/jpeg', '.pdf']));
    expect(manifest.file_handlers[0]).toMatchObject({ action: '/drive', accept: { 'application/pdf': ['.pdf'] } });
  });
});

test.describe('service worker', () => {
  test('le service worker et le manifeste ne sont jamais servis depuis un cache', async ({ request }) => {
    // Sinon un cache intermédiaire (Cloudflare) sert l'ancien service worker après un déploiement, et son installation échoue.
    for (const path of ['/sw.js', '/manifest.webmanifest']) {
      const headers = (await request.get(path)).headers();
      if (headers['cf-cache-status']) {
        // Derrière Cloudflare, l'en-tête vu par le navigateur est réécrit par le réglage « Browser Cache TTL » de la zone
        // (sans effet sur `sw.js` : le navigateur le revérifie toujours). Ce qui compte : jamais une copie servie par le cache
        // de Cloudflare sans demander au serveur (HIT, STALE…), seulement REVALIDATED, EXPIRED, MISS ou DYNAMIC.
        expect(['REVALIDATED', 'EXPIRED', 'MISS', 'DYNAMIC', 'BYPASS'], path).toContain(headers['cf-cache-status']);
      } else {
        expect(headers['cache-control'], path).toBe('no-cache');
      }
    }
  });

  test('s’enregistre, s’active, contrôle la page et sert l’app depuis le précache', async ({ page }) => {
    await page.goto('/login');
    await waitForServiceWorker(page);
    expect(await page.evaluate(async () => (await caches.keys()).some((name) => name.startsWith('workbox-precache')))).toBe(true);

    // Au rechargement, les scripts de l'app viennent du précache, pas du réseau.
    const scripts: boolean[] = [];
    page.on('response', (response) => {
      if (new URL(response.url()).pathname.startsWith('/_nuxt/') && response.url().endsWith('.js')) scripts.push(response.fromServiceWorker());
    });
    await page.reload();
    await waitForServiceWorker(page);
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.every(Boolean)).toBe(true);
  });

  test('hors ligne, une page jamais visitée s’ouvre quand même (shell en cache)', async ({ page, context }) => {
    await page.goto('/login');
    await waitForServiceWorker(page);
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/panel', { cacheName: 'pages' })))).toBe(true);

    await context.setOffline(true);
    await page.goto('/planning');
    await expect(page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible();
    await context.setOffline(false);
  });

  test('une nouvelle version attend le clic sur « Recharger » au lieu de recharger la page d’office', async ({ page }) => {
    // Comme un utilisateur qui revient : la page est déjà servie par le service worker installé.
    await page.goto('/login');
    await waitForServiceWorker(page);
    await page.reload();
    await waitForServiceWorker(page);
    // Nouvelle version simulée : le même service worker publié à une autre adresse. Le navigateur le traite comme une mise à jour
    // (Playwright ne peut pas intercepter le téléchargement du script d'un service worker pour en changer les octets).
    await page.evaluate(async () => {
      (window as unknown as { marker: boolean }).marker = true;
      await navigator.serviceWorker.register('/sw.js?version=2', { scope: '/' });
    });

    const toast = page.getByRole('status').filter({ hasText: 'Nouvelle version disponible' });
    await expect(toast).toBeVisible();
    // Pas de rechargement d'office : la page (et ce qui y était saisi) est toujours là, la version attend.
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.waiting?.scriptURL)).toContain('version=2');

    // La nouvelle version prend la main, puis la page se recharge pour l'utiliser.
    await Promise.all([page.waitForEvent('load'), toast.getByRole('button', { name: 'Recharger' }).click()]);
    expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBeUndefined();
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toContain('version=2');
  });
});

test.describe('notifications push', () => {
  /** Simule un push par le protocole DevTools (il faut l'identifiant de l'enregistrement du service worker). */
  async function pushTo(context: BrowserContext, page: Page, payload: unknown): Promise<void> {
    const cdp = await context.newCDPSession(page);
    const origin = new URL(page.url()).origin;
    const registrationId = new Promise<string>((resolve) => {
      cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
        const registration = registrations.find((item) => item.scopeURL === `${origin}/` && !item.isDeleted);
        if (registration) resolve(registration.registrationId);
      });
    });
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId: await registrationId, data: JSON.stringify(payload) });
  }

  async function notifications(page: Page) {
    return page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications())
      .map((notification) => ({
        title: notification.title,
        body: notification.body,
        tag: notification.tag,
        actions: (notification as Notification & { actions?: { action: string; title: string }[] }).actions?.map(({ action, title }) => ({ action, title })) ?? [],
      })));
  }

  test.beforeEach(async ({ context, page }) => {
    await context.grantPermissions(['notifications']);
    await page.goto('/login');
    await waitForServiceWorker(page);
  });

  test('un push affiche la notification', async ({ context, page }) => {
    await pushTo(context, page, { title: 'Fichier analysé', body: 'facture.pdf est prêt.', url: '/drive', tag: 'file-1' });
    await expect.poll(() => notifications(page)).toEqual([{ title: 'Fichier analysé', body: 'facture.pdf est prêt.', tag: 'file-1', actions: [] }]);
  });

  test('une demande de confirmation a Valider / Refuser, et « Valider » envoie la décision', async ({ context, page }) => {
    test.skip(readonly, 'la décision est un POST : pas en prod');
    const decisions: unknown[] = [];
    // Interceptée au niveau du contexte : la requête part du service worker, pas de la page.
    await context.route('**/api/actions/*/decision', async (route) => {
      decisions.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ json: { action: { status: 'executed' } } });
    });
    await pushTo(context, page, {
      title: 'Ajouter un événement ?', body: 'Dentiste jeudi 10 h', url: '/actions/act-1', tag: 'action-act-1',
      action: { id: 'act-1', token: 'jeton-unique' },
    });
    await expect.poll(() => notifications(page)).toEqual([expect.objectContaining({
      tag: 'action-act-1',
      actions: [{ action: 'approve', title: 'Valider' }, { action: 'reject', title: 'Refuser' }],
    })]);

    // Aucun navigateur sans écran ne permet de cliquer une notification : on rejoue l'événement dans le service worker.
    const [worker] = context.serviceWorkers();
    await worker!.evaluate(async () => {
      const scope = self as unknown as {
        registration: { getNotifications(filter: { tag: string }): Promise<unknown[]> };
        dispatchEvent(event: Event): boolean;
        NotificationEvent: new (type: string, init: { notification: unknown; action: string }) => Event;
      };
      const [notification] = await scope.registration.getNotifications({ tag: 'action-act-1' });
      const event = new scope.NotificationEvent('notificationclick', { notification, action: 'approve' });
      // `waitUntil` est réservé aux événements du navigateur : on récupère la promesse pour l'attendre ici.
      const pending: Promise<unknown>[] = [];
      Object.defineProperty(event, 'waitUntil', { value: (promise: Promise<unknown>) => pending.push(promise) });
      scope.dispatchEvent(event);
      await Promise.all(pending);
    });

    expect(decisions).toEqual([{ url: '/api/actions/act-1/decision', body: { decision: 'approve', token: 'jeton-unique' } }]);
    await expect.poll(() => notifications(page)).toEqual([expect.objectContaining({ title: 'Action traitée', body: "C'est fait : l'action a été exécutée." })]);
  });
});

test.describe('avec un compte', () => {
  test.skip(readonly, 'crée un compte : pas en prod');

  test('hors ligne : le shell et l’historique restent consultables', async ({ page, context, baseURL }) => {
    await signUp(page, baseURL!);
    await uploadText(page, baseURL!, 'releve-hors-ligne.txt', 'Relevé de compte de novembre.');
    const created = await page.request.post('/api/conversations', { headers: { origin: new URL(baseURL!).origin }, data: { content: 'Question posée avant la coupure' } });
    expect(created.ok()).toBe(true);
    const { conversationId } = await created.json() as { conversationId: string };

    // Une visite en ligne, une fois le service worker aux commandes, remplit les caches.
    await page.goto('/drive');
    await waitForServiceWorker(page);
    await page.reload();
    await expect(page.getByText('releve-hors-ligne.txt')).toBeVisible();
    await page.goto(`/chat/${conversationId}`);
    // La conversation dans la liste de l'historique, et son message.
    await expect(page.getByText('Question posée avant la coupure')).toHaveCount(2);

    await context.setOffline(true);
    await page.goto('/drive');
    await expect(page.getByRole('status').filter({ hasText: 'Vous êtes hors ligne' })).toBeVisible();
    await expect(page.getByText('releve-hors-ligne.txt')).toBeVisible();
    await page.goto(`/chat/${conversationId}`);
    await expect(page.getByText('Question posée avant la coupure')).toHaveCount(2);
    await context.setOffline(false);
  });

  test('un message écrit hors ligne attend, puis part au retour du réseau', async ({ page, context, baseURL }) => {
    await signUp(page, baseURL!);
    const created = await page.request.post('/api/conversations', { headers: { origin: new URL(baseURL!).origin }, data: { content: 'Première question' } });
    const { conversationId } = await created.json() as { conversationId: string };
    await page.goto(`/chat/${conversationId}`);
    await waitForServiceWorker(page);
    await page.reload();
    await expect(page.getByText('Première question')).toHaveCount(2);

    await context.setOffline(true);
    await page.getByPlaceholder('Écrire à l’agent…').fill('Écrit dans le métro');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    const queued = page.getByTestId('outbox-message');
    await expect(queued).toContainText('Écrit dans le métro');
    await expect(queued).toContainText('En attente d’envoi');
    // Gardé sur l'appareil : il survit à un rechargement hors ligne.
    await page.reload();
    await expect(queued).toContainText('Écrit dans le métro');

    await context.setOffline(false);
    await expect(queued).toHaveCount(0);
    await expect(page.getByText('Écrit dans le métro')).toBeVisible();
    const { conversation } = await (await page.request.get(`/api/conversations/${conversationId}`)).json() as { conversation: { messages: { content: string }[] } };
    expect(conversation.messages.map((message) => message.content)).toEqual(['Première question', 'Écrit dans le métro']);
  });

  test('un fichier partagé vers DashIA arrive dans le drive, même s’il faut d’abord se connecter', async ({ page, baseURL }) => {
    const { email, password } = await signUp(page, baseURL!);
    await page.goto('/drive');
    await waitForServiceWorker(page);
    await page.context().clearCookies();

    // Le partage du système : un formulaire POST multipart vers `share_target.action`, intercepté par le service worker.
    await page.evaluate(() => {
      const form = Object.assign(document.createElement('form'), { method: 'POST', action: '/partage', enctype: 'multipart/form-data' });
      const input = Object.assign(document.createElement('input'), { type: 'file', name: 'files' });
      const transfer = new DataTransfer();
      transfer.items.add(new File(['Ordonnance du docteur, à renouveler en mars.'], 'ordonnance-partagee.txt', { type: 'text/plain' }));
      input.files = transfer.files;
      form.append(input);
      document.body.append(form);
      form.submit();
    });
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === '/drive?partage=1');

    const uploaded = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/files');
    await page.getByLabel('E-mail').fill(email);
    await passwordInput(page).fill(password);
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    expect((await uploaded).status()).toBeLessThan(300);
    await expect(page).toHaveURL(/\/drive$/);
    await page.reload();
    await expect(page.getByText('ordonnance-partagee.txt')).toBeVisible();
    // Repris une seule fois : la file de l'appareil est vide.
    expect(await page.evaluate(async () => (await (await caches.open('shared-files')).keys()).length)).toBe(0);
  });

  test('la déconnexion vide les caches et la file d’envoi de l’utilisateur', async ({ page, baseURL }) => {
    await signUp(page, baseURL!);
    await page.goto('/plus');
    await waitForServiceWorker(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    const userData = () => page.evaluate(async () => {
      const count = async (name: string) => (await (await caches.open(name)).keys()).length;
      return {
        api: await count('api-history'),
        shared: await count('shared-files'),
        outbox: Object.keys(localStorage).filter((key) => key.startsWith('dashia-outbox:')).length,
      };
    });
    await page.evaluate(async () => {
      await (await caches.open('shared-files')).put('/__shared-files/1-0000', new Response('partagé, pas encore déposé'));
      localStorage.setItem('dashia-outbox:compte', '[]');
    });
    await expect.poll(async () => (await userData()).api).toBeGreaterThan(0);
    expect(await userData()).toMatchObject({ shared: 1, outbox: 1 });

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect.poll(userData).toEqual({ api: 0, shared: 0, outbox: 0 });
  });

  test('la pastille de l’icône suit le nombre d’actions à valider', async ({ page, context, baseURL }) => {
    await page.addInitScript(() => {
      const calls: unknown[] = [];
      (window as unknown as { badgeCalls: unknown[] }).badgeCalls = calls;
      Object.assign(navigator, {
        setAppBadge: async (count?: number) => { calls.push(['set', count]); },
        clearAppBadge: async () => { calls.push(['clear']); },
      });
    });
    await signUp(page, baseURL!);
    let pending = 2;
    await context.route(/\/api\/actions\?status=pending$/, (route) => route.fulfill({
      json: { actions: Array.from({ length: pending }, (_, index) => ({ id: `act-${index}` })) },
    }));
    const badgeCalls = () => page.evaluate(() => (window as unknown as { badgeCalls: unknown[] }).badgeCalls);

    await page.goto('/panel');
    await expect.poll(badgeCalls).toContainEqual(['set', 2]);
    pending = 0;
    await page.reload();
    await expect.poll(badgeCalls).toContainEqual(['clear']);
  });

  test('« Installer l’application » utilise l’invite du navigateur', async ({ page, baseURL }) => {
    await signUp(page, baseURL!);
    await page.goto('/settings');
    await expect(page.getByText('Menu du navigateur, puis « Installer DashIA »')).toBeVisible();

    // Chrome fournit l'invite (`beforeinstallprompt`) quand l'app est installable : on la simule.
    await page.evaluate(() => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => { (window as unknown as { prompted: boolean }).prompted = true; },
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });
    await page.getByRole('button', { name: 'Installer', exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  });

  test('sur iPhone, la marche à suivre remplace l’invite, et rien n’est proposé une fois installée', async ({ browser, baseURL }) => {
    const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 15'];
    const context = await browser.newContext({ baseURL, userAgent, viewport, deviceScaleFactor, isMobile, hasTouch, locale: 'fr-FR' });
    const page = await context.newPage();
    await signUp(page, baseURL!);
    await page.goto('/settings');
    await expect(page.getByText('Touchez Partager, puis « Sur l’écran d’accueil »')).toBeVisible();

    // Ouverte depuis l'écran d'accueil : Safari pose `navigator.standalone`.
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Application' })).toBeVisible();
    await expect(page.getByText('Installer l’application')).toHaveCount(0);
    await context.close();
  });
});
