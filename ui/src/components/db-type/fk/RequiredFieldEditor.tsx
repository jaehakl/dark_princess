import type { ReactNode } from 'react';
import { DbTypeDatetimeEdit } from '../datetime';
import { DbTypeNumberEdit } from '../number';
import { DbTypeTextEdit } from '../text';
import { DbTypeUrlEdit } from '../url';
import { FK_EDITOR_BACKGROUND_CLASS } from './constants';
import type {
  DbColumn,
  DbTableName,
  RequiredFieldFkEditorProps,
} from './types';

export type RenderFkEditor = (
  props: RequiredFieldFkEditorProps
) => ReactNode;

export function RequiredFieldEditor({
  columnKey,
  config,
  value,
  hideLabel = false,
  currentTableName,
  currentRowId = null,
  renderFkEditor,
  onChange,
}: {
  columnKey: string;
  config: DbColumn;
  value: unknown;
  hideLabel?: boolean;
  currentTableName?: DbTableName;
  currentRowId?: number | null;
  renderFkEditor: RenderFkEditor;
  onChange: (value: unknown) => void;
}) {
  if (config.type === 'text') {
    return (
      <DbTypeTextEdit
        label={config.label}
        value={value}
        maxRows={3}
        editorBackgroundClassName={FK_EDITOR_BACKGROUND_CLASS}
        editorTextClassName="edit-text"
        hideLabel={hideLabel}
        required={config.required}
        surface="subtle"
        onChange={onChange}
      />
    );
  }

  if (config.type === 'datetime') {
    return (
      <DbTypeDatetimeEdit
        label={config.label}
        value={value}
        editorBackgroundClassName={FK_EDITOR_BACKGROUND_CLASS}
        editorTextClassName="edit-text"
        hideLabel={hideLabel}
        required={config.required}
        onChange={onChange}
      />
    );
  }

  if (config.type === 'fk') {
    return renderFkEditor({
      label: config.label,
      targetTable: config.targetTable,
      value,
      mode: 'single',
      editorBackgroundClassName: FK_EDITOR_BACKGROUND_CLASS,
      editorTextClassName: 'edit-text',
      hideLabel,
      required: config.required,
      currentTableName,
      currentRowId,
      onChange,
    });
  }

  if (config.type === 'int' || config.type === 'float') {
    return (
      <DbTypeNumberEdit
        label={config.label}
        value={value}
        numberType={config.type}
        editorBackgroundClassName={FK_EDITOR_BACKGROUND_CLASS}
        editorTextClassName="edit-text"
        hideLabel={hideLabel}
        required={config.required}
        onChange={onChange}
      />
    );
  }

  if (config.type === 'url') {
    return (
      <DbTypeUrlEdit
        label={config.label}
        value={value}
        editorBackgroundClassName={FK_EDITOR_BACKGROUND_CLASS}
        editorTextClassName="edit-text"
        hideLabel={hideLabel}
        required={config.required}
        onChange={onChange}
      />
    );
  }

  return (
    <div
      className={
        hideLabel
          ? 'grid grid-cols-1 items-center gap-2'
          : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] items-center gap-2 md:gap-3'
      }
    >
      {hideLabel ? null : (
        <p
          className={[
            'edit-label edit-text',
            config.required ? 'edit-label--required' : '',
          ].join(' ')}
        >
          <span className="edit-label__text">{config.label}</span>
        </p>
      )}
      <p className="edit-text min-w-0 leading-6 text-rose-600">
        {columnKey} 타입은 지원하지 않습니다.
      </p>
    </div>
  );
}
