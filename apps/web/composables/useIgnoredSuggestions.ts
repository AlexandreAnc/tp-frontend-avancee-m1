const STORAGE_KEY = 'dashia-ignored-suggestions';

/** Suggestions écartées sur cet appareil (confort : rien n'est perdu si le stockage est vidé). */
export function useIgnoredSuggestions() {
  const ignored = useState<Record<string, string[]>>('ignored-suggestions', () => {
    if (!import.meta.client) return {};
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, string[]>;
    } catch {
      return {};
    }
  });

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ignored.value));
    } catch {
      // Stockage indisponible : l'état vaut pour la session.
    }
  }

  return {
    has: (fileId: string, key: string) => ignored.value[fileId]?.includes(key) ?? false,
    add: (fileId: string, key: string) => {
      ignored.value = { ...ignored.value, [fileId]: [...(ignored.value[fileId] ?? []), key] };
      persist();
    },
  };
}
