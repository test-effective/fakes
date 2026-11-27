/* eslint-disable @typescript-eslint/no-explicit-any */
const fakepointsToRun: (() => any)[] = [];
const fakepointsResets: (() => void)[] = [];

export interface RegisterFakepointsOptions {
  /**
   * Clears state the fakepoints module keeps between tests.
   * Shorthand for calling `registerFakepointsReset(reset)`.
   */
  reset?: () => void;
}

/**
 * Registers a fakepoints function to be executed later.
 * The function can optionally return a value that will be collected by runAllFakepoints.
 *
 * @template T - The type of value returned by the fakepoints function
 * @param fakepointsFn - The function to register, can return void or a value
 * @param options - Optional settings, e.g. a `reset` to run on `resetAllFakepoints()`
 *
 * @example
 * ```typescript
 * // Register fakepoints without a return value
 * registerFakepoints(() => {
 *   console.log('Setting up fakes');
 * });
 *
 * // Register fakepoints with a reset for the state they keep
 * registerFakepoints(() => [{ provide: Api, useClass: FakeApi }], {
 *   reset: () => failingMethods.clear(),
 * });
 * ```
 */
export function registerFakepoints<T = void>(
  fakepointsFn: () => T,
  options?: RegisterFakepointsOptions,
): void {
  fakepointsToRun.push(fakepointsFn);
  if (options?.reset) {
    registerFakepointsReset(options.reset);
  }
}

/**
 * Registers a function that clears state a fakepoints module keeps between tests.
 * All registered resets run when `resetAllFakepoints()` is called.
 *
 * Use this instead of a top-level `afterEach` in a fakepoints module: with
 * `isolate: false` the module is evaluated once per worker, so the hook would
 * only attach to the first test file that loaded it.
 *
 * @param resetFn - The function that clears the state
 *
 * @example
 * ```typescript
 * const failingMethods = new Set<string>();
 *
 * registerFakepointsReset(() => failingMethods.clear());
 * ```
 */
export function registerFakepointsReset(resetFn: () => void): void {
  fakepointsResets.push(resetFn);
}

/**
 * Runs all resets registered with `registerFakepointsReset()` or
 * `registerFakepoints(fn, { reset })`, in registration order.
 * Call it in a global `beforeEach`, next to `resetAllFaketories()`.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   resetAllFaketories();
 *   resetAllFakepoints();
 * });
 * ```
 */
export function resetAllFakepoints(): void {
  for (const resetFn of fakepointsResets) {
    resetFn();
  }
}

/**
 * Executes all registered fakepoints and collects their return values.
 * If fakepoints  returns an array, it will be automatically flattened.
 *
 * @template T - The type of individual items in the returned array
 * @returns An array of collected values from all fakepoints (empty if fakepoints return void)
 *
 * @example
 * ```typescript
 * // Simple execution without collecting values
 * runAllFakepoints();
 *
 * // Collect return values with type safety
 * const results = runAllFakepoints<string>();
 *
 * ```
 */
export function runAllFakepoints<T = void>(): T[] {
  const results: T[] = [];

  for (const fakepointsFn of fakepointsToRun) {
    const result = fakepointsFn();

    if (result === undefined) {
      continue;
    }
    results.push(result as T);
  }

  return results;
}

/**
 * Clears all registered fakepoints and fakepoints resets.
 * Primarily used for testing purposes to reset the registry state.
 *
 * @internal
 */
export function clearAllFakepoints(): void {
  fakepointsToRun.length = 0;
  fakepointsResets.length = 0;
}
