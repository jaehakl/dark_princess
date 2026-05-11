import type { GetListRequest, UpsertResponse, dbTables } from '../../api/api';

export type DbRow = Record<string, unknown>;
export type DbTableName = keyof typeof dbTables;
export type PlayEditTab = 'status' | 'target' | 'history';

export type TableConfig = {
  label: string;
  listRows: (request: GetListRequest) => Promise<{ items: DbRow[]; total: number }>;
  upsertRow: (items: unknown) => Promise<UpsertResponse[]>;
};
