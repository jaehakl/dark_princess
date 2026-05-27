export type LocalDateTimeInputValue = {
  date: string;
  time: string;
};

export function parseApiDateTime(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const trimmedValue = value.trim();
  const localMatch = trimmedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
  );
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4] ?? '0');
    const minute = Number(localMatch[5] ?? '0');
    const second = Number(localMatch[6] ?? '0');
    const millisecond = Number((localMatch[7] ?? '0').padEnd(3, '0'));
    const date = new Date(year, month - 1, day, hour, minute, second, millisecond);

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day &&
      date.getHours() === hour &&
      date.getMinutes() === minute
    ) {
      return date;
    }
  }

  const date = new Date(trimmedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toLocalDateTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${toLocalDateKey(date)}T${hours}:${minutes}`;
}

export function getLocalDateTimeInputValue(value: unknown): LocalDateTimeInputValue {
  const date = parseApiDateTime(value);
  if (!date) {
    return { date: '', time: '' };
  }

  return {
    date: toLocalDateKey(date),
    time: `${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes()
    ).padStart(2, '0')}`,
  };
}

export function localDateTimePartsToUtcIso(
  dateValue: string,
  timeValue: string,
  options: { endOfMinute?: boolean } = {}
) {
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeValue.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!dateMatch || !timeMatch) {
    return null;
  }

  const date = new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    options.endOfMinute ? 59 : 0,
    options.endOfMinute ? 999 : 0
  );

  if (
    date.getFullYear() !== Number(dateMatch[1]) ||
    date.getMonth() !== Number(dateMatch[2]) - 1 ||
    date.getDate() !== Number(dateMatch[3])
  ) {
    return null;
  }

  return date.toISOString();
}

export function localDateTimeInputToUtcIso(
  value: string,
  options: { endOfMinute?: boolean } = {}
) {
  const trimmedValue = value.trim();
  const inputMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!inputMatch) {
    return null;
  }

  return localDateTimePartsToUtcIso(inputMatch[1], inputMatch[2], options);
}

export function dateToUtcIso(date: Date) {
  return date.toISOString();
}

export function getCurrentDateTimeIsoFloor30() {
  const date = new Date();
  date.setMinutes(Math.floor(date.getMinutes() / 30) * 30, 0, 0);
  return date.toISOString();
}

export function addMinutesToDateTimeIso(value: unknown, minutes: number) {
  const date = parseApiDateTime(value);
  if (!date) {
    return null;
  }

  const nextDate = new Date(date.getTime());
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate.toISOString();
}

export function formatLocalDateTimeLabel(
  value: unknown,
  options: { year?: '2-digit' | 'numeric'; fallback?: string } = {}
) {
  const date = parseApiDateTime(value);
  if (!date) {
    return options.fallback ?? '-';
  }

  const year =
    options.year === 'numeric'
      ? String(date.getFullYear())
      : String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function formatLocalTimeLabel(value: unknown) {
  const date = parseApiDateTime(value);
  if (!date) {
    return '';
  }

  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
}
