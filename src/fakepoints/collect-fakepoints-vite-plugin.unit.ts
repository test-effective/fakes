import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import type { Plugin } from 'vite';
import { describe, expect, test } from 'vitest';
import { collectFakepointsPlugin } from './collect-fakepoints-vite-plugin.js';

const VIRTUAL_MODULE_ID = 'collected-fakepoints';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

async function setup() {
  const testRoot = path.join(process.cwd(), 'tmp-test-fakepoints');

  // Create a test workspace with various .fakepoints.ts files
  await mkdir(testRoot, { recursive: true });

  // Create nested directory structure
  await mkdir(path.join(testRoot, 'src', 'models'), { recursive: true });
  await mkdir(path.join(testRoot, 'src', 'utils'), { recursive: true });
  await mkdir(path.join(testRoot, 'tests'), { recursive: true });
  await mkdir(path.join(testRoot, 'node_modules', 'some-package'), {
    recursive: true,
  });
  await mkdir(path.join(testRoot, 'dist'), { recursive: true });
  await mkdir(path.join(testRoot, 'tmp'), { recursive: true });

  // Create .fakepoints.ts files in valid locations
  await writeFile(
    path.join(testRoot, 'src', 'models', 'user.fakepoints.ts'),
    'export const userFakepoint = {};',
  );
  await writeFile(
    path.join(testRoot, 'src', 'models', 'post.fakepoints.ts'),
    'export const postFakepoint = {};',
  );
  await writeFile(
    path.join(testRoot, 'src', 'utils', 'helper.fakepoints.ts'),
    'export const helperFakepoint = {};',
  );
  await writeFile(
    path.join(testRoot, 'tests', 'test.fakepoints.ts'),
    'export const testFakepoint = {};',
  );

  // Create .fakepoints.ts files in ignored locations (should not be included)
  await writeFile(
    path.join(
      testRoot,
      'node_modules',
      'some-package',
      'ignored.fakepoints.ts',
    ),
    'export const ignored = {};',
  );
  await writeFile(
    path.join(testRoot, 'dist', 'ignored.fakepoints.ts'),
    'export const ignored = {};',
  );
  await writeFile(
    path.join(testRoot, 'tmp', 'ignored.fakepoints.ts'),
    'export const ignored = {};',
  );

  // Create some non-fakepoint files
  await writeFile(
    path.join(testRoot, 'src', 'models', 'user.ts'),
    'export const user = {};',
  );

  return {
    testRoot,
    cleanup: async () => {
      await rm(testRoot, { recursive: true, force: true });
    },
  };
}

function getPlugin(testRoot: string, options?: { debug?: boolean }): Plugin {
  const plugins = collectFakepointsPlugin({
    workspaceRoot: testRoot,
    ...options,
  });
  return plugins[0];
}

async function loadVirtualModule(plugin: Plugin): Promise<string | null> {
  const load = plugin.load as (id: string) => Promise<string | null>;
  return await load(RESOLVED_VIRTUAL_MODULE_ID);
}

describe('collectFakepointsPlugin', () => {
  test(`GIVEN fakepoints files in workspace,
           THEN generates imports for all valid files and excludes ignored directories`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      const plugin = getPlugin(testRoot);
      const result = await loadVirtualModule(plugin);

      expect(result).toBeTruthy();
      expect(result).toContain('// Auto-generated virtual module');

      // Should include valid fakepoint files
      expect(result).toContain("import '/src/models/user.fakepoints.ts';");
      expect(result).toContain("import '/src/models/post.fakepoints.ts';");
      expect(result).toContain("import '/src/utils/helper.fakepoints.ts';");
      expect(result).toContain("import '/tests/test.fakepoints.ts';");

      // Should NOT include files from ignored directories
      expect(result).not.toContain('node_modules');
      expect(result).not.toContain('/dist/');
      expect(result).not.toContain('/tmp/');

      // Should not include non-fakepoint files
      expect(result).not.toContain("import '/src/models/user.ts';");
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN debug mode enabled,
THEN includes console log statements in output`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      const plugin = getPlugin(testRoot, { debug: true });
      const result = await loadVirtualModule(plugin);

      expect(result).toContain("console.log('Loaded");
      expect(result).toContain("fakepoint file(s)');");
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN empty workspace with no fakepoints files,
THEN handles gracefully`, async () => {
    const emptyRoot = path.join(process.cwd(), 'tmp-test-empty');
    await mkdir(emptyRoot, { recursive: true });

    try {
      const plugin = getPlugin(emptyRoot);
      const result = await loadVirtualModule(plugin);

      expect(result).toBeTruthy();
      expect(result).toContain('// Auto-generated virtual module');
      // Should have empty or minimal imports
      expect(result).not.toContain("import '/");
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });
});
