type DbTypeNumberEditProps = {
  label: string;
  value: unknown;
  numberType: 'int' | 'float';
  editorBackgroundClassName: string;
  editorTextClassName?: string;
  onChange: (value: number | null) => void;
  hideLabel?: boolean;
  required?: boolean;
};

export function DbTypeNumberEdit({
  label,
  value,
  numberType,
  editorBackgroundClassName,
  editorTextClassName = 'text-xs',
  onChange,
  hideLabel = false,
  required = false,
}: DbTypeNumberEditProps) {
  return (
    <label
      className={
        hideLabel
          ? 'block'
          : 'grid grid-cols-[var(--edit-label-width,5.5rem)_minmax(0,1fr)] items-center gap-2'
      }
    >
      {hideLabel ? null : (
        <span
          className={[
            'edit-label leading-tight',
            required ? 'edit-label--required' : '',
            editorTextClassName,
          ].join(' ')}
        >
          <span className="edit-label__text">{label}</span>
        </span>
      )}
      <input
        type="number"
        step={numberType === 'float' ? 'any' : '1'}
        value={formatNumberInputValue(value)}
        aria-required={required || undefined}
        className={[
          'edit-control h-6 w-[8.6rem] min-w-0 justify-self-start px-1.5 leading-none text-[var(--app-text)] outline-none',
          editorTextClassName,
          editorBackgroundClassName,
        ].join(' ')}
        onChange={(event) => onChange(parseNumberInputValue(event.target.value))}
      />
    </label>
  );
}

function formatNumberInputValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseNumberInputValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}
