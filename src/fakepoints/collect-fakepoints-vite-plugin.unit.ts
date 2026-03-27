import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import type { Plugin } from 'vite';
import { describe, expect, test, vi } from 'vitest';
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
  ) /*  */;
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
  options?: Parameters<typeof collectFakepointsPlugin>[0],
): Plugin {
  const baseOptions = options?.workspaceRoot ? {} : { workspaceRoot: testRoot };
  const plugins = collectFakepointsPlugin({
    ...baseOptions,
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

  test(`GIVEN rootsToScan configured,
				THEN only fakepoints from those roots are collected`, async () => {
    const { testRoot, cleanup } = await setup();
    try {
      const plugin = getPlugin(testRoot, {
        workspaceRoot: testRoot,
        rootsToScan: ['src/models'],
      });
      const result = await loadVirtualModule(plugin);

      expect(result).toContain("import '/src/models/user.fakepoints.ts';");
      expect(result).toContain("import '/src/models/post.fakepoints.ts';");
      expect(result).not.toContain('helper.fakepoints.ts');
      expect(result).not.toContain('tests/test.fakepoints.ts');
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN rootsToScan has relative entries and workspaceRoot,
				THEN relative roots are resolved from workspaceRoot`, async () => {
    const { testRoot, cleanup } = await setup();

    try {
      const plugin = getPlugin(testRoot, {
        workspaceRoot: testRoot,
        rootsToScan: ['tests'],
      });
      const result = await loadVirtualModule(plugin);

      expect(result).toContain("import '/tests/test.fakepoints.ts';");
      expect(result).not.toContain('user.fakepoints.ts');
    } finally {
      await cleanup();
    }
  });

  test(`GIVEN rootsToScan includes an absolute path outside workspaceRoot,
				THEN imports use /@fs paths for out-of-workspace files`, async () => {
    const { testRoot, cleanup } = await setup();
    const externalRoot = path.join(
      process.cwd(),
      'tmp-test-external-fakepoints',
    );
    await mkdir(externalRoot, { recursive: true });
    await writeFile(
      path.join(externalRoot, 'external.fakepoints.ts'),
      'export const externalfakepoints = {};',
    );

    try {
      const plugin = getPlugin(testRoot, {
        workspaceRoot: testRoot,
        rootsToScan: [externalRoot],
      });
      const result = await loadVirtualModule(plugin);

      const normalizedExternalFile = path
        .join(externalRoot, 'external.fakepoints.ts')
        .replace(/\\/g, '/');
      expect(result).toContain(`import '/@fs/${normalizedExternalFile}';`);
    } finally {
      await rm(externalRoot, { recursive: true, force: true });
      await cleanup();
    }
  });

  test(`GIVEN rootsToScan is provided without workspaceRoot,
				THEN plugin initialization throws`, () => {
    expect(() =>
      collectFakepointsPlugin({
        rootsToScan: ['src'],
      }),
    ).toThrow('"workspaceRoot" is required when "rootsToScan" is provided.');
  });

  test(`GIVEN rootsToScan is provided with non-absolute workspaceRoot,
				THEN plugin initialization throws`, () => {
    expect(() =>
      collectFakepointsPlugin({
        workspaceRoot: 'relative-root',
        rootsToScan: ['src'],
      }),
    ).toThrow(
      '"workspaceRoot" must be an absolute path when used with "rootsToScan". Received "relative-root".',
    );
  });

  test(`GIVEN workspaceRoot is not absolute,
				THEN warns and falls back to process.cwd()`, async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const plugins = collectFakepointsPlugin({
        workspaceRoot: 'relative/path',
      });
      const plugin = plugins[0];
      const result = await loadVirtualModule(plugin);

      expect(warnSpy).toHaveBeenCalledWith(
        '"workspaceRoot" must be an absolute path. Received "relative/path". Falling back to process.cwd().',
      );
      expect(result).toContain('// Auto-generated virtual module');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
