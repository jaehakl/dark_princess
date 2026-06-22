import type { CutRecord } from '../../api/type';
import type {
  EMPTY_INSTANT_PROMPT_DRAFT,
  PROMPT_EDITOR_COLUMNS,
  STATUS_CHANGE_FIELDS,
} from './constants';

export type PromptEditorColumnName = (typeof PROMPT_EDITOR_COLUMNS)[number]['key'];

export type SaveMode =
  | 'data'
  | 'image';

export type StatusChangeKey = (typeof STATUS_CHANGE_FIELDS)[number]['key'];

export type StatusChangeValues = Record<StatusChangeKey, string>;

export type InstantPromptName = keyof typeof EMPTY_INSTANT_PROMPT_DRAFT;

export type CutEditComponentProps = {
  cutId: number | null;
  initialCut: CutRecord;
  onSaved: (cutId: number) => void;
  onDeleted?: (cutId: number) => void;
};
