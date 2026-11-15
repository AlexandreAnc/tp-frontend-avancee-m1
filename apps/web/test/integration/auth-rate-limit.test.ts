import { describe, expect, it } from 'vitest';
import { getAuth } from '../../server/utils/auth';
import { skipDb } from './helpers';

/** Requête telle que Caddy la transmet : IP du visiteur dans X-Real-IP, chaîne complète dans X-Forwarded-For. */
function request(path: string, ip: string, init: RequestInit = {}) {
  return getAuth().handler(new Request(`http://localhost:3000/api/auth${path}`, {
    ...init,
    headers: { 'x-real-ip': ip, 'x-forwarded-for': `${ip}, 172.70.1.1`, 'content-type': 'application/json', origin: 'http://localhost:3000' },
  }));
}

function signIn(ip: string) {
  return request('/sign-in/email', ip, { method: 'POST', body: JSON.stringify({ email: 'nobody@example.com', password: 'mauvais-mot-de-passe' }) });
}

// Non-régression du bug de prod : sans IP lisible, tous les visiteurs partageaient un seul compteur de 30 requêtes/min.
describe.skipIf(skipDb)('limite de débit de l’authentification', () => {
  it('laisse passer les vérifications de session au-delà de la limite stricte', async () => {
    const statuses = await Promise.all(Array.from({ length: 45 }, () => request('/get-session', '198.51.100.10').then((response) => response.status)));
    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  it('compte les tentatives de connexion par visiteur, pas pour tout le monde', async () => {
    const attacker = '198.51.100.20';
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 35; attempt++) statuses.push((await signIn(attacker)).status);
    expect(statuses).toContain(429);

    // Un autre visiteur derrière le même proxy n'est pas bloqué par le premier.
    expect((await signIn('198.51.100.21')).status).not.toBe(429);
  });
});
