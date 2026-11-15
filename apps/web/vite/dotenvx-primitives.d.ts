// @dotenvx/primitives 3.3.1 ships no types. This is its documented basic scan API.
declare module '@dotenvx/primitives' {
  export const scan: (source: string) => { parsed: Record<string, string[]> }
}
