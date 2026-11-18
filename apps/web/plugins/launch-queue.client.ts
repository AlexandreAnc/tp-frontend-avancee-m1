/**
 * Lancements de l'app installée quand une fenêtre est déjà ouverte (`launch_handler: focus-existing`, Chrome et Edge) :
 * - raccourci de l'icône (Discussions, Drive…) : la fenêtre existante va sur la page demandée ;
 * - « Ouvrir avec DashIA » sur un document (`file_handlers`, ordinateur) : il rejoint la file du drive, qui le dépose ;
 * - simple clic sur l'icône : on garde la page en cours (pas de retour forcé à l'accueil en pleine saisie).
 * Les autres navigateurs n'ont pas `launchQueue` : ils ouvrent une nouvelle fenêtre sur l'adresse, sans ce plugin.
 */
interface LaunchParams {
  targetURL?: string;
  files: readonly { getFile(): Promise<File> }[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

const START_URL = '/panel';

export default defineNuxtPlugin(() => {
  const launchQueue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  if (!launchQueue) return;
  const router = useRouter();

  launchQueue.setConsumer((params) => {
    void (async () => {
      if (params.files.length) {
        const files = await Promise.all(params.files.map((handle) => handle.getFile()));
        await storeSharedFiles(await caches.open(SHARED_FILES_CACHE), files);
        await navigateTo(SHARED_FILES_PAGE);
        return;
      }
      if (!params.targetURL) return;
      const target = new URL(params.targetURL);
      const path = `${target.pathname}${target.search}`;
      if (target.origin !== location.origin || target.pathname === START_URL || path === router.currentRoute.value.fullPath) return;
      await navigateTo(path);
    })();
  });
});
