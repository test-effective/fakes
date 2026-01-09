import { beforeEach, describe, expect, test } from 'vitest';
import {
  clearAllFakepoints,
  registerFakepoints,
  runAllFakepoints,
} from './fakepoints-registry.js';

describe('fakepoints-registry', () => {
  // Clear the registry between tests to avoid state pollution
  beforeEach(() => {
    clearAllFakepoints();
  });

  describe('registerFakepoints', () => {
    test(`GIVEN fakepoints without return value,
THEN executes the fakepoints`, () => {
      let executed = false;
      registerFakepoints(() => {
        executed = true;
      });

      runAllFakepoints();
      expect(executed).toBe(true);
    });

    test(`GIVEN fakepoints with return value,
THEN collects the return value`, () => {
      registerFakepoints(() => {
        return 'test-value';
      });

      const results = runAllFakepoints<string>();
      expect(results).toEqual(['test-value']);
    });

    test(`GIVEN multiple fakepoints with different return types,
THEN collects all return values`, () => {
      registerFakepoints(() => 'string-value');
      registerFakepoints(() => 42);
      registerFakepoints(() => ({ key: 'value' }));

      const results = runAllFakepoints<string | number | object>();
      expect(results).toHaveLength(3);
      expect(results).toContain('string-value');
      expect(results).toContain(42);
      expect(results).toContainEqual({ key: 'value' });
    });
  });

  describe('runAllFakepoints', () => {
    test(`GIVEN multiple registered fakepoints,
THEN executes all fakepoints in registration order`, () => {
      const executionOrder: number[] = [];

      registerFakepoints(() => {
        executionOrder.push(1);
      });
      registerFakepoints(() => {
        executionOrder.push(2);
      });
      registerFakepoints(() => {
        executionOrder.push(3);
      });

      runAllFakepoints();
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    test(`GIVEN fakepoints that return void,
THEN returns empty array`, () => {
      registerFakepoints(() => {
        console.log('test');
      });

      const results = runAllFakepoints();
      expect(results).toEqual([]);
    });

    test(`GIVEN fakepoints with return values,
THEN collects all return values`, () => {
      registerFakepoints(() => 'first');
      registerFakepoints(() => 'second');
      registerFakepoints(() => 'third');

      const results = runAllFakepoints<string>();
      expect(results).toEqual(['first', 'second', 'third']);
    });

    test(`GIVEN mixed void and non-void fakepoints,
THEN collects only non-void return values`, () => {
      registerFakepoints(() => {
        // void return
      });
      registerFakepoints(() => 'has-value');
      registerFakepoints(() => {
        // another void return
      });
      registerFakepoints(() => 'another-value');

      const results = runAllFakepoints<string>();
      expect(results).toEqual(['has-value', 'another-value']);
    });
  });

  describe('collecting return values', () => {
    test(`GIVEN fakepoints that return arrays,
THEN collects arrays as-is without flattening`, () => {
      registerFakepoints(() => ['a', 'b', 'c']);
      registerFakepoints(() => ['d', 'e']);
      registerFakepoints(() => ['f']);

      const results = runAllFakepoints<string[]>();

      expect(results).toEqual([['a', 'b', 'c'], ['d', 'e'], ['f']]);
    });

    test(`GIVEN fakepoints that return objects,
THEN collects all objects`, () => {
      registerFakepoints(() => ({ count: 3 }));
      registerFakepoints(() => ({ count: 5 }));

      const results = runAllFakepoints<{ count: number }>();

      expect(results).toEqual([{ count: 3 }, { count: 5 }]);
    });

    test(`GIVEN fakepoints that return strings,
THEN collects all strings`, () => {
      registerFakepoints(() => 'first');
      registerFakepoints(() => 'second');
      registerFakepoints(() => 'third');

      const results = runAllFakepoints<string>();

      expect(results).toEqual(['first', 'second', 'third']);
    });

    test(`GIVEN fakepoints that return arrays (e.g., Angular providers),
WHEN user flattens results,
THEN provides all items from all arrays`, () => {
      // Simulating Angular providers structure
      type Provider = { provide: string; useValue: unknown };

      registerFakepoints(() => {
        return [
          { provide: 'UserService', useValue: { name: 'mock-user-service' } },
          { provide: 'AuthService', useValue: { name: 'mock-auth-service' } },
        ];
      });

      registerFakepoints(() => {
        return [
          { provide: 'DataService', useValue: { name: 'mock-data-service' } },
        ];
      });

      // Get arrays of providers
      const providerArrays = runAllFakepoints<Provider[]>();
      expect(providerArrays).toHaveLength(2);

      // User flattens them
      const allProviders = providerArrays.flat();
      expect(allProviders).toHaveLength(3);
      expect(allProviders.map(p => p.provide)).toEqual([
        'UserService',
        'AuthService',
        'DataService',
      ]);
    });
  });
});
