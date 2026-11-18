import { ROUTINE_ICONS, routineInputSchema } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { ICONS } from '../../utils/icons';
import { ACTION_STATUS_LABELS, FILE_STATUS_LABELS, fileSubtitle } from '../../utils/labels';
import { describeDays, describeSchedule, ROUTINE_ICON_TONES, ROUTINE_TEMPLATES } from '../../utils/routines';

describe('fileSubtitle', () => {
  const base = { sizeBytes: 2048, createdAt: new Date().toISOString(), analysis: { documentType: 'Facture' } };

  it('affiche le type de document et la taille une fois analysé', () => {
    expect(fileSubtitle({ ...base, status: 'ready' })).toBe('Facture · 2 Ko');
    expect(fileSubtitle({ ...base, status: 'ready', analysis: null })).toBe('2 Ko');
  });

  it("affiche l'état d'avancement ou l'erreur", () => {
    expect(fileSubtitle({ ...base, status: 'processing' })).toBe('Analyse par votre agent…');
    expect(fileSubtitle({ ...base, status: 'pending' })).toBe("2 Ko · à l'instant");
    expect(fileSubtitle({ ...base, status: 'failed', error: 'PDF chiffré' })).toBe('PDF chiffré');
    expect(fileSubtitle({ ...base, status: 'failed' })).toBe("L'analyse a échoué");
  });

  it('a un libellé et une icône existante pour chaque statut', () => {
    for (const label of [...Object.values(FILE_STATUS_LABELS), ...Object.values(ACTION_STATUS_LABELS)]) {
      expect(label.label).not.toBe('');
      expect(ICONS[label.icon]).toBeDefined();
    }
  });
});

describe('routines (affichage)', () => {
  it('décrit les jours de façon lisible', () => {
    expect(describeDays([7, 1, 2, 3, 4, 5, 6])).toBe('tous les jours');
    expect(describeDays([5, 4, 3, 2, 1])).toBe('lun → ven');
    expect(describeDays([7, 6])).toBe('le week-end');
    expect(describeDays([3, 1])).toBe('lun, mer');
  });

  it('décrit une programmation, ou rien pour une routine manuelle', () => {
    expect(describeSchedule({ time: '07:30', days: [6, 7] })).toBe('07:30 · le week-end');
    expect(describeSchedule(null)).toBeNull();
  });

  it('propose des modèles valides pour le serveur', () => {
    for (const template of ROUTINE_TEMPLATES) {
      expect(routineInputSchema.safeParse(template).success).toBe(true);
    }
  });

  it('a une teinte et une icône dessinée pour chaque icône de routine', () => {
    for (const icon of ROUTINE_ICONS) {
      expect(ROUTINE_ICON_TONES[icon]).toBeTypeOf('string');
      expect(ICONS[icon]).toHaveLength(2);
    }
  });
});
