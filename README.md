<div align="center">
<h1>Test Effective Fakes</h1>




**Fake DB for UI Component Tests** 🎭
</div>

A powerful testing library that makes creating fake data with [MSW Data](https://github.com/mswjs/data) effortless. Create factories with auto-merged partials and organize test setup code with auto-discovered fakepoints.

*No real data was harmed in the making of this library.*

## Requirements

- `@msw/data` `^1.0.0` (peer dependency)
- Vite (if you're using the fakepoints plugin)

## Installation

```bash
pnpm install -D @test-effective/fakes @msw/data
```

## Faketories

Faketories are factories for generating fake test data.
Basically, "factories of fakes"... "Faketories"... I know, bad pun 😅.

They provide four methods:
- `createOne()` / `createMany()` - Generate standalone entities (not stored in DB)
- `seedOne()` / `seedMany()` - Generate and store entities in your MSW Data collection


### Quick Start

```typescript
import { createFaketory } from '@test-effective/fakes';
import { Collection } from '@msw/data';
import { faker } from '@faker-js/faker';
import * as v from 'valibot';

// Define your schema
const userSchema = v.object({
  id: v.string(),
  email: v.string(),
  name: v.string(),
});

// Create a collection
const userCollection = new Collection({ schema: userSchema });

// Create a faketory
const userFaketory = createFaketory(userCollection, async ({ partial }) => {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    name: faker.person.fullName(),
    // partial is auto-merged - no need for ...partial!
  };
});

// Use it in tests
const user = await userFaketory.seedOne({ email: 'test@example.com' });
```



### Creating a Faketory

```typescript
const userFaketory = createFaketory(
  userCollection, // MSW Data Collection
  async ({ partial, seedingMode, index }) => {
    // Return default values
    // partial is automatically merged - don't spread it!
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName(),
    };
  }
);
```

**Props available in your faketory function:**
- `partial` - Override values passed to `createOne()`, `createMany()`, `seedOne()`, or `seedMany()`
- `seedingMode` - `true` when called via `seedOne()`/`seedMany()`, `false` for `createOne()`/`createMany()`
- `index` - Index when creating entities (0 for single, 0-N for multiple)

### The `createOne()` Method

Creates a single standalone entity (not stored in the fake DB):

```typescript
// Single entity with defaults
const user = await userFaketory.createOne();

// Single entity with overrides (auto-merged!)
const admin = await userFaketory.createOne({ email: 'admin@example.com' });
```

### The `createMany()` Method

Creates multiple standalone entities (not stored in the fake DB):

```typescript
// Multiple entities (returns array)
const users = await userFaketory.createMany(5);

// Multiple entities with custom data (returns array, auto-merged!)
const users = await userFaketory.createMany([
  { email: 'one@example.com' },
  { email: 'two@example.com' },
]);
```

### The `seedOne()` Method

Creates and **stores** a single entity in your MSW Data collection:

```typescript
// Single entity (returns T)
const user = await userFaketory.seedOne();

// Single entity with overrides (returns T, auto-merged!)
const admin = await userFaketory.seedOne({ email: 'admin@example.com' });
```

### The `seedMany()` Method

Creates and **stores** multiple entities in your MSW Data collection:

```typescript
// Multiple entities (returns T[])
const users = await userFaketory.seedMany(10);

// Multiple entities with custom data (returns T[], auto-merged!)
const users = await userFaketory.seedMany([
  { email: 'one@example.com' },
  { email: 'two@example.com' },
]);
```

### Auto-Merge Magic ✨

Partial data is **automatically merged** with defaults. You don't need to spread `...partial` in your faketory function. We've got you covered (literally):

```typescript
// ❌ Don't do this
const faketory = createFaketory(collection, async ({ partial }) => {
  return {
    id: faker.string.uuid(),
    ...partial, // Not needed!
  };
});

// ✅ Do this instead
const faketory = createFaketory(collection, async ({ partial }) => {
  return {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    // partial is merged automatically!
  };
});
```

### Direct Store Access

Need to query or update your fake data? No problem! Access the MSW Data collection directly (it's like having a backdoor to your fake DB 🚪):

```typescript
// Query all users
const allUsers = userFaketory.store.findMany();

// Find specific user
const user = userFaketory.store.findFirst(q => 
  q.where({ email: 'test@example.com' })
);

// Update user
userFaketory.store.update({
  where: { id: user.id },
  data: { name: 'Updated Name' },
});

// Delete user
userFaketory.store.delete({ where: { id: user.id } });
```

### Resetting Data

Sometimes you need to hit the reset button (we've all been there):

```typescript
// Reset a single faketory
userFaketory.reset();

```

### ⚠️ IMPORTANT: Preventing Stale Data

**Always call `resetAllFaketories()` in a global `beforeEach` hook** to prevent stale data from previous tests. Without this, entities created in one test can leak into subsequent tests, causing flaky and unpredictable test failures. 

```typescript
// tests-setup.ts
import { resetAllFaketories } from '@test-effective/fakes';
import { beforeEach } from 'vitest';

beforeEach(() => {
  resetAllFaketories(); // Clears all faketory collections before each test
});
```

**Why this matters:**
- Tests that rely on specific data counts will fail unexpectedly (like expecting 5 users but finding 47 from previous tests 😱)
- Queries expecting empty collections will find leftover data (surprise! 🎉)
- Test isolation is broken, making failures hard to debug (the classic "works on my machine")

**Best practice:** Set this up once in your global test setup file, not in individual test files. One reset to rule them all! 💍



## Fakepoints

Fakepoints (Fake Endpoints, we're very creative with naming here 🎯) are registration points for setting up the fake remote layer of your tests.

Instead of manually importing MSW handlers across your test files, fakepoints auto-discover them and let you set them up at a predictable time.


### How It Works


1. You create `.fakepoints.ts` files and use the `registerFakepoints()` function to register your fake endpoints.
2. The Vite plugin scans your workspace for all `.fakepoints.ts` files and creates a virtual module `collected-fakepoints` that imports them all.
3. When you call `runAllFakepoints()`, all registered functions run.

**Use cases:**
- Registering MSW handlers
- Setting up fake DB schemas
- Configuring test globals


### Setup

1. **Add the Vite plugin** to your `vite.config.ts`:

```typescript
import { collectFakepointsPlugin } from '@test-effective/fakes';

export default defineConfig({
  plugins: [
    collectFakepointsPlugin({
      workspaceRoot: '../../your/project/root', // Optional, defaults to process.cwd()
      debug: false, // Optional, enables debug logging
    }),
  ],
});
```

2. **Create `.fakepoints.ts` files** anywhere in your project:

```typescript
// src/users/user.fakepoints.ts
import { registerFakepoints } from '@test-effective/fakes';
import { setupUserHandlers } from './handlers';

registerFakepoints(() => {
  setupUserHandlers();
  console.log('✅ User fakepoints registered');
});
```

```typescript
// src/posts/post.fakepoints.ts
import { registerFakepoints } from '@test-effective/fakes';
import { setupPostHandlers } from './handlers';

registerFakepoints(() => {
  setupPostHandlers();
});
```

3. **Import the virtual module** in your test setup (this is where the magic happens ✨):

```typescript
// tests-setup.ts
import 'collected-fakepoints'; // Auto-imports all .fakepoints.ts files
import { runAllFakepoints } from '@test-effective/fakes';
import { beforeAll } from 'vitest';

beforeAll(() => {
  runAllFakepoints(); // Runs all registered fakepoints
});
```

## Contributing

Want to contribute? Yayy! 🎉

Please read and follow our [Contributing Guidelines](CONTRIBUTING.md) to learn what are the right steps to take before contributing your time, effort and code.

Thanks 🙏

<br/>

## Code Of Conduct

Be kind to each other and please read our [code of conduct](CODE_OF_CONDUCT.md).

<br/>

## License

MIT
