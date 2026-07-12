export function maskSsn(ssn: string): string {
  return `***-**-${ssn.slice(-4)}`
}
