export type ThemePreference = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'dashia-theme';

function apply(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

function read(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/** Apparence choisie sur cet appareil (Clair / Sombre / Auto selon le système). */
export function useTheme() {
  const theme = useState<ThemePreference>('theme', () => (import.meta.client ? read() : 'auto'));

  function setTheme(preference: ThemePreference) {
    theme.value = preference;
    apply(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  }

  return { theme, setTheme, applyStoredTheme: () => apply(read()) };
}
