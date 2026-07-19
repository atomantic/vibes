import { ArrivalSliceSaveSchema, type ArrivalSliceSave } from '@vibes/protocol';

const SAVE_KEY = 'vibes.arrival-slice.save.v1';

export function readArrivalSave(): ArrivalSliceSave | undefined {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw === null) return undefined;
    const parsed = ArrivalSliceSaveSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function persistArrivalSave(save: ArrivalSliceSave): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}
