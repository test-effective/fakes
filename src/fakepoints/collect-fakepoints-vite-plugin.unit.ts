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
    'export const userfakepoints = {};',
  );
  await writeFile(
    path.join(testRoot, 'src', 'models', 'post.fakepoints.ts'),
    'export const postfakepoints = {};',
  );
  await writeFile(
    path.join(testRoot, 'src', 'utils', 'helper.fakepoints.ts'),
    'export const helperfakepoints = {};',
  );
  await writeFile(
    path.join(testRoot, 'tests', 'test.fakepoints.ts'),
    'export const testfakepoints = {};',
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

  // Create some non-fakepoints files
  await writeFile(
    path.join(testRoot, 'src', 'models', 'user.ts'),
    'export const user = {};',
  );

  // Create files with custom pattern for filePattern tests
  await writeFile(
    path.join(testRoot, 'src', 'models', 'user.test-data.ts'),
    'export const userTestData = {};',
  );
  await writeFile(
    path.join(testRoot, 'src', 'utils', 'helper.test-data.ts'),
    'export const helperTestData = {};',
  );

  return {
    testRoot,
    cleanup: async () => {
      await rm(testRoot, { recursive: true, force: true });
    },
  };
}

function getPlugin(
  testRoot: string,
  options?: {
    debug?: boolean;
    watch?: boolean;
    ignoreDirs?: string[];
    filePattern?: string;
  },
): Plugin {
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

      expect(result).toContain('// Auto-generated virtual module');

      // Should include valid fakepoints files
      expect(result).toContain("import '/src/models/user.fakepoints.ts';");
      expect(result).toContain("import '/src/models/post.fakepoints.ts';");
      expect(result).toContain("import '/src/utils/helper.fakepoints.ts';");
      expect(result).toContain("import '/tests/test.fakepoints.ts';");

      // Should NOT include files from ignored directories
      expect(result).not.toContain('node_modules');
      expect(result).not.toContain('/dist/');
      expect(result).not.toContain('/tmp/');

      // Should not include non-fakepoints files
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
      expect(result).toContain("fakepoints file(s)');");
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

  test(`GIVEN ignoreDirs option,
THEN excludes specified directories from collection`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      // Configure to ignore 'tests' and 'utils' directories
      const plugin = getPlugin(testRoot, { ignoreDirs: ['tests', 'utils'] });
      const result = await loadVirtualModule(plugin);

      expect(result).toBeTruthy();

      // Should include files NOT in ignored directories
      expect(result).toContain("import '/src/models/user.fakepoints.ts';");
      expect(result).toContain("import '/src/models/post.fakepoints.ts';");

      // Should NOT include files from custom ignored directories
      expect(result).not.toContain("import '/tests/test.fakepoints.ts';");
      expect(result).not.toContain("import '/src/utils/helper.fakepoints.ts';");
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN ignoreDirs option,
THEN config returns watcher ignore patterns (or undefined when not set)`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      // Test WITH ignoreDirs - should return watcher ignore patterns
      const pluginWithIgnore = getPlugin(testRoot, {
        ignoreDirs: ['coverage', 'build', '.nx'],
      });
      const configWithIgnore = pluginWithIgnore.config as () => {
        server: { watch: { ignored: string[] } };
      };
      const resultWithIgnore = configWithIgnore();

      expect(resultWithIgnore).toBeDefined();
      expect(resultWithIgnore.server.watch.ignored).toEqual([
        '**/coverage/**',
        '**/build/**',
        '**/.nx/**',
      ]);

      // Test WITHOUT ignoreDirs - should return undefined
      const pluginWithoutIgnore = getPlugin(testRoot);
      const configWithoutIgnore = pluginWithoutIgnore.config as () => undefined;
      const resultWithoutIgnore = configWithoutIgnore();

      expect(resultWithoutIgnore).toBeUndefined();
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN custom filePattern option,
THEN collects only files matching the custom pattern`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      // Configure to use custom file pattern
      const plugin = getPlugin(testRoot, { filePattern: '.test-data.ts' });
      const result = await loadVirtualModule(plugin);

      expect(result).toBeTruthy();
      expect(result).toContain(
        '// Auto-generated virtual module that imports all .test-data.ts files',
      );

      // Should include files matching custom pattern
      expect(result).toContain("import '/src/models/user.test-data.ts';");
      expect(result).toContain("import '/src/utils/helper.test-data.ts';");

      // Should NOT include .fakepoints.ts files
      expect(result).not.toContain('user.fakepoints.ts');
      expect(result).not.toContain('post.fakepoints.ts');
      expect(result).not.toContain('helper.fakepoints.ts');
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN default configuration (no filePattern),
THEN uses .fakepoints.ts as default pattern`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      const plugin = getPlugin(testRoot);
      const result = await loadVirtualModule(plugin);

      expect(result).toBeTruthy();
      expect(result).toContain(
        '// Auto-generated virtual module that imports all .fakepoints.ts files',
      );

      // Should include .fakepoints.ts files
      expect(result).toContain("import '/src/models/user.fakepoints.ts';");

      // Should NOT include .test-data.ts files
      expect(result).not.toContain('test-data.ts');
    } finally {
      await cleanup();
    }
  });
});
