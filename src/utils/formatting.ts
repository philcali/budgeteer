/**
 * Format cents (integer) to a USD currency string.
 * e.g. 1234 → "$12.34"
 */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/**
 * Convert an ISO date string to a local date string.
 * Appends 'T00:00:00' to avoid UTC offset shifts.
 * e.g. "2024-01-15" → "Jan 15, 2024"
 */
export function getLocalDateString(isoString: string): string {
  const date = new Date(isoString + 'T00:00:00')
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}
