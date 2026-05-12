import { dbTables } from '../api/api';
import {
  booleanField,
  byNumberAscIdAsc,
  isRecord,
  numberField,
  optionalNumberField,
  recordField,
  rowId,
  STATUS_STAT_FIELDS,
  statusWriteRow,
  stringField,
  targetStatusWriteRow,
} from './rows';
import { findById, type GameData } from './snapshot';
import type { DbRow } from './types';

export async function applySceneResults({
  data,
  status,
  targetStatus,
  historyId,
  scene,
}: {
  data: GameData;
  status: DbRow;
  targetStatus: DbRow;
  historyId: number;
  scene: DbRow;
}) {
  await dbTables.Status.upsertRow([statusWriteRow(status)]);
  if (
    data.appliedResults.some(
      (appliedResult) => optionalNumberField(appliedResult, 'scene_history_id') === historyId,
    )
  ) {
    return;
  }

  const sceneId = rowId(scene);
  const appliedRows: DbRow[] = [];
  const statusFields = new Set<string>(STATUS_STAT_FIELDS);
  const sortedResults = data.results
    .filter((result) => optionalNumberField(result, 'scene_id') === sceneId)
    .sort(byNumberAscIdAsc('sort_order'));

  for (let index = 0; index < sortedResults.length; index += 1) {
    const result = sortedResults[index];
    const kind = stringField(result, 'kind');
    const applied = await applySingleResult({
      data,
      status,
      targetStatus,
      result,
      kind,
      statusFields,
    });

    if (applied) {
      appliedRows.push({
        scene_history_id: historyId,
        result_id: rowId(result),
        kind,
        payload: applied.payload,
        before: { value: applied.before },
        after: { value: applied.after },
        sort_order: index,
      });
    }
  }

  if (appliedRows.length > 0) {
    const response = await dbTables.SceneAppliedResult.upsertRow(appliedRows);
    data.appliedResults.push(
      ...appliedRows.map((appliedRow, index) => ({
        ...appliedRow,
        id: response[index]?.id,
      })),
    );
  }
}

async function applySingleResult({
  data,
  status,
  targetStatus,
  result,
  kind,
  statusFields,
}: {
  data: GameData;
  status: DbRow;
  targetStatus: DbRow;
  result: DbRow;
  kind: string;
  statusFields: Set<string>;
}) {
  const statField = stringField(result, 'stat_field');
  const numericValue = optionalNumberField(result, 'numeric_value') ?? 0;

  if ((kind === 'status_stat_delta' || kind === 'status_stat_set') && statusFields.has(statField)) {
    const before = numberField(status, statField);
    const after = kind === 'status_stat_delta' ? before + numericValue : numericValue;
    status[statField] = after;
    return { payload: { field: statField }, before, after };
  }

  if (kind === 'target_interaction_delta' || kind === 'target_interaction_set') {
    const key = stringField(result, 'key') || statField;
    if (!key) {
      return null;
    }

    const resultTargetStatus = await ensureResultTargetStatus(data, status, targetStatus, result);
    const interactions = { ...recordField(resultTargetStatus, 'interactions') };
    const before = interactions[key] ?? (kind === 'target_interaction_delta' ? 0 : null);
    const after =
      kind === 'target_interaction_delta'
        ? (typeof before === 'number' ? before : 0) + numericValue
        : result.value;
    interactions[key] = after;
    resultTargetStatus.interactions = interactions;
    await dbTables.TargetStatus.upsertRow([targetStatusWriteRow(resultTargetStatus)]);
    return { payload: { key }, before, after };
  }

  if ((kind === 'status_tag_add' || kind === 'status_tag_remove') && optionalNumberField(result, 'tag_id') !== null) {
    const tagId = numberField(result, 'tag_id');
    const existing = data.statusTags.find(
      (item) =>
        optionalNumberField(item, 'status_id') === rowId(status) &&
        optionalNumberField(item, 'tag_id') === tagId,
    );
    const before = Boolean(existing);
    if (kind === 'status_tag_add' && !existing) {
      const response = await dbTables.StatusTag.upsertRow([{ status_id: rowId(status), tag_id: tagId }]);
      data.statusTags.push({ id: response[0]?.id, status_id: rowId(status), tag_id: tagId });
    }
    if (kind === 'status_tag_remove' && existing) {
      const existingId = rowId(existing);
      if (existingId !== null) {
        await dbTables.StatusTag.deleteRows([existingId]);
        data.statusTags = data.statusTags.filter((item) => rowId(item) !== existingId);
      }
    }
    return { payload: { tag_id: tagId }, before, after: kind === 'status_tag_add' };
  }

  if ((kind === 'target_tag_add' || kind === 'target_tag_remove') && optionalNumberField(result, 'tag_id') !== null) {
    const tagId = numberField(result, 'tag_id');
    const resultTargetStatus = await ensureResultTargetStatus(data, status, targetStatus, result);
    const resultTargetStatusId = rowId(resultTargetStatus);
    const existing = data.targetStatusTags.find(
      (item) =>
        optionalNumberField(item, 'target_status_id') === resultTargetStatusId &&
        optionalNumberField(item, 'tag_id') === tagId,
    );
    const before = Boolean(existing);
    if (kind === 'target_tag_add' && !existing) {
      const response = await dbTables.TargetStatusTag.upsertRow([
        { target_status_id: resultTargetStatusId, tag_id: tagId },
      ]);
      data.targetStatusTags.push({
        id: response[0]?.id,
        target_status_id: resultTargetStatusId,
        tag_id: tagId,
      });
    }
    if (kind === 'target_tag_remove' && existing) {
      const existingId = rowId(existing);
      if (existingId !== null) {
        await dbTables.TargetStatusTag.deleteRows([existingId]);
        data.targetStatusTags = data.targetStatusTags.filter((item) => rowId(item) !== existingId);
      }
    }
    return {
      payload: { tag_id: tagId, target_status_id: resultTargetStatusId },
      before,
      after: kind === 'target_tag_add',
    };
  }

  if (kind === 'target_visitable_set' || kind === 'target_visitable_toggle') {
    const resultTargetStatus = await ensureResultTargetStatus(data, status, targetStatus, result);
    const before = booleanField(resultTargetStatus, 'visitable', true);
    const value = result.value;
    const after =
      kind === 'target_visitable_toggle'
        ? !before
        : isRecord(value) && typeof value.value === 'boolean'
          ? value.value
          : Boolean(optionalNumberField(result, 'numeric_value'));
    resultTargetStatus.visitable = after;
    await dbTables.TargetStatus.upsertRow([targetStatusWriteRow(resultTargetStatus)]);
    return { payload: { target_status_id: rowId(resultTargetStatus) }, before, after };
  }

  return null;
}

async function ensureResultTargetStatus(
  data: GameData,
  status: DbRow,
  currentTargetStatus: DbRow,
  result: DbRow,
) {
  const resultTargetId = optionalNumberField(result, 'target_id');
  if (
    resultTargetId === null ||
    resultTargetId === optionalNumberField(currentTargetStatus, 'target_id')
  ) {
    return currentTargetStatus;
  }

  const existing = data.targetStatuses.find(
    (item) =>
      optionalNumberField(item, 'status_id') === rowId(status) &&
      optionalNumberField(item, 'target_id') === resultTargetId,
  );
  if (existing) {
    return existing;
  }

  const nextTargetStatus: DbRow = {
    status_id: rowId(status),
    target_id: resultTargetId,
    interactions: {},
    visitable: true,
  };
  const response = await dbTables.TargetStatus.upsertRow([nextTargetStatus]);
  const id = response[0]?.id;
  if (typeof id !== 'number') {
    throw new Error('target status was not created');
  }

  nextTargetStatus.id = id;
  data.targetStatuses.push(nextTargetStatus);
  const target = findById(data.targets, resultTargetId);
  if (target === null) {
    data.targets.push({ id: resultTargetId });
  }
  return nextTargetStatus;
}
