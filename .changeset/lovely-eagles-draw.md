---
'@test-effective/fakes': minor
---

FEAT: `createOne` and `createMany` are now `generateOne` and `generateMany`

The reason for this change is because `create` is a method on the store that actually saves the created entity to the fake db table. So to avoid these overloaded terms, `generate` was chosen instead.

### Migration

Replace method calls:

```typescript
// Before 
await faketory.createOne()
await faketory.createMany(5)

// After

await faketory.generateOne()
await faketory.generateMany(5)
```