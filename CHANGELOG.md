# @test-effective/fakes

## 0.2.0

### Minor Changes

- ✨ passing partials alongside count in seed/generate many (by [@shairez](https://github.com/shairez) in [#7](https://github.com/test-effective/fakes/pull/7))

  Example:

  ```typescript
  const users = await userFaketory.seedMany(3, [
    { email: 'first@example.com' },
  ]);
  // Creates 3 entities:
  // - users[0] has email: 'first@example.com' (merged with defaults)
  // - users[1] uses all defaults
  // - users[2] uses all defaults
  ```

## 0.1.0

### Minor Changes

- ✨ `createOne` and `createMany` are now `generateOne` and `generateMany` (by [@shairez](https://github.com/shairez) in [#5](https://github.com/test-effective/fakes/pull/5))

  The reason for this change is because `create` is a method on the store that actually saves the created entity to the fake db table. So to avoid these overloaded terms, `generate` was chosen instead.

  ### Migration

  Replace method calls:

  ```typescript
  // Before
  await faketory.createOne();
  await faketory.createMany(5);

  // After

  await faketory.generateOne();
  await faketory.generateMany(5);
  ```

## 0.0.4

### Patch Changes

- ✨ fakepoints can now return values which end up as an array in `runAllFakepoints` (by [@shairez](https://github.com/shairez) in [`38118ca`](https://github.com/test-effective/fakes/commit/38118ca15b8185a3f71a3af1e3aaa1009af42941))

## 0.0.3

### Patch Changes

- ✨ split `seed` and `create` into `seedOne`,`seedMany`, `createOne` and `createMany` (by [@shairez](https://github.com/shairez) in [`014510d`](https://github.com/test-effective/fakes/commit/014510dc9daf27ba2f23969d9c28d23df2dd60a2))

- 🛠 remove unnecessary debug boolean (by [@shairez](https://github.com/shairez) in [`fa926b0`](https://github.com/test-effective/fakes/commit/fa926b0e86b2766621b95f5ac021e30aa771fdff))

## 0.0.2

### Patch Changes

- ✨ renamed `setupFakepoints` to `runAllFakepoints` (by [@shairez](https://github.com/shairez) in [`0aa8a32`](https://github.com/test-effective/fakes/commit/0aa8a329e00324e253ec00ed833a01f0d83556d0))

## 0.0.1

### Patch Changes

- ✨ added fakepoints and faketories (by [@shairez](https://github.com/shairez) in [`d922c00`](https://github.com/test-effective/fakes/commit/d922c0098c81020f0033cfc912b17ce48015eb4c))
