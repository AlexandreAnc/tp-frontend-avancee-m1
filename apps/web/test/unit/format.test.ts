import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../utils/format';

describe('renderMarkdown', () => {
  it("n'interprète jamais le HTML produit par le modèle", () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> **gras**');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>gras</strong>');
  });

  it('rend listes et code', () => {
    expect(renderMarkdown('- un\n- `deux`\n\n1. trois')).toBe('<ul><li>un</li><li><code>deux</code></li></ul><ol><li>trois</li></ol>');
  });
});
