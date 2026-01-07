---
'@test-effective/fakes': minor
---

FEAT: passing partials alongside count in seed/generate many

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