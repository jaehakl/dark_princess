import type { CutRecord, SceneRecord } from '../../api/type';

export function buildCutContext(scene: SceneRecord, cuts: CutRecord[], lastContextCutId: number | null) {
  const cutById = new Map(
    cuts
      .filter((cut): cut is CutRecord & { id: number } => typeof cut.id === 'number')
      .map((cut) => [cut.id, cut]),
  );
  const chainCuts: CutRecord[] = [];
  const seenIds = new Set<number>();
  let nextCutId = lastContextCutId;
  while (nextCutId !== null && !seenIds.has(nextCutId)) {
    const contextCut = cutById.get(nextCutId);
    if (!contextCut) {
      break;
    }

    chainCuts.push(contextCut);
    seenIds.add(nextCutId);
    nextCutId = contextCut.prev_cut_id ?? null;
  }

  return [
    scene.context.trim(),
    ...chainCuts.reverse().map((cut) => cut.script.trim()),
  ]
    .filter(Boolean)
    .join('\n\n');
}
