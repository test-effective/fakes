import type { Collection } from '@msw/data';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Creates a factory object with generateOne/generateMany and seedOne/seedMany methods for generating fake data.
 *
 * @template T - The entity type
 * @template Schema - The schema type (StandardSchemaV1)
 *
 * **generateOne()** - Generates a single standalone entity (not stored in DB)
 * - `generateOne()` - Generates one entity with all defaults
 * - `generateOne(partial)` - Generates one entity merging partial with defaults (auto-merged!)
 *
 * **generateMany()** - Generates multiple standalone entities (not stored in DB)
 * - `generateMany(count)` - Generates N entities with defaults (index passed to faketory)
 * - `generateMany(partials[])` - Generates entities merging each partial with defaults (auto-merged!)
 *
 * **seedOne()** - Creates and inserts a single entity into the collection (DB)
 * - `seedOne()` - Creates and stores 1 entity in DB (returns single entity)
 * - `seedOne(partial)` - Creates and stores 1 entity with partial data in DB (auto-merged!)
 *
 * **seedMany()** - Creates and inserts multiple entities into the collection (DB)
 * - `seedMany(count)` - Creates and stores N entities in DB (returns array)
 * - `seedMany(partials[])` - Creates and stores entities with partial data merged (returns array, auto-merged!)
 *
 * **store** - Direct access to the MSW Data collection for queries and updates
 * - Use `store.findMany()`, `store.findFirst()`, `store.update()`, etc.
 * - Exposed to avoid wrapping the entire Collection API
 *
 * **Note:** Partial data is automatically merged with defaults - no need to spread `...partial` in your entity faketory!
 *
 * @example
 * ```typescript
 * // Entity faketory - just return defaults, partial is auto-merged!
 * const messageFaketory = createFaketory(messageCollection, async ({ partial }) => {
 *   return {
 *     id: faker.string.uuid(),
 *     content: faker.lorem.sentence(),
 *     // No need for ...partial here! It's auto-merged by createFaketory
 *   };
 * });
 *
 * // Generate standalone (not in DB)
 * const msg = await messageFaketory.generateOne();
 * const customMsg = await messageFaketory.generateOne({ content: 'Custom' }); // ✅ Auto-merged!
 * const msgs = await messageFaketory.generateMany(5);
 * const msgs = await messageFaketory.generateMany([{ content: 'First' }, { content: 'Second' }]);
 *
 * // Seed into DB
 * const msg = await messageFaketory.seedOne(); // seeds 1 entity, returns T
 * const msg = await messageFaketory.seedOne({ content: 'Custom' }); // ✅ Auto-merged!
 * const msgs = await messageFaketory.seedMany(10); // seeds 10 entities, returns T[]
 * const msgs = await messageFaketory.seedMany([{ content: 'First' }, { content: 'Second' }]); // ✅ Auto-merged!
 *
 * // Query the store directly
 * const messages = messageFaketory.store.findMany();
 * const msg = messageFaketory.store.findFirst(q => q.where({ id: '123' }));
 * ```
 */
export interface Faketory<
  T,
  Schema extends StandardSchemaV1 = StandardSchemaV1,
> {
  /**
   * Generates a single standalone entity (not stored in DB).
   * @param partial - Optional partial data to merge with defaults (auto-merged!)
   */
  generateOne(partial?: Partial<T>): Promise<T>;

  /**
   * Generates multiple standalone entities (not stored in DB).
   * @param count - Number of entities to generate
   */
  generateMany(count: number): Promise<T[]>;
  /**
   * Generates multiple standalone entities (not stored in DB).
   * @param partials - Array of partial data to merge with defaults (auto-merged!)
   */
  generateMany(partials: Partial<T>[]): Promise<T[]>;
  generateMany(input: number | Partial<T>[]): Promise<T[]>;

  /**
   * @deprecated Use `generateOne()` instead. This method will be removed in a future version.
   */
  createOne(partial?: Partial<T>): Promise<T>;
  /**
   * @deprecated Use `generateMany()` instead. This method will be removed in a future version.
   */
  createMany(count: number): Promise<T[]>;
  /**
   * @deprecated Use `generateMany()` instead. This method will be removed in a future version.
   */
  createMany(partials: Partial<T>[]): Promise<T[]>;
  createMany(input: number | Partial<T>[]): Promise<T[]>;

  seedOne(partial?: Partial<T>): Promise<T>;
  seedMany(count: number): Promise<T[]>;
  seedMany(partials: Partial<T>[]): Promise<T[]>;
  seedMany(input: number | Partial<T>[]): Promise<T[]>;

  reset(): void;

  /**
   * Direct access to the MSW Data collection for this entity.
   *
   * Named `store` because it's shorter than `collection` and reads better in code.
   *
   * Use for queries, updates, and direct data manipulation in tests:
   * - `store.findMany()` - Query multiple entities
   * - `store.findFirst()` - Find single entity
   * - `store.update()` - Update entities
   * - `store.delete()` - Delete entities
   */
  readonly store: Collection<Schema>;
}

export type EntityFaketoryProps<T> = {
  seedingMode: boolean;
  partial?: Partial<T>;
  index?: number;
};

export type EntityFaketory<T> = {
  (props: EntityFaketoryProps<T>): Promise<T>;
};

// Lazy initialization to avoid circular dependency issues during module loading
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createdFaketories: Faketory<unknown, any>[] = [];

type InferSchemaOutput<Schema> =
  Schema extends StandardSchemaV1<infer T> ? T : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createFaketory<Schema extends StandardSchemaV1<any>>(
  fakeDbCollection: Collection<Schema>,
  entityFaketory: EntityFaketory<InferSchemaOutput<Schema>>,
): Faketory<InferSchemaOutput<Schema>, Schema> {
  // Wrapper that auto-merges partial with the result
  const wrappedEntityFaketory = async (
    props: EntityFaketoryProps<InferSchemaOutput<Schema>>,
  ): Promise<InferSchemaOutput<Schema>> => {
    const result = await entityFaketory(props);
    // Auto-merge partial if provided - developers don't need to remember!
    return props.partial ? { ...result, ...props.partial } : result;
  };

  /**
   * Generates a single standalone entity (not stored in DB)
   */
  async function generateOne(
    partial?: Partial<InferSchemaOutput<Schema>>,
  ): Promise<InferSchemaOutput<Schema>> {
    return await wrappedEntityFaketory({
      seedingMode: false,
      partial,
      index: 0,
    });
  }

  /**
   * Generates multiple standalone entities (not stored in DB)
   */
  async function generateMany(
    count: number,
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function generateMany(
    partials: Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function generateMany(
    input: number | Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]> {
    // Number - create N entities (pass index to each)
    if (typeof input === 'number') {
      return await Promise.all(
        Array.from({ length: input }, (_, index) =>
          wrappedEntityFaketory({ seedingMode: false, index }),
        ),
      );
    }

    // Array - create entities with partials (pass index to each)
    return await Promise.all(
      input.map((partial, index) =>
        wrappedEntityFaketory({ seedingMode: false, partial, index }),
      ),
    );
  }

  /**
   * @deprecated Use `generateOne()` instead. This method will be removed in a future version.
   * Creates a single standalone entity (not stored in DB)
   */
  async function createOne(
    partial?: Partial<InferSchemaOutput<Schema>>,
  ): Promise<InferSchemaOutput<Schema>> {
    console.warn(
      'createOne() is deprecated and will be removed in a future version. Use generateOne() instead.',
    );
    return await generateOne(partial);
  }

  /**
   * @deprecated Use `generateMany()` instead. This method will be removed in a future version.
   * Creates multiple standalone entities (not stored in DB)
   */
  async function createMany(
    count: number,
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function createMany(
    partials: Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function createMany(
    input: number | Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]> {
    console.warn(
      'createMany() is deprecated and will be removed in a future version. Use generateMany() instead.',
    );
    return await generateMany(
      input as number & Partial<InferSchemaOutput<Schema>>[],
    );
  }

  /**
   * Creates and seeds a single entity into the collection (DB)
   */
  async function seedOne(
    partial?: Partial<InferSchemaOutput<Schema>>,
  ): Promise<InferSchemaOutput<Schema>> {
    return await fakeDbCollection.create(
      await wrappedEntityFaketory({ seedingMode: true, partial, index: 0 }),
    );
  }

  /**
   * Creates and seeds multiple entities into the collection (DB)
   */
  async function seedMany(count: number): Promise<InferSchemaOutput<Schema>[]>;
  async function seedMany(
    partials: Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function seedMany(
    input: number | Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]> {
    const count = typeof input === 'number' ? input : input.length;
    const partials: Array<Partial<InferSchemaOutput<Schema>> | undefined> =
      typeof input === 'number' ? Array(count).fill(undefined) : input;

    const entities: InferSchemaOutput<Schema>[] = [];
    for (let index = 0; index < count; index++) {
      const partial = partials[index];
      entities.push(
        await fakeDbCollection.create(
          await wrappedEntityFaketory({ seedingMode: true, partial, index }),
        ),
      );
    }

    return entities;
  }

  function reset(): void {
    fakeDbCollection.clear();
  }

  const faketory: Faketory<InferSchemaOutput<Schema>, Schema> = {
    generateOne,
    generateMany,
    createOne,
    createMany,
    seedOne,
    seedMany,
    reset,
    store: fakeDbCollection,
  };

  createdFaketories?.push(faketory);

  return faketory;
}

/**
 * Resets all faketories that have been created.
 * Call this in a global beforeEach to ensure a clean state for each test.
 */
export function resetAllFaketories() {
  createdFaketories?.forEach(faketory => {
    faketory.reset();
  });
}
