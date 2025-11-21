import type { Collection } from '@msw/data';
import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Creates a factory object with create() and seed() methods for generating fake data.
 *
 * @template T - The entity type
 * @template Schema - The schema type (StandardSchemaV1)
 *
 * **create()** - Generates standalone entities (not stored in DB)
 * - `create()` - Creates one entity with all defaults
 * - `create(partial)` - Creates one entity merging partial with defaults (auto-merged!)
 * - `create(count)` - Creates N entities with defaults (index passed to faketory)
 * - `create(partials[])` - Creates entities merging each partial with defaults (auto-merged!)
 *
 * **seed()** - Inserts entities into the collection (DB)
 * - `seed()` - Creates and stores 1 entity in DB (returns single entity)
 * - `seed(partial)` - Creates and stores 1 entity with partial data in DB (returns single entity, auto-merged!)
 * - `seed(count)` - Creates and stores N entities in DB (returns array)
 * - `seed(partials[])` - Creates and stores entities with partial data merged (returns array, auto-merged!)
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
 * // Create standalone (not in DB)
 * const msg = await messageFaketory.create();
 * const msgs = await messageFaketory.create(5);
 * const customMsg = await messageFaketory.create({ content: 'Custom' }); // ✅ Auto-merged!
 *
 * // Seed into DB
 * const msg = await messageFaketory.seed(); // seeds 1 entity, returns T
 * const msg = await messageFaketory.seed({ content: 'Custom' }); // ✅ Auto-merged!
 * const msgs = await messageFaketory.seed(10); // seeds 10 entities, returns T[]
 * const msgs = await messageFaketory.seed([{ content: 'First' }, { content: 'Second' }]); // ✅ Auto-merged!
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
  create(): Promise<T>;
  create(partial: Partial<T>): Promise<T>;
  create(count: number): Promise<T[]>;
  create(partials: Partial<T>[]): Promise<T[]>;
  create(input?: number | Partial<T> | Partial<T>[]): Promise<T | T[]>;

  seed(): Promise<T>;
  seed(partial: Partial<T>): Promise<T>;
  seed(count: number): Promise<T[]>;
  seed(partials: Partial<T>[]): Promise<T[]>;
  seed(input?: number | Partial<T> | Partial<T>[]): Promise<T | T[]>;

  reset(): void;

  /**
   * Direct access to the MSW Data collection for this entity.
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

type InferSchemaOutput<Schema> = Schema extends StandardSchemaV1<infer T>
  ? T
  : never;

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
   * Creates standalone entities (not stored in DB)
   */
  async function create(): Promise<InferSchemaOutput<Schema>>;
  async function create(
    partial: Partial<InferSchemaOutput<Schema>>,
  ): Promise<InferSchemaOutput<Schema>>;
  async function create(count: number): Promise<InferSchemaOutput<Schema>[]>;
  async function create(
    partials: Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function create(
    input?:
      | number
      | Partial<InferSchemaOutput<Schema>>
      | Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema> | InferSchemaOutput<Schema>[]> {
    // No input - create one with defaults
    if (input === undefined) {
      return await wrappedEntityFaketory({ seedingMode: false });
    }

    // Number - create N entities (pass index to each)
    if (typeof input === 'number') {
      return await Promise.all(
        Array.from({ length: input }, (_, index) =>
          wrappedEntityFaketory({ seedingMode: false, index }),
        ),
      );
    }

    // Array - create entities with partials (pass index to each)
    if (Array.isArray(input)) {
      return await Promise.all(
        input.map((partial, index) =>
          wrappedEntityFaketory({ seedingMode: false, partial, index }),
        ),
      );
    }

    // Single partial object
    return await wrappedEntityFaketory({ seedingMode: false, partial: input });
  }

  /**
   * Seeds entities into the collection (DB)
   */
  async function seed(): Promise<InferSchemaOutput<Schema>>;
  async function seed(
    partial: Partial<InferSchemaOutput<Schema>>,
  ): Promise<InferSchemaOutput<Schema>>;
  async function seed(count: number): Promise<InferSchemaOutput<Schema>[]>;
  async function seed(
    partials: Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema>[]>;
  async function seed(
    input?:
      | number
      | Partial<InferSchemaOutput<Schema>>
      | Partial<InferSchemaOutput<Schema>>[],
  ): Promise<InferSchemaOutput<Schema> | InferSchemaOutput<Schema>[]> {
    // Determine count and partials array
    let count = 1;
    let partials: Array<Partial<InferSchemaOutput<Schema>> | undefined> = [
      undefined,
    ];

    if (input === undefined) {
      count = 1;
      partials = [undefined];
    } else if (typeof input === 'number') {
      count = input;
      partials = Array(count).fill(undefined);
    } else if (Array.isArray(input)) {
      count = input.length;
      partials = input;
    } else {
      // Single partial object
      count = 1;
      partials = [input];
    }

    const entities: InferSchemaOutput<Schema>[] = [];
    for (let index = 0; index < count; index++) {
      const partial = partials[index];
      entities.push(
        await fakeDbCollection.create(
          await wrappedEntityFaketory({ seedingMode: true, partial, index }),
        ),
      );
    }

    return count === 1 ? entities[0] : entities;
  }

  function reset(): void {
    fakeDbCollection.clear();
  }

  const faketory: Faketory<InferSchemaOutput<Schema>, Schema> = {
    create,
    seed,
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
