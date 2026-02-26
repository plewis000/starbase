/**
 * Shared input validation utilities for all API routes.
 * Centralizes sanitization, format checks, and constraint enforcement.
 */

// ---- STRING VALIDATION ----

/** Trim and validate a required string field. Returns null if invalid. */
export function validateRequiredString(
  value: unknown,
  fieldName: string,
  maxLength = 500
): { valid: true; value: string } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }
  if (trimmed.length > maxLength) {
    return { valid: false, error: `${fieldName} must be ${maxLength} characters or fewer` };
  }
  return { valid: true, value: trimmed };
}

/** Validate an optional string field. Returns null value if not provided. */
export function validateOptionalString(
  value: unknown,
  fieldName: string,
  maxLength = 2000
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }
  if (typeof value !== "string") {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} must be ${maxLength} characters or fewer` };
  }
  return { valid: true, value: value.trim() };
}

// ---- UUID VALIDATION ----

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate a UUID format. */
export function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/** Validate a required UUID field. */
export function validateRequiredUUID(
  value: unknown,
  fieldName: string
): { valid: true; value: string } | { valid: false; error: string } {
  if (!value) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (!isValidUUID(value)) {
    return { valid: false, error: `${fieldName} must be a valid UUID` };
  }
  return { valid: true, value: value };
}

/** Validate an optional UUID field. */
export function validateOptionalUUID(
  value: unknown,
  fieldName: string
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }
  if (!isValidUUID(value)) {
    return { valid: false, error: `${fieldName} must be a valid UUID` };
  }
  return { valid: true, value: value };
}

// ---- DATE VALIDATION ----

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a date string in YYYY-MM-DD format. Also checks it's a real date. */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Validate a required date field. */
export function validateRequiredDate(
  value: unknown,
  fieldName: string
): { valid: true; value: string } | { valid: false; error: string } {
  if (!value) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (!isValidDate(value)) {
    return { valid: false, error: `${fieldName} must be a valid date (YYYY-MM-DD)` };
  }
  return { valid: true, value: value };
}

/** Validate an optional date field. */
export function validateOptionalDate(
  value: unknown,
  fieldName: string
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }
  if (!isValidDate(value)) {
    return { valid: false, error: `${fieldName} must be a valid date (YYYY-MM-DD)` };
  }
  return { valid: true, value: value };
}

// ---- NUMERIC VALIDATION ----

/** Validate a required positive integer. */
export function validatePositiveInt(
  value: unknown,
  fieldName: string,
  min = 1,
  max = 10000
): { valid: true; value: number } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: false, error: `${fieldName} is required` };
  }
  const num = typeof value === "string" ? parseInt(value, 10) : value;
  if (typeof num !== "number" || !Number.isInteger(num) || num < min || num > max) {
    return { valid: false, error: `${fieldName} must be an integer between ${min} and ${max}` };
  }
  return { valid: true, value: num };
}

/** Validate an optional positive number (float allowed). */
export function validateOptionalNumber(
  value: unknown,
  fieldName: string,
  min = 0,
  max = 1000000
): { valid: true; value: number | null } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (typeof num !== "number" || isNaN(num) || num < min || num > max) {
    return { valid: false, error: `${fieldName} must be a number between ${min} and ${max}` };
  }
  return { valid: true, value: num };
}

// ---- ENUM VALIDATION ----

/** Validate a value is in an allowed list. */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): { valid: true; value: T } | { valid: false; error: string } {
  if (!allowedValues.includes(value as T)) {
    return {
      valid: false,
      error: `${fieldName} must be one of: ${allowedValues.join(", ")}`,
    };
  }
  return { valid: true, value: value as T };
}

// ---- ARRAY VALIDATION ----

/** Validate an optional array of UUIDs. */
export function validateUUIDArray(
  value: unknown,
  fieldName: string,
  maxLength = 50
): { valid: true; value: string[] } | { valid: false; error: string } {
  if (!value || !Array.isArray(value)) {
    return { valid: true, value: [] };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} cannot have more than ${maxLength} items` };
  }
  for (const item of value) {
    if (!isValidUUID(item)) {
      return { valid: false, error: `${fieldName} contains an invalid UUID: ${String(item).slice(0, 50)}` };
    }
  }
  return { valid: true, value: value };
}

/** Validate specific_days array (0-6, Sun-Sat). */
export function validateSpecificDays(
  value: unknown
): { valid: true; value: number[] | null } | { valid: false; error: string } {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }
  if (!Array.isArray(value)) {
    return { valid: false, error: "specific_days must be an array" };
  }
  if (value.length > 7) {
    return { valid: false, error: "specific_days cannot have more than 7 entries" };
  }
  for (const d of value) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
      return { valid: false, error: "specific_days values must be integers 0-6 (Sun-Sat)" };
    }
  }
  // Deduplicate
  const unique = [...new Set(value)];
  return { valid: true, value: unique };
}

// ---- REQUEST BODY PARSING ----

/** Safely parse JSON body, returning an error response if it fails. */
export async function safeParseBody(
  request: Request
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { ok: false, error: "Request body must be a JSON object" };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Invalid JSON in request body" };
  }
}

// ---- SEARCH INPUT SANITIZATION ----

/** Sanitize search input to prevent SQL/PostgREST injection. */
export function sanitizeSearchInput(input: string, maxLength = 200): string {
  return input
    .replace(/[%_\\]/g, (c) => `\\${c}`)  // Escape LIKE wildcards
    .slice(0, maxLength)
    .trim();
}

// ---- PAGINATION VALIDATION ----

export function validatePagination(
  limit: string | null,
  offset: string | null,
  maxLimit = 200
): { limit: number; offset: number } {
  const parsedLimit = Math.min(
    Math.max(1, parseInt(limit || "50", 10) || 50),
    maxLimit
  );
  const parsedOffset = Math.max(0, parseInt(offset || "0", 10) || 0);
  return { limit: parsedLimit, offset: parsedOffset };
}
