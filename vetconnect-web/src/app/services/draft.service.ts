import { Injectable } from '@angular/core';
import { MedicalRecordInput } from './appointment.service';

export interface RecordDraft {
  data: MedicalRecordInput;
  savedAt: string; // ISO
  pendingSync: boolean; // true si el guardado en el servidor falló (sin conexión)
}

/**
 * VET-17 · RSK-03: respaldo local de la ficha clínica en localStorage.
 * Cada cambio del formulario se guarda como borrador; si el envío al servidor falla
 * se marca como pendiente y se reintenta al recuperar la conexión.
 */
@Injectable({ providedIn: 'root' })
export class DraftService {
  private readonly PREFIX = 'vetconnect_draft_';

  save(appointmentId: number, data: MedicalRecordInput, pendingSync = false): RecordDraft {
    const draft: RecordDraft = { data: { ...data }, savedAt: new Date().toISOString(), pendingSync };
    try {
      localStorage.setItem(this.PREFIX + appointmentId, JSON.stringify(draft));
    } catch {
      // Cuota llena o almacenamiento deshabilitado: el formulario sigue funcionando sin respaldo.
    }
    return draft;
  }

  load(appointmentId: number): RecordDraft | null {
    try {
      const raw = localStorage.getItem(this.PREFIX + appointmentId);
      return raw ? (JSON.parse(raw) as RecordDraft) : null;
    } catch {
      return null;
    }
  }

  clear(appointmentId: number): void {
    localStorage.removeItem(this.PREFIX + appointmentId);
  }

  /** IDs de citas con fichas que no alcanzaron a llegar al servidor. */
  pendingIds(): number[] {
    const ids: number[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(this.PREFIX)) continue;
      const id = Number(key.slice(this.PREFIX.length));
      if (this.load(id)?.pendingSync) ids.push(id);
    }
    return ids;
  }
}
