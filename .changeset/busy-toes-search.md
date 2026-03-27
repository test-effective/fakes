---
'@test-effective/fakes': minor
---

FEAT: add `rootsToScan` option

This option allows you to specify the directories to scan for fakepoints files.
This is the most efficient option for monorepos or large workspaces because only listed directories are scanned.
You must provide `workspaceRoot` when using this option.

Example:

```typescript
collectFakepointsPlugin({
  workspaceRoot: '/absolute/path/to/your/project',
  rootsToScan: ['libs/feature-a', 'libs/shared'],
});
```
