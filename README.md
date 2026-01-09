<div align="center">
<h1>Test Effective Fakes</h1>




**Fake Server Utils for UI Component Tests** 🎭
</div>

A powerful testing utility library designed to simplify creating and managing a fake server layer for UI component tests.

> (No real data was harmed in the making of this library... 😉)

## What's a fake server layer?

A fake server layer needs two things to successfully simulate a real server:
1. A way to store and manipulate **data** the same way the real server would.
2. A way to react to **http requests** the way a real server would.

Test Effective Fakes provides two powerful features to help you create and manage a fake server layer:

### Faketories
A util on top of [MSW Data](https://github.com/mswjs/data) for making it easier to seed or generate fake test data with automatic partial merging, relational seeding and more.

### Fakepoints
Auto-discovery system for organizing test setup code. Instead of manually importing MSW handlers across test files, fakepoints automatically discover and register your fake endpoints at a predictable time. 

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [1. Faketories](#1-faketories)
  - [1.1 Create a Faketory](#11-create-a-faketory)
  - [1.2 The `generateOne()` Method](#12-the-generateone-method)
  - [1.3 The `generateMany()` Method](#13-the-generatemany-method)
  - [1.4 The `seedOne()` Method](#14-the-seedone-method)
  - [1.5 The `seedMany()` Method](#15-the-seedmany-method)
  - [1.6 Direct Store Access](#16-direct-store-access)
  - [1.7 Resetting Data](#17-resetting-data)
  - [1.8 ⚠️ IMPORTANT: Preventing Stale Data](#18-️-important-preventing-stale-data)
- [2. Fakepoints](#2-fakepoints)
  - [2.1 How It Works](#21-how-it-works)
  - [2.2 Setup](#22-setup)
  - [2.3 Collecting Values from Fakepoints](#23-collecting-values-from-fakepoints)

- [Contributing](#contributing)
- [Code Of Conduct](#code-of-conduct)
- [License](#license)

## Requirements

- `@msw/data` `^1.0.0` (peer dependency)
- Vite (if you're using the fakepoints plugin)

## Installation

```bash
pnpm install -D @test-effective/fakes @msw/data
```

> **Recommended Additional Libraries**

For the best experience, we recommend installing these additional libraries:

```bash
pnpm install -D @test-effective/fakes @msw/data @faker-js/faker valibot
```

- **`@faker-js/faker`** - Generate realistic fake data for your faketories
- **`valibot`** - Schema validation library (but you can use `zod` or any other standard schema implementation)

## 1. Faketories

Faketories are factories for generating fake test data.

Basically, "factories of fakes"... "Faketories"... yeah, we know, great pun 😅.

They provide four methods:
- `generateOne()` / `generateMany()` - Generate standalone entities (not stored in DB)
- `seedOne()` / `seedMany()` - Generate and store entities in your MSW Data collection


### 1.1 Create a Faketory

```typescript
import { createFaketory } from '@test-effective/fakes';
import { Collection } from '@msw/data';
import { faker } from '@faker-js/faker';
import * as v from 'valibot';

// Define your fake db table schema (supports all standard schema implementations)
const userSchema = v.object({
  id: v.string(),
  email: v.string(),
  name: v.string(),
});

// Create a MSW data collection, we called it 'store' because it's shorter.
const userStore = new Collection({ schema: userSchema });

const userFaketory = createFaketory(
  userStore, // MSW Data Store
  async ({ seedingMode, index, partial }) => {
    // Return default values
    // partial is automatically merged - no need to spread it!
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      name: faker.person.fullName()
    };
});

// Use it in tests
const user = await userFaketory.seedOne({ email: 'test@example.com' });

// Use it in fakepoints
const users = userFaketory.store.findMany();
```

**Props available in your faketory function:**
- `seedingMode` - is 'true' when called with one of the seeding methods.
- `index` - when creating many entities, this is the index of the entity being created.
- `partial` - Override default values created by the faketory function


 **Auto-Merge Magic ✨**

Partial data is **automatically merged** with defaults so you don't need to spread `...partial` in the end of your faketory function. 

### 1.2 The `generateOne()` Method

Generates a single standalone entity (**not stored** in the fake DB):

```typescript
// Single entity with defaults
const user = await userFaketory.generateOne();

// Single entity with overrides (auto-merged!)
const admin = await userFaketory.generateOne({ email: 'admin@example.com' });
```

### 1.3 The `generateMany()` Method

Generates multiple standalone entities (**not stored** in the fake DB):

```typescript
// Multiple entities (returns array)
const users = await userFaketory.generateMany(5);

// Multiple entities with custom data (returns array, auto-merged!)
const users = await userFaketory.generateMany([
  { email: 'one@example.com' },
  { email: 'two@example.com' },
]);

// Generate N entities, merge partials by index (auto-merged!)
const users = await userFaketory.generateMany(3, [
  { email: 'first@example.com' },
]);
// Creates 3 entities:
// - users[0] has email: 'first@example.com' (merged with defaults)
// - users[1] uses all defaults
// - users[2] uses all defaults
```

### 1.4 The `seedOne()` Method

Creates and **stores** a single entity in the MSW Data store:

```typescript
// Single entity (returns T)
const user = await userFaketory.seedOne();

// Single entity with overrides (returns T, auto-merged!)
const admin = await userFaketory.seedOne({ email: 'admin@example.com' });
```

### 1.5 The `seedMany()` Method

Creates and **stores** multiple entities in the MSW Data store:

```typescript
// Multiple entities (returns T[])
const users = await userFaketory.seedMany(10);

// Multiple entities with custom data (returns T[], auto-merged!)
const users = await userFaketory.seedMany([
  { email: 'one@example.com' },
  { email: 'two@example.com' },
]);

// Seed N entities, merge partials by index (auto-merged!)
const users = await userFaketory.seedMany(5, [
  { email: 'admin@example.com', name: 'Admin' },
  { email: 'user@example.com' },
]);
// Creates 5 entities in the store:
// - users[0] has email: 'admin@example.com' and name: 'Admin'
// - users[1] has email: 'user@example.com' (other fields use defaults)
// - users[2-4] use all defaults
```

### 1.6 Direct Store Access

Need to query or update your fake data? No problem! 

Access the MSW Data collection directly via the `store` property.

**Why "store" and not "collection"?** 

Honestly? Because `store` is shorter than `collection` 😊

Under the hood, `store` is the MSW Data `Collection` instance, giving you full access to all its methods:

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

### 1.7 Resetting Data

Sometimes you need to hit the reset button (we've all been there):

```typescript
// Reset a single faketory
userFaketory.reset();

```

### 1.8 ⚠️ IMPORTANT: Preventing Stale Data

**Always call `resetAllFaketories()` in a global `beforeEach` hook** to prevent stale data from previous tests. Without this, entities created in one test can leak into subsequent tests, causing flaky and unpredictable test failures. 


```typescript
// tests-setup.ts
import { resetAllFaketories } from '@test-effective/fakes';
import { beforeEach } from 'vitest';

beforeEach(() => {
  resetAllFaketories(); // Clears all faketory collections before each test
});
```

<br/><br/>


## 2. Fakepoints

Fakepoints (Fake Endpoints, we're very creative with naming here 🎯) are registration points for setting up the fake remote endpoints layer for your tests.

Instead of manually importing MSW handlers across your test files, fakepoints auto-discover them and let you set them up at a predictable time.


### 2.1 How It Works


1. You create `.fakepoints.ts` files (or use a custom pattern via the `filePattern` option) and use the `registerFakepoints()` function to register your fake endpoints.
2. The Vite plugin scans your workspace for all matching files and creates a virtual module `collected-fakepoints` that imports them all.
3. When you call `runAllFakepoints()`, all registered functions run.

**Use cases:**
- Registering MSW handlers
- Replacing remote services with fake ones

### 2.2 Setup

1. **Add the Vite plugin** to your `vite.config.ts`:

```typescript
import { collectFakepointsPlugin } from '@test-effective/fakes';

export default defineConfig({
  plugins: [
    collectFakepointsPlugin({
      workspaceRoot: '../../your/project/root', // Optional, defaults to process.cwd()
      filePattern: '.fakepoints.ts', // Optional, file pattern to match (default: '.fakepoints.ts')
      debug: false, // Optional, enables debug logging
      watch: true, // Optional, enables file watching for auto test reruns (default: true)
      ignoreDirs: ['tmp', '.nx', 'coverage'], // Optional, directories to ignore when scanning
    }),
  ],
});
```

**Configuration Options:**

- **`workspaceRoot`** (optional) - Root directory to scan for fakepoints files. Defaults to `process.cwd()`.

- **`filePattern`** (optional, default: `'.fakepoints.ts'`) - The file pattern to match when scanning for fakepoints files. This allows you to use a custom naming convention for your fakepoints files.
  
  **Examples:**
  ```typescript
  filePattern: '.fakes.ts'      // Match *.fakes.ts files
  filePattern: '.test-data.ts'  // Match *.test-data.ts files
  filePattern: '.fixtures.ts'   // Match *.fixtures.ts files
  ```

- **`watch`** (optional, default: `true`) - Enable file watching for fakepoints files. When enabled, adding, deleting, or changing fakepoints files will automatically trigger test reruns. Disable this if you experience performance issues with large workspaces.

- **`ignoreDirs`** (optional) - Array of directory names to ignore when scanning for fakepoints files during initial collection. Note: Vite's watcher automatically ignores `.git`, `node_modules`, `test-results`, cache, and configured out directories. Common directories to add: `'tmp'`, `'.nx'`, `'coverage'`, `'build'`, `'out'`, `'dist'`, `'.cache'`.

- **`debug`** (optional, default: `false`) - Enable debug mode to see detailed logging about plugin operations including:
  - Watcher ignore patterns being configured
  - Virtual module loading
  - Number of fakepoints files loaded
  - File watcher setup status
  - All file system events for fakepoints files (add, change, unlink)
  
  Useful for troubleshooting issues with file discovery, watching, or test reruns.

2. **Create fakepoints files** anywhere in your project (default pattern: `.fakepoints.ts`):

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
import 'collected-fakepoints'; // Auto-imports all fakepoints files
import { runAllFakepoints } from '@test-effective/fakes';
import { beforeAll } from 'vitest';

beforeAll(() => {
  runAllFakepoints(); // Runs all registered fakepoints
});
```

### 2.3 Collecting Values from Fakepoints

Fakepoints can also return values that are collected when you call `runAllFakepoints()`. This is especially useful for collecting provider arrays (like in Angular), configuration objects, or any other test setup data that needs to be gathered from multiple files.

#### Basic Example - Collecting Values

```typescript
// src/users/user.fakepoints.ts
import { registerFakepoints } from '@test-effective/fakes';

registerFakepoints(() => {
  return { module: 'users', handlers: 3 };
});
```

```typescript
// src/posts/post.fakepoints.ts
import { registerFakepoints } from '@test-effective/fakes';

registerFakepoints(() => {
  return { module: 'posts', handlers: 2 };
});
```

```typescript
// tests-setup.ts
import 'collected-fakepoints';
import { runAllFakepoints } from '@test-effective/fakes';

type ModuleInfo = { module: string; handlers: number };
const modules = runAllFakepoints<ModuleInfo>();
// Result: [{ module: 'users', handlers: 3 }, { module: 'posts', handlers: 2 }]
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
