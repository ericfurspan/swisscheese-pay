// Models a hypothetical external fraud/velocity check. The delay is what
// creates a real interleaving window across concurrent requests on a
// synchronous, single-threaded SQLite setup -- see
// docs/superpowers/specs/2026-07-12-phase-3-money-movement-design.md §3.1.
export function mockFraudCheck(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50))
}
