// The names of the object-snap modes, for the snap marker, the status bar and the mode list.
import { t } from '@shared/i18n';

export function snapLabel(on: string): string {
  switch (on) {
    case 'endpoint': return t('Endpoint');
    case 'midpoint': return t('Midpoint');
    case 'connection': return t('Connection point');
    case 'intersection': return t('Intersection');
    case 'perpendicular': return t('Perpendicular');
    case 'nearest': return t('Nearest');
    default: return '';
  }
}
