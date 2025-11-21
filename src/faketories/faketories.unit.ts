import { faker } from '@faker-js/faker';
import { Collection } from '@msw/data';
import * as v from 'valibot';
import { describe, expect, test } from 'vitest';
import { createFaketory, resetAllFaketories } from './faketories.js';

// Test schemas
const userSchema = v.object({
  id: v.number(),
  email: v.string(),
  name: v.string(),
});

type User = v.InferInput<typeof userSchema>;

function setup() {
  const userStore = new Collection({ schema: userSchema });
  const userFaketory = createFaketory(userStore, async ({ index }) => {
    // Note: partial is auto-merged by createFaketory, so we don't spread it here
    return {
      id:
        index !== undefined
          ? index + 1
          : faker.number.int({ min: 1, max: 999999 }),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    };
  });
  userStore.clear();

  return {
    userStore,
    userFaketory,
  };
}

describe('createFaketory', () => {
  describe('create()', () => {
    test(`GIVEN no arguments,
           THEN creates one entity with defaults`, async () => {
      const { userFaketory } = setup();
      const user = await userFaketory.create();

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(typeof user.id).toBe('number');
      expect(typeof user.email).toBe('string');
      expect(typeof user.name).toBe('string');
    });

    test(`GIVEN partial object,
           THEN creates entity with merged partial data`, async () => {
      const { userFaketory } = setup();
      const partial = { email: 'test@example.com', name: 'Test User' };
      const user = await userFaketory.create(partial);

      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user).toHaveProperty('id');
      expect(typeof user.id).toBe('number');
    });

    test(`GIVEN count number,
           THEN creates array of entities`, async () => {
      const { userFaketory } = setup();
      const users = await userFaketory.create(5);

      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(5);
      users.forEach((user: User, index: number) => {
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('name');
        // Index should be passed to faketory (id = index + 1)
        expect(user.id).toBe(index + 1);
      });
    });

    test(`GIVEN array of partials,
           THEN creates entities with merged partials`, async () => {
      const { userFaketory } = setup();
      const partials = [
        { email: 'first@example.com' },
        { email: 'second@example.com', name: 'Second User' },
      ];
      const users = await userFaketory.create(partials);

      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(2);
      expect(users[0].email).toBe('first@example.com');
      expect(users[1].email).toBe('second@example.com');
      expect(users[1].name).toBe('Second User');
      expect(users[0]).toHaveProperty('id');
      expect(users[1]).toHaveProperty('id');
    });

    test(`GIVEN create() is called,
           THEN entities are NOT stored in collection`, async () => {
      const { userStore, userFaketory } = setup();
      await userFaketory.create();
      await userFaketory.create(3);

      const allUsers = userStore.findMany();
      expect(allUsers).toHaveLength(0);
    });
  });

  describe('seed()', () => {
    test(`GIVEN no arguments,
           THEN seeds one entity and returns it`, async () => {
      const { userStore, userFaketory } = setup();
      const user = await userFaketory.seed();

      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');

      const allUsers = userStore.findMany();
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].id).toBe(user.id);
    });

    test(`GIVEN partial object,
           THEN seeds entity with merged partial and returns it`, async () => {
      const { userStore, userFaketory } = setup();
      const partial = { email: 'seeded@example.com', name: 'Seeded User' };
      const user = await userFaketory.seed(partial);

      expect(user.email).toBe('seeded@example.com');
      expect(user.name).toBe('Seeded User');
      expect(user).toHaveProperty('id');

      const allUsers = userStore.findMany();
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0].email).toBe('seeded@example.com');
    });

    test(`GIVEN count number,
           THEN seeds multiple entities and returns array`, async () => {
      const { userStore, userFaketory } = setup();
      const users = await userFaketory.seed(5);

      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(5);

      const allUsers = userStore.findMany();
      expect(allUsers).toHaveLength(5);
      users.forEach((user: User, index: number) => {
        expect(user.id).toBe(allUsers[index].id);
        expect(user.id).toBe(index + 1); // Index-based ID
      });
    });

    test(`GIVEN array of partials,
           THEN seeds entities with merged partials and returns array`, async () => {
      const { userStore, userFaketory } = setup();
      const partials = [
        { email: 'first@example.com' },
        { email: 'second@example.com', name: 'Second' },
        { id: 100, email: 'third@example.com' },
      ];
      const users = await userFaketory.seed(partials);

      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(3);

      const allUsers = userStore.findMany();
      expect(allUsers).toHaveLength(3);
      expect(allUsers[0].email).toBe('first@example.com');
      expect(allUsers[1].email).toBe('second@example.com');
      expect(allUsers[1].name).toBe('Second');
      expect(allUsers[2].id).toBe(100);
      expect(allUsers[2].email).toBe('third@example.com');
    });

    test(`GIVEN seed() is called multiple times,
           THEN all entities are stored`, async () => {
      const { userStore, userFaketory } = setup();
      await userFaketory.seed();
      await userFaketory.seed({ email: 'second@example.com' });
      await userFaketory.seed(3);

      const allUsers = userStore.findMany();
      expect(allUsers).toHaveLength(5); // 1 + 1 + 3
    });
  });

  describe('reset()', () => {
    test(`GIVEN entities seeded,
           THEN collection is cleared`, async () => {
      const { userStore, userFaketory } = setup();
      await userFaketory.seed(5);
      expect(userStore.findMany()).toHaveLength(5);

      userFaketory.reset();

      expect(userStore.findMany()).toHaveLength(0);
    });

    test(`GIVEN multiple faketories,
           THEN only that collection is cleared`, async () => {
      const { userStore, userFaketory } = setup();
      const postSchema = v.object({
        id: v.number(),
        title: v.string(),
      });
      const postStore = new Collection({ schema: postSchema });
      const postFaketory = createFaketory(postStore, async () => ({
        id: 1,
        title: 'Test Post',
      }));

      await userFaketory.seed(3);
      await postFaketory.seed(2);

      expect(userStore.findMany()).toHaveLength(3);
      expect(postStore.findMany()).toHaveLength(2);

      userFaketory.reset();

      expect(userStore.findMany()).toHaveLength(0);
      expect(postStore.findMany()).toHaveLength(2);
    });
  });

  describe('store access', () => {
    test(`GIVEN store accessed,
           THEN can use all Collection methods`, async () => {
      const { userFaketory } = setup();
      await userFaketory.seed([
        { id: 1, email: 'one@example.com' },
        { id: 2, email: 'two@example.com' },
        { id: 3, email: 'three@example.com' },
      ]);

      const allUsers = userFaketory.store.findMany();
      expect(allUsers).toHaveLength(3);

      const firstUser = allUsers.find(u => u.id === 1);
      expect(firstUser?.email).toBe('one@example.com');

      const secondUser = allUsers.find(u => u.id === 2);
      expect(secondUser?.email).toBe('two@example.com');
    });
  });

  describe('EntityFaketory props', () => {
    test(`GIVEN create() called,
           THEN seedingMode is false`, async () => {
      let receivedSeedingMode = true;
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(
        testStore,
        async ({ seedingMode }) => {
          receivedSeedingMode = seedingMode;
          return { id: 1, email: 'test@example.com', name: 'Test' };
        },
      );

      await testFaketory.create();

      expect(receivedSeedingMode).toBe(false);
    });

    test(`GIVEN seed() called,
           THEN seedingMode is true`, async () => {
      let receivedSeedingMode = false;
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(
        testStore,
        async ({ seedingMode }) => {
          receivedSeedingMode = seedingMode;
          return { id: 1, email: 'test@example.com', name: 'Test' };
        },
      );

      await testFaketory.seed();

      expect(receivedSeedingMode).toBe(true);
    });

    test(`GIVEN create(count) called,
           THEN index is passed to faketory`, async () => {
      const receivedIndexes: number[] = [];
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(testStore, async ({ index }) => {
        if (index !== undefined) {
          receivedIndexes.push(index);
        }
        return {
          id: index !== undefined ? index + 1 : 1,
          email: 'test@example.com',
          name: 'Test',
        };
      });

      await testFaketory.create(5);

      expect(receivedIndexes).toEqual([0, 1, 2, 3, 4]);
    });

    test(`GIVEN seed(count) called,
           THEN index is passed to faketory`, async () => {
      const receivedIndexes: number[] = [];
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(testStore, async ({ index }) => {
        if (index !== undefined) {
          receivedIndexes.push(index);
        }
        return {
          id: index !== undefined ? index + 1 : 1,
          email: 'test@example.com',
          name: 'Test',
        };
      });

      await testFaketory.seed(5);

      expect(receivedIndexes).toEqual([0, 1, 2, 3, 4]);
    });

    test(`GIVEN create(partials[]) called,
           THEN index is passed to faketory`, async () => {
      const receivedIndexes: number[] = [];
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(testStore, async ({ index }) => {
        if (index !== undefined) {
          receivedIndexes.push(index);
        }
        return {
          id: index !== undefined ? index + 1 : 1,
          email: 'test@example.com',
          name: 'Test',
        };
      });

      await testFaketory.create([
        { email: 'one@example.com' },
        { email: 'two@example.com' },
        { email: 'three@example.com' },
      ]);

      expect(receivedIndexes).toEqual([0, 1, 2]);
    });

    test(`GIVEN seed(partials[]) called,
           THEN index is passed to faketory`, async () => {
      const receivedIndexes: number[] = [];
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(testStore, async ({ index }) => {
        if (index !== undefined) {
          receivedIndexes.push(index);
        }
        return {
          id: index !== undefined ? index + 1 : 1,
          email: 'test@example.com',
          name: 'Test',
        };
      });

      await testFaketory.seed([
        { email: 'one@example.com' },
        { email: 'two@example.com' },
        { email: 'three@example.com' },
      ]);

      expect(receivedIndexes).toEqual([0, 1, 2]);
    });
  });

  describe('seedingMode with relations', () => {
    test(`GIVEN seedingMode is true,
           THEN related entities are seeded and can be read from their store`, async () => {
      // Define participant schema and faketory
      const participantSchema = v.object({
        id: v.string(),
        userId: v.string(),
        role: v.string(),
      });

      const participantStore = new Collection({ schema: participantSchema });
      const participantFaketory = createFaketory(
        participantStore,
        async ({ index }) => ({
          id: `participant-${index ?? faker.string.uuid()}`,
          userId: faker.string.uuid(),
          role: faker.helpers.arrayElement(['owner', 'member', 'admin']),
        }),
      );

      // Define conversation schema and faketory
      const conversationSchema = v.object({
        id: v.string(),
        title: v.string(),
        participants: v.array(participantSchema),
      });

      const conversationStore = new Collection({ schema: conversationSchema });

      // Define relation
      conversationStore.defineRelations(({ many }) => ({
        participants: many(participantFaketory.store),
      }));

      const conversationFaketory = createFaketory(
        conversationStore,
        async ({ seedingMode }) => {
          const participantCount = 2;
          const fakeParticipants = seedingMode
            ? await participantFaketory.seed(participantCount)
            : await participantFaketory.create(participantCount);

          return {
            id: faker.string.uuid(),
            title: faker.lorem.sentence(),
            participants: fakeParticipants,
          };
        },
      );

      // Seed a conversation (seedingMode should be true)
      const conversation = await conversationFaketory.seed();

      // Verify conversation was created
      expect(conversation).toBeTruthy();
      expect(conversation.participants).toHaveLength(2);

      // Verify participants were seeded and can be read from participant store
      const allParticipants = participantStore.findMany();
      expect(allParticipants).toHaveLength(2);
      expect(allParticipants[0].id).toBe(conversation.participants[0].id);
      expect(allParticipants[1].id).toBe(conversation.participants[1].id);
    });

    test(`GIVEN seedingMode is false,
           THEN related entities are NOT seeded and cannot be read from their store`, async () => {
      // Define participant schema and faketory
      const participantSchema = v.object({
        id: v.string(),
        userId: v.string(),
        role: v.string(),
      });

      const participantStore = new Collection({ schema: participantSchema });
      const participantFaketory = createFaketory(
        participantStore,
        async ({ index }) => ({
          id: `participant-${index ?? faker.string.uuid()}`,
          userId: faker.string.uuid(),
          role: faker.helpers.arrayElement(['owner', 'member', 'admin']),
        }),
      );

      // Define conversation schema and faketory
      const conversationSchema = v.object({
        id: v.string(),
        title: v.string(),
        participants: v.array(participantSchema),
      });

      const conversationStore = new Collection({ schema: conversationSchema });

      // Define relation
      conversationStore.defineRelations(({ many }) => ({
        participants: many(participantFaketory.store),
      }));

      const conversationFaketory = createFaketory(
        conversationStore,
        async ({ seedingMode }) => {
          const participantCount = 2;
          const fakeParticipants = seedingMode
            ? await participantFaketory.seed(participantCount)
            : await participantFaketory.create(participantCount);

          return {
            id: faker.string.uuid(),
            title: faker.lorem.sentence(),
            participants: fakeParticipants,
          };
        },
      );

      // Create a conversation (seedingMode should be false)
      const conversation = await conversationFaketory.create();

      // Verify conversation was created
      expect(conversation).toBeTruthy();
      expect(conversation.participants).toHaveLength(2);

      // Verify participants were NOT seeded and cannot be read from participant store
      const allParticipants = participantStore.findMany();
      expect(allParticipants).toHaveLength(0);
    });
  });

  describe('auto-merge functionality', () => {
    test(`GIVEN faketory returns defaults,
           WHEN partial provided,
           THEN partial is auto-merged and overrides defaults`, async () => {
      // Faketory that doesn't manually merge partial
      const testStore = new Collection({ schema: userSchema });
      const testFaketory = createFaketory(testStore, async () => {
        // Note: not spreading partial here - createFaketory handles it
        return {
          id: 1,
          email: 'default@example.com',
          name: 'Default Name',
        };
      });

      const user = await testFaketory.create({
        id: 999,
        email: 'custom@example.com',
      });

      expect(user.id).toBe(999); // Partial overrides
      expect(user.email).toBe('custom@example.com'); // Partial overrides
      expect(user.name).toBe('Default Name'); // Default preserved
    });
  });
});

describe('resetAllFaketories', () => {
  test(`GIVEN multiple faketories created,
           THEN all are reset`, async () => {
    const userSchema = v.object({
      id: v.number(),
      email: v.string(),
    });
    const postSchema = v.object({
      id: v.number(),
      title: v.string(),
    });

    const userStore = new Collection({ schema: userSchema });
    const postStore = new Collection({ schema: postSchema });

    const userFaketory = createFaketory(userStore, async () => ({
      id: 1,
      email: 'test@example.com',
    }));
    const postFaketory = createFaketory(postStore, async () => ({
      id: 1,
      title: 'Test Post',
    }));

    await userFaketory.seed(3);
    await postFaketory.seed(2);

    expect(userStore.findMany()).toHaveLength(3);
    expect(postStore.findMany()).toHaveLength(2);

    resetAllFaketories();

    expect(userStore.findMany()).toHaveLength(0);
    expect(postStore.findMany()).toHaveLength(0);
  });

  test(`GIVEN no faketories created,
           THEN handles gracefully`, () => {
    expect(() => resetAllFaketories()).not.toThrow();
  });
});
