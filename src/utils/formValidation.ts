export type FormErrors = Record<string, string>;

const isMissing = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return !Number.isFinite(value) || value <= 0;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  return false;
};

export const validateRequired = (
  fields: Record<string, unknown>,
  messages: Record<string, string>
): FormErrors => {
  const errors: FormErrors = {};
  for (const key of Object.keys(fields)) {
    if (isMissing(fields[key])) {
      errors[key] = messages[key] ?? 'Dette feltet er påkrevd';
    }
  }
  return errors;
};

export const ERROR_COLOR = 'var(--danger-color)';

export const errorBorderStyle = (hasError: boolean) =>
  hasError ? { borderColor: ERROR_COLOR, borderWidth: 1, borderStyle: 'solid' as const } : {};

export const scrollToFirstError = (
  errors: FormErrors,
  fieldRefs: Record<string, HTMLElement | null>
) => {
  const firstKey = Object.keys(errors)[0];
  if (!firstKey) return;
  const el = fieldRefs[firstKey];
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};
