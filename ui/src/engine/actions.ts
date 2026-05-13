import { dbTables } from '../api/api';
import { buildConditionState, conditionMatches } from './conditions';
import { applySceneResults } from './results';
import {
  booleanField,
  numberField,
  optionalNumberField,
  rowId,
  statusWriteRow,
  stringField,
} from './rows';
import {
  buildSnapshot,
  findActiveHistory,
  findHistoryAtProgress,
  findById,
  findNextScene,
  getNextSubTurn,
  getSnapshot,
  loadGameData,
} from './snapshot';
import type { DbRow, PlaySnapshot } from './types';

export async function selectTarget(statusId: number, targetStatusId: number): Promise<PlaySnapshot> {
  const data = await loadGameData(statusId);
  const statusIdValue = rowId(data.status);
  const targetStatus = findById(data.targetStatuses, targetStatusId);
  if (!targetStatus || optionalNumberField(targetStatus, 'status_id') !== statusIdValue) {
    throw new Error('target status not found');
  }
  if (!booleanField(targetStatus, 'visitable')) {
    throw new Error('target is not visitable');
  }
  if (findActiveHistory(data.status, data.histories, data.decisions)) {
    throw new Error('turn already has an active scene');
  }

  const scene = findNextScene(data, data.status, targetStatus);
  if (!scene) {
    throw new Error('eligible scene not found');
  }

  await startScene(data, targetStatus, scene);
  return getSnapshot(statusId);
}

export async function chooseOption(
  statusId: number,
  sceneHistoryId: number,
  optionId: number,
): Promise<PlaySnapshot> {
  const data = await loadGameData(statusId);
  const history = findById(data.histories, sceneHistoryId);
  if (!history) {
    throw new Error('scene history not found');
  }
  const activeHistory = findActiveHistory(data.status, data.histories, data.decisions);
  if (rowId(activeHistory) !== sceneHistoryId) {
    throw new Error('scene history is not active');
  }

  const option = findById(data.options, optionId);
  if (
    !option ||
    optionalNumberField(option, 'scene_id') !== optionalNumberField(history, 'scene_id') ||
    !booleanField(option, 'is_active', true)
  ) {
    throw new Error('option not found');
  }

  const targetStatus = findById(data.targetStatuses, optionalNumberField(history, 'target_status_id'));
  if (!targetStatus) {
    throw new Error('scene has no target status');
  }

  const state = buildConditionState({
    status: data.status,
    targetStatus,
    statusTags: data.statusTags,
    targetStatusTags: data.targetStatusTags,
    histories: data.histories,
  });
  const optionConditions = data.conditions.filter(
    (condition) => optionalNumberField(condition, 'option_id') === optionId,
  );
  if (
    optionConditions.some(
      (condition) => !conditionMatches(condition, data.status, targetStatus, state),
    )
  ) {
    throw new Error('option conditions are not met');
  }

  const decisionCount = data.decisions.filter(
    (decision) => optionalNumberField(decision, 'scene_history_id') === sceneHistoryId,
  ).length;
  const decision: DbRow = {
    scene_history_id: sceneHistoryId,
    option_id: optionId,
    option_key: stringField(option, 'option_key') || null,
    option_label: stringField(option, 'label') || null,
    sort_order: decisionCount,
  };
  const decisionResponse = await dbTables.SceneDecision.upsertRow([decision]);
  data.decisions.push({ ...decision, id: decisionResponse[0]?.id });

  const nextSceneId = optionalNumberField(option, 'next_scene_id');
  const nextScene = nextSceneId !== null ? findById(data.scenes, nextSceneId) : findNextScene(data, data.status, targetStatus);
  if (!nextScene) {
    data.status.turn = numberField(data.status, 'turn') + 1;
    await dbTables.Status.upsertRow([statusWriteRow(data.status)]);
    return getSnapshot(statusId);
  }

  await startScene(data, targetStatus, nextScene);
  return getSnapshot(statusId);
}

export async function advanceTurn(
  statusId: number,
  sceneHistoryId: number,
): Promise<PlaySnapshot> {
  const data = await loadGameData(statusId);
  const activeHistory = findActiveHistory(data.status, data.histories, data.decisions);
  if (rowId(activeHistory) !== sceneHistoryId) {
    throw new Error('scene history is not active');
  }
  if (buildSnapshot(data).scene_options.length > 0) {
    throw new Error('scene has available options');
  }

  const decisionCount = data.decisions.filter(
    (decision) => optionalNumberField(decision, 'scene_history_id') === sceneHistoryId,
  ).length;
  const decision: DbRow = {
    scene_history_id: sceneHistoryId,
    option_id: null,
    option_key: 'next_turn',
    option_label: '다음 턴으로',
    sort_order: decisionCount,
  };
  const decisionResponse = await dbTables.SceneDecision.upsertRow([decision]);
  data.decisions.push({ ...decision, id: decisionResponse[0]?.id });

  data.status.turn = numberField(data.status, 'turn') + 1;
  await dbTables.Status.upsertRow([statusWriteRow(data.status)]);
  return getSnapshot(statusId);
}

async function startScene(data: Awaited<ReturnType<typeof loadGameData>>, targetStatus: DbRow, scene: DbRow) {
  const nextSubTurn = getNextSubTurn(data.status, data.histories);
  const existingHistory = findHistoryAtProgress(data.status, data.histories, nextSubTurn);
  let historyId = rowId(existingHistory);
  const historyScene = existingHistory
    ? findById(data.scenes, optionalNumberField(existingHistory, 'scene_id')) ?? scene
    : scene;
  const historyTargetStatus = existingHistory
    ? findById(data.targetStatuses, optionalNumberField(existingHistory, 'target_status_id')) ?? targetStatus
    : targetStatus;

  if (historyId === null) {
    const history: DbRow = {
      status_id: rowId(data.status),
      scene_id: rowId(historyScene),
      target_status_id: rowId(historyTargetStatus),
      turn: numberField(data.status, 'turn'),
      sub_turn: nextSubTurn,
    };
    const historyResponse = await dbTables.SceneHistory.upsertRow([history]);
    historyId = historyResponse[0]?.id ?? null;
    data.histories.push({ ...history, id: historyId });
  }

  if (typeof historyId !== 'number') {
    throw new Error('scene history was not created');
  }

  await applySceneResults({
    data,
    status: data.status,
    targetStatus: historyTargetStatus,
    historyId,
    scene: historyScene,
  });
}
