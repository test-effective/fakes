/* eslint-disable @typescript-eslint/no-explicit-any */
const fakepointsToRun: (() => any)[] = [];

/**
 * Registers a fakepoints function to be executed later.
 * The function can optionally return a value that will be collected by runAllFakepoints.
 *
 * @template T - The type of value returned by the fakepoints function
 * @param fakepointsFn - The function to register, can return void or a value
 *
 * @example
 * ```typescript
 * // Register fakepoints without a return value
 * registerFakepoints(() => {
 *   console.log('Setting up fakes');
 * });
 * ```
 */
export function registerFakepoints<T = void>(fakepointsFn: () => T): void {
  fakepointsToRun.push(fakepointsFn);
}

/**
 * Executes all registered fakepoints and collects their return values.
 * If a fakepoint returns an array, it will be automatically flattened.
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
 * Clears all registered fakepoints.
 * Primarily used for testing purposes to reset the registry state.
 *
 * @internal
 */
export function clearAllFakepoints(): void {
  fakepointsToRun.length = 0;
}
