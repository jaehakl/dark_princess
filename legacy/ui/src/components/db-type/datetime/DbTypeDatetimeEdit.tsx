import { useEffect, useState, type KeyboardEvent } from 'react';
import {
  addMinutesToDateTimeIso,
  getLocalDateTimeInputValue,
  localDateTimePartsToUtcIso,
} from '../../../utils/datetime';

type DbTypeDatetimeEditProps = {
  label: string;
  value: unknown;
  editorBackgroundClassName: string;
  editorTextClassName?: string;
  onChange: (value: string | null) => void;
  hideLabel?: boolean;
  required?: boolean;
};

export function DbTypeDatetimeEdit({
  label,
  value,
  editorBackgroundClassName,
  editorTextClassName = 'text-xs',
  onChange,
  hideLabel = false,
  required = false,
}: DbTypeDatetimeEditProps) {
  const datetimeValue = getLocalDateTimeInputValue(value);
  const timeParts = splitTimeValue(datetimeValue.time);
  const [hourDraft, setHourDraft] = useState(timeParts.hour);
  const [minuteDraft, setMinuteDraft] = useState(timeParts.minute);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const nextTimeParts = splitTimeValue(datetimeValue.time);
    setHourDraft(nextTimeParts.hour);
    setMinuteDraft(nextTimeParts.minute);
  }, [datetimeValue.time]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
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
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <input
          type="date"
          value={datetimeValue.date}
          aria-label={`${label} date`}
          aria-required={required || undefined}
          className={[
            'edit-control datetime-edit-control h-6 w-[8.6rem] min-w-0 px-1.5 leading-none text-[var(--app-text)] outline-none',
            editorTextClassName,
            editorBackgroundClassName,
          ].join(' ')}
          onChange={(event) => {
            const nextDate = event.target.value;
            if (!nextDate) {
              clearDrafts();
              onChange(null);
              return;
            }

            const nextTimeParts = getValidTimeParts(
              hourDraft,
              minuteDraft,
              datetimeValue.time
            );
            setHourDraft(nextTimeParts.hour);
            setMinuteDraft(nextTimeParts.minute);
            onChange(
              localDateTimePartsToUtcIso(
                nextDate,
                formatTimeValue(nextTimeParts.hour, nextTimeParts.minute)
              )
            );
          }}
        />
        <span className="inline-flex min-w-0 shrink-0 items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-2]?[0-9]"
            placeholder="HH"
            value={hourDraft}
            maxLength={2}
            aria-label={`${label} hour`}
            className={[
              'edit-control datetime-edit-control h-6 w-10 min-w-0 px-1 text-center leading-none text-[var(--app-text)] outline-none',
              editorTextClassName,
              editorBackgroundClassName,
            ].join(' ')}
            onChange={(event) => {
              const nextHourDraft = formatNumberDraftValue(event.target.value);
              setHourDraft(nextHourDraft);
              commitValidDrafts(nextHourDraft, minuteDraft);
            }}
            onBlur={commitDraftsWithFallback}
            onKeyDown={(event) => handleStepKeyDown(event, 60)}
          />
          <span className="text-[var(--app-muted)]">:</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-5]?[0-9]"
            placeholder="MM"
            value={minuteDraft}
            maxLength={2}
            aria-label={`${label} minute`}
            className={[
              'edit-control datetime-edit-control h-6 w-10 min-w-0 px-1 text-center leading-none text-[var(--app-text)] outline-none',
              editorTextClassName,
              editorBackgroundClassName,
            ].join(' ')}
            onChange={(event) => {
              const nextMinuteDraft = formatNumberDraftValue(event.target.value);
              setMinuteDraft(nextMinuteDraft);
              commitValidDrafts(hourDraft, nextMinuteDraft);
            }}
            onBlur={commitDraftsWithFallback}
            onKeyDown={(event) => handleStepKeyDown(event, 5)}
          />
          <button
            type="button"
            aria-label={`${label} clear datetime`}
            className={[
              'datetime-edit-control h-6 shrink-0 px-1 text-left leading-none text-[var(--app-muted)] transition hover:text-[var(--app-text)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]',
            ].join(' ')}
            onClick={() => {
              clearDrafts();
              onChange(null);
            }}
          >
            clear
          </button>
        </span>
      </span>
    </div>
  );

  function commitValidDrafts(nextHourDraft: string, nextMinuteDraft: string) {
    if (
      !datetimeValue.date ||
      !isCompleteHourValue(nextHourDraft) ||
      !isCompleteMinuteValue(nextMinuteDraft)
    ) {
      return;
    }

    onChange(
      localDateTimePartsToUtcIso(
        datetimeValue.date,
        formatTimeValue(nextHourDraft, nextMinuteDraft)
      )
    );
  }

  function commitDraftsWithFallback() {
    if (!datetimeValue.date) {
      clearDrafts();
      return;
    }

    const nextTimeParts = getValidTimeParts(
      hourDraft,
      minuteDraft,
      datetimeValue.time
    );
    setHourDraft(nextTimeParts.hour);
    setMinuteDraft(nextTimeParts.minute);
    onChange(
      localDateTimePartsToUtcIso(
        datetimeValue.date,
        formatTimeValue(nextTimeParts.hour, nextTimeParts.minute)
      )
    );
  }

  function handleStepKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    stepMinutes: number
  ) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();
    stepDateTime(event.key === 'ArrowUp' ? stepMinutes : -stepMinutes);
  }

  function stepDateTime(deltaMinutes: number) {
    if (!datetimeValue.date) {
      return;
    }

    const currentTimeParts = getValidTimeParts(
      hourDraft,
      minuteDraft,
      datetimeValue.time
    );
    const currentIso = localDateTimePartsToUtcIso(
      datetimeValue.date,
      formatTimeValue(currentTimeParts.hour, currentTimeParts.minute)
    );
    const nextIso = addMinutesToDateTimeIso(currentIso, deltaMinutes);
    if (!nextIso) {
      return;
    }

    const nextDatetimeValue = getLocalDateTimeInputValue(nextIso);
    const nextTimeParts = splitTimeValue(nextDatetimeValue.time);
    setHourDraft(nextTimeParts.hour);
    setMinuteDraft(nextTimeParts.minute);
    onChange(nextIso);
  }

  function clearDrafts() {
    setHourDraft('');
    setMinuteDraft('');
  }
}

function splitTimeValue(value: string) {
  if (!isValidTimeValue(value)) {
    return { hour: '', minute: '' };
  }

  const [hour = '', minute = ''] = value.split(':');
  return { hour, minute };
}

function formatNumberDraftValue(value: string) {
  return value.replace(/\D/g, '').slice(0, 2);
}

function getValidTimeParts(
  hourDraft: string,
  minuteDraft: string,
  fallbackTime: string
) {
  const fallbackTimeParts = splitTimeValue(
    isValidTimeValue(fallbackTime) ? fallbackTime : '00:00'
  );

  return {
    hour: isValidHourValue(hourDraft)
      ? formatTimePart(hourDraft)
      : fallbackTimeParts.hour || '00',
    minute: isValidMinuteValue(minuteDraft)
      ? formatTimePart(minuteDraft)
      : fallbackTimeParts.minute || '00',
  };
}

function formatTimeValue(hour: string, minute: string) {
  return `${formatTimePart(hour)}:${formatTimePart(minute)}`;
}

function formatTimePart(value: string) {
  return String(Number(value)).padStart(2, '0');
}

function isValidHourValue(value: string) {
  if (!/^\d{1,2}$/.test(value)) {
    return false;
  }

  const hour = Number(value);
  return hour >= 0 && hour <= 23;
}

function isCompleteHourValue(value: string) {
  return value.length === 2 && isValidHourValue(value);
}

function isValidMinuteValue(value: string) {
  if (!/^\d{1,2}$/.test(value)) {
    return false;
  }

  const minute = Number(value);
  return minute >= 0 && minute <= 59;
}

function isCompleteMinuteValue(value: string) {
  return value.length === 2 && isValidMinuteValue(value);
}

function isValidTimeValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
