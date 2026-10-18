import path from 'path';

/**
 * Escapes values for safe CSV export, preventing CSV Formula Injection (CWE-1236).
 * Any text beginning with =, +, -, @, \t, or \r is prefixed with a single quote.
 * Values containing commas, quotes, or newlines are wrapped in double quotes.
 */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Formula injection mitigation
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousPrefixes.some((prefix) => str.startsWith(prefix))) {
    str = `'${str}`;
  }

  // Double quotes escaping
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Sanitizes a filename to prevent path traversal or filesystem issues.
 */
export function sanitizeFilename(filename: string): string {
  // Extract basename only
  const base = path.basename(filename);
  // Remove non-alphanumeric, dot, dash, underscore
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Avoid leading dots or empty names
  return sanitized.replace(/^\.+/, '') || 'document';
}

/**
 * Validates that a requested path stays inside the target directory.
 */
export function isPathInsideDirectory(targetPath: string, parentDir: string): boolean {
  const rel = path.relative(parentDir, targetPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
