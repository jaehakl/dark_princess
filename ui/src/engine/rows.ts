import type { DbRow } from './types';

export const STATUS_STAT_FIELDS = [
  'cash',
  'strength',
  'agility',
  'intelligence',
  'sense',
  'attractiveness',
  'toughness',
  'stress',
] as const;

const STATUS_WRITE_FIELDS = [
  'id',
  'name',
  'turn',
  ...STATUS_STAT_FIELDS,
] as const;

const TARGET_STATUS_WRITE_FIELDS = [
  'id',
  'status_id',
  'target_id',
  'interactions',
  'visitable',
] as const;

export function rowId(row: DbRow | null | undefined) {
  return optionalNumberField(row, 'id');
}

export function optionalNumberField(row: DbRow | null | undefined, field: string) {
  const value = row?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function numberField(row: DbRow | null | undefined, field: string, fallback = 0) {
  return optionalNumberField(row, field) ?? fallback;
}

export function stringField(row: DbRow | null | undefined, field: string, fallback = '') {
  const value = row?.[field];
  return typeof value === 'string' ? value : fallback;
}

export function booleanField(row: DbRow | null | undefined, field: string, fallback = false) {
  const value = row?.[field];
  return typeof value === 'boolean' ? value : fallback;
}

export function recordField(row: DbRow | null | undefined, field: string) {
  const value = row?.[field];
  return isRecord(value) ? value : {};
}

export function isRecord(value: unknown): value is DbRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function byNumberAscIdAsc(field: string) {
  return (left: DbRow, right: DbRow) => {
    const diff = numberField(left, field) - numberField(right, field);
    return diff || numberField(left, 'id') - numberField(right, 'id');
  };
}

export function byNumberDescIdAsc(field: string) {
  return (left: DbRow, right: DbRow) => {
    const diff = numberField(right, field) - numberField(left, field);
    return diff || numberField(left, 'id') - numberField(right, 'id');
  };
}

export function statusWriteRow(status: DbRow) {
  return pickFields(status, STATUS_WRITE_FIELDS);
}

export function targetStatusWriteRow(targetStatus: DbRow) {
  return pickFields(targetStatus, TARGET_STATUS_WRITE_FIELDS);
}

function pickFields(row: DbRow, fields: readonly string[]) {
  const payload: DbRow = {};
  fields.forEach((field) => {
    if (field in row && row[field] !== undefined) {
      payload[field] = row[field];
    }
  });
  return payload;
}
