export interface Me {
  user: { id: string; email: string; name: string };
  isAdmin: boolean;
  quota: { usedBytes: number; maxBytes: number };
}

export function useMe() {
  const me = useState<Me | null>('me', () => null);

  async function refresh() {
    me.value = await $fetch<Me>('/api/me');
    return me.value;
  }

  return { me, refresh };
}
