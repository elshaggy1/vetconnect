import { DraftService } from './draft.service';
import { MedicalRecordInput } from './appointment.service';

const RECORD: MedicalRecordInput = {
  pet_name: 'Toby',
  species: 'Canino',
  weight_kg: 12,
  antecedents: '-',
  vaccines: 'Rabia',
  diagnosis: 'Control',
  treatment: '-',
  prescription: '-',
};

describe('DraftService (VET-17)', () => {
  let service: DraftService;

  beforeEach(() => {
    localStorage.clear();
    service = new DraftService();
  });

  it('guarda y restaura el borrador de una cita', () => {
    service.save(7, RECORD);
    expect(service.load(7)?.data.pet_name).toBe('Toby');
    expect(service.load(7)?.pendingSync).toBeFalse();
  });

  it('lista solo las fichas pendientes de sincronizar', () => {
    service.save(1, RECORD);
    service.save(2, RECORD, true);
    expect(service.pendingIds()).toEqual([2]);
  });

  it('borra el borrador tras guardarse en el servidor', () => {
    service.save(3, RECORD, true);
    service.clear(3);
    expect(service.load(3)).toBeNull();
    expect(service.pendingIds()).toEqual([]);
  });
});
