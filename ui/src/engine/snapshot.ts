import { dbTables } from '../api/api';
import type { GetListRequest } from '../api/type';
import { buildConditionState, conditionMatches } from './conditions';
import {
  booleanField,
  byNumberAscIdAsc,
  byNumberDescIdAsc,
  numberField,
  optionalNumberField,
  rowId,
  stringField,
} from './rows';
import type { DbRow, PlaySnapshot, TargetStatusSnapshot } from './types';

type ListableTable = {
  listRows: (request: GetListRequest) => Promise<{ items: DbRow[]; total: number }>;
};

export type GameData = {
  status: DbRow;
  targetStatuses: DbRow[];
  targets: DbRow[];
  statusTags: DbRow[];
  targetStatusTags: DbRow[];
  histories: DbRow[];
  decisions: DbRow[];
  appliedResults: DbRow[];
  scenes: DbRow[];
  triggerBlocks: DbRow[];
  options: DbRow[];
  conditions: DbRow[];
  results: DbRow[];
};

export async function getSnapshot(statusId: number): Promise<PlaySnapshot> {
  return buildSnapshot(await loadGameData(statusId));
}

export async function loadGameData(statusId: number): Promise<GameData> {
  const statusRows = await listRows(dbTables.Status, {
    limit: 1,
    filter: { id: [statusId, statusId] },
  });
  const status = statusRows[0];
  if (!status) {
    throw new Error('status not found');
  }

  const [
    targetStatuses,
    statusTags,
    histories,
    scenes,
    triggerBlocks,
    options,
    conditions,
    results,
    decisions,
    targetStatusTags,
    appliedResults,
  ] = await Promise.all([
    listRows(dbTables.TargetStatus, {
      filter: { status_id: [statusId, statusId] },
    }),
    listRows(dbTables.StatusTag, {
      filter: { status_id: [statusId, statusId] },
    }),
    listRows(dbTables.SceneHistory, {
      filter: { status_id: [statusId, statusId] },
    }),
    listRows(dbTables.Scene),
    listRows(dbTables.SceneTriggerBlock),
    listRows(dbTables.SceneOption),
    listRows(dbTables.SceneCondition),
    listRows(dbTables.SceneResult),
    listRows(dbTables.SceneDecision),
    listRows(dbTables.TargetStatusTag),
    listRows(dbTables.SceneAppliedResult),
  ]);

  const nextStatus = recoverStatusProgress(status, histories, decisions);
  const targetIds = [
    ...new Set(
      targetStatuses
        .map((item) => optionalNumberField(item, 'target_id'))
        .filter((id): id is number => id !== null),
    ),
  ];
  const targets =
    targetIds.length === 0
      ? []
      : await listRows(dbTables.Target, {
          selected_ids: targetIds,
        });

  return {
    status: nextStatus,
    targetStatuses,
    targets,
    statusTags,
    targetStatusTags,
    histories,
    decisions,
    appliedResults,
    scenes,
    triggerBlocks,
    options,
    conditions,
    results,
  };
}

export function buildSnapshot(data: GameData): PlaySnapshot {
  const activeHistory = findActiveHistory(data.status, data.histories, data.decisions);
  const scene = activeHistory
    ? findById(data.scenes, optionalNumberField(activeHistory, 'scene_id'))
    : null;
  const targetStatus = activeHistory
    ? findById(data.targetStatuses, optionalNumberField(activeHistory, 'target_status_id'))
    : null;
  const sceneOptions =
    scene && targetStatus
      ? getAvailableOptions(data, scene, targetStatus)
      : [];

  return {
    phase: scene ? 'scene' : 'target_select',
    status: { ...data.status },
    scene: scene ? { ...scene } : null,
    scene_history: activeHistory ? { ...activeHistory } : null,
    target_status: targetStatus ? attachTarget(data, targetStatus) : null,
    scene_options: sceneOptions.map((option) => ({ ...option })),
    target_statuses: data.targetStatuses
      .slice()
      .sort(byNumberAscIdAsc('id'))
      .map((item) => attachTarget(data, item)),
  };
}

export function findActiveHistory(status: DbRow, histories: DbRow[], decisions: DbRow[] = []) {
  return getLatestUnresolvedHistory(status, histories, decisions);
}

export function findHistoryAtProgress(status: DbRow, histories: DbRow[], subTurn: number) {
  const statusId = rowId(status);
  return (
    histories.find(
      (history) =>
        optionalNumberField(history, 'status_id') === statusId &&
        optionalNumberField(history, 'turn') === numberField(status, 'turn') &&
        optionalNumberField(history, 'sub_turn') === subTurn,
    ) ?? null
  );
}

export function getNextSubTurn(status: DbRow, histories: DbRow[]) {
  const statusId = rowId(status);
  const turn = numberField(status, 'turn');
  const latestSubTurn = histories
    .filter(
      (history) =>
        optionalNumberField(history, 'status_id') === statusId &&
        optionalNumberField(history, 'turn') === turn,
    )
    .reduce((maxSubTurn, history) => Math.max(maxSubTurn, numberField(history, 'sub_turn')), 0);

  return latestSubTurn + 1;
}

export function findNextScene(data: GameData, status: DbRow, targetStatus: DbRow) {
  const state = buildConditionState({
    status,
    targetStatus,
    statusTags: data.statusTags,
    targetStatusTags: data.targetStatusTags,
    histories: data.histories,
  });

  for (const scene of data.scenes.slice().sort(byNumberDescIdAsc('priority'))) {
    const sceneId = rowId(scene);
    if (sceneId === null) {
      continue;
    }

    const blocks = data.triggerBlocks.filter(
      (block) => optionalNumberField(block, 'scene_id') === sceneId,
    );
    if (blocks.length === 0) {
      continue;
    }

    const seenTurns = state.seenSceneTurns.get(sceneId) ?? [];
    const repeatPolicy = normalizeRepeatPolicy(stringField(scene, 'repeat_policy', 'once_per_status'));
    if (repeatPolicy === 'once_per_status' && seenTurns.length > 0) {
      continue;
    }
    const cooldownTurns = numberField(scene, 'cooldown_turns');
    if (
      cooldownTurns > 0 &&
      seenTurns.length > 0 &&
      numberField(status, 'turn') - Math.max(...seenTurns) < cooldownTurns
    ) {
      continue;
    }

    const matchingBlock = blocks.some((block) => {
      const blockId = rowId(block);
      const blockConditions = data.conditions.filter(
        (condition) => optionalNumberField(condition, 'trigger_block_id') === blockId,
      );
      const conditionsMatch = blockConditions.every((condition) =>
        conditionMatches(condition, status, targetStatus, state),
      );
      return conditionsMatch && triggerChanceMatches(block);
    });
    if (matchingBlock) {
      return scene;
    }
  }

  return null;
}

function triggerChanceMatches(block: DbRow) {
  const rawChance = optionalNumberField(block, 'chance_percent') ?? 100;
  const chancePercent = Math.min(100, Math.max(0, rawChance));

  if (chancePercent >= 100) {
    return true;
  }
  if (chancePercent <= 0) {
    return false;
  }

  return Math.random() * 100 < chancePercent;
}

function normalizeRepeatPolicy(value: string) {
  return value === 'always' ? 'always' : 'once_per_status';
}

export function findById(rows: DbRow[], id: number | null) {
  if (id === null) {
    return null;
  }
  return rows.find((row) => rowId(row) === id) ?? null;
}

function getAvailableOptions(data: GameData, scene: DbRow, targetStatus: DbRow) {
  const sceneId = rowId(scene);
  const state = buildConditionState({
    status: data.status,
    targetStatus,
    statusTags: data.statusTags,
    targetStatusTags: data.targetStatusTags,
    histories: data.histories,
  });

  return data.options
    .filter(
      (option) =>
        optionalNumberField(option, 'scene_id') === sceneId &&
        booleanField(option, 'is_active', true),
    )
    .filter((option) => {
      const optionId = rowId(option);
      return data.conditions
        .filter((condition) => optionalNumberField(condition, 'option_id') === optionId)
        .every((condition) => conditionMatches(condition, data.status, targetStatus, state));
    })
    .sort(byNumberAscIdAsc('sort_order'));
}

function attachTarget(data: GameData, targetStatus: DbRow): TargetStatusSnapshot {
  const target = findById(data.targets, optionalNumberField(targetStatus, 'target_id'));
  return {
    ...targetStatus,
    target: target ? { ...target } : null,
  };
}

async function listRows(table: ListableTable, request: Partial<GetListRequest> = {}) {
  const response = await table.listRows({
    offset: 0,
    limit: null,
    selected_ids: [],
    search_text: null,
    text_filter: {},
    filter: {},
    sort: null,
    ...request,
  });
  return response.items;
}

function recoverStatusProgress(status: DbRow, histories: DbRow[], decisions: DbRow[]) {
  const activeHistory = findActiveHistory(status, histories, decisions);
  if (!activeHistory) {
    return status;
  }

  const turn = optionalNumberField(activeHistory, 'turn');
  if (turn === null) {
    return status;
  }

  return {
    ...status,
    turn,
  };
}

function getLatestUnresolvedHistory(status: DbRow, histories: DbRow[], decisions: DbRow[]) {
  const statusId = rowId(status);

  return (
    histories
      .filter((history) => {
        const historyId = rowId(history);
        return (
          optionalNumberField(history, 'status_id') === statusId &&
          historyId !== null &&
          !historyHasDecision(history, decisions)
        );
      })
      .sort((left, right) => {
        const turnDiff = numberField(right, 'turn') - numberField(left, 'turn');
        if (turnDiff) {
          return turnDiff;
        }
        const subTurnDiff = numberField(right, 'sub_turn') - numberField(left, 'sub_turn');
        if (subTurnDiff) {
          return subTurnDiff;
        }
        return numberField(right, 'id') - numberField(left, 'id');
      })[0] ?? null
  );
}

function historyHasDecision(history: DbRow, decisions: DbRow[]) {
  const historyId = rowId(history);
  return (
    historyId !== null &&
    decisions.some((decision) => optionalNumberField(decision, 'scene_history_id') === historyId)
  );
}
