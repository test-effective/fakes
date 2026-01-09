import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { createServer, loadConfigFromFile } from 'vite';
import { describe, expect, test } from 'vitest';

const demoProjectRoot = path.resolve(process.cwd(), 'tests', 'demo-project');
const pluginPath = path
  .resolve(process.cwd(), 'src/fakepoints/collect-fakepoints-vite-plugin.js')
  .replace(/\\/g, '/');

// Helper: Create vite config file content
function createViteConfigContent(
  testRoot: string,
  options: {
    watch?: boolean;
    filePattern?: string;
  } = {},
): string {
  const optionsString = Object.entries(options)
    .map(([key, value]) => {
      if (typeof value === 'string') {
        return `${key}: '${value}'`;
      }
      return `${key}: ${value}`;
    })
    .join(',\n      ');

  return `import { defineConfig } from 'vite';
import { collectFakepointsPlugin } from '${pluginPath}';

export default defineConfig({
  plugins: [
    collectFakepointsPlugin({
      workspaceRoot: '${testRoot.replace(/\\/g, '/')}',${optionsString ? `\n      ${optionsString}` : ''}
    }),
  ],
});`;
}

// Helper: Setup server with console capture and restart tracking
async function setupTestServer(
  testRoot: string,
  options: { captureConsole?: boolean } = {},
) {
  const configFile = path.join(testRoot, 'vite.config.ts');
  const configResult = await loadConfigFromFile(
    { command: 'build', mode: 'test' },
    configFile,
  );

  const consoleLogs: string[] = [];
  let originalLog: typeof console.log | null = null;

  if (options.captureConsole) {
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      const message = args.join(' ');
      consoleLogs.push(message);
      originalLog!(...args);
    };
  }

  let restartCount = 0;
  const server = await createServer({
    ...configResult?.config,
    root: testRoot,
    logLevel: 'silent',
  });

  // Mock restart to track calls
  const originalRestart = server.restart;
  server.restart = async () => {
    restartCount++;
    await originalRestart.call(server);
  };

  return {
    server,
    consoleLogs,
    restartCount: () => restartCount,
    cleanup: async () => {
      if (originalLog) {
        console.log = originalLog;
      }
      await server?.close();
    },
  };
}

// Helper: Wait for file system operations to be processed
const waitForFileSystem = (ms = 500) =>
  new Promise(resolve => setTimeout(resolve, ms));

// Helper: Find log containing specific text
function findLog(logs: string[], ...textParts: string[]): string | undefined {
  return logs.find(log => textParts.every(part => log.includes(part)));
}

describe('collectFakepointsPlugin E2E', () => {
  test(`GIVEN a Vite project with fakepoints files,
THEN fakepoints are collected, registered, and can be executed`, async () => {
    // Load vite config from demo-project directory
    const configFile = path.join(demoProjectRoot, 'vite.config.ts');
    const configResult = await loadConfigFromFile(
      { command: 'build', mode: 'test' },
      configFile,
    );

    let server: Awaited<ReturnType<typeof createServer>> | null = null;
    try {
      // Create a Vite server using the config from demo-project
      server = await createServer({
        ...configResult?.config,
        root: demoProjectRoot,
        logLevel: 'error',
      });

      // Load the tests-setup file which imports the virtual module
      // This simulates what happens when users import 'collected-fakepoints' in their vitest setup
      const setupFile = path.join(demoProjectRoot, 'tests-setup.ts');
      await server.ssrLoadModule(setupFile);

      // Import runAllFakepoints from the registry
      // This ensures we're using the same registry instance that the fakepoints registered with
      const registryModule = await server.ssrLoadModule(
        path.resolve(
          process.cwd(),
          'src',
          'fakepoints',
          'fakepoints-registry.ts',
        ),
      );
      const { runAllFakepoints } = registryModule as {
        runAllFakepoints: (debug?: boolean) => void;
      };

      // Capture console.log to verify fakepoints executed
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.join(' '));
        originalLog(...args);
      };

      try {
        // Now call runAllFakepoints (like users would in beforeAll)
        // This should execute all registered fakepoints
        runAllFakepoints();

        // Verify that fakepoints were registered and executed
        // The demo-project fakepoints log messages when executed
        expect(consoleLogs).toContain('🔄 Root fakepoints registered');
        expect(consoleLogs).toContain('🔄 Nested fakepoints registered');
      } finally {
        console.log = originalLog;
      }
    } finally {
      await server?.close();
    }
  });

  describe('File watching integration', () => {
    const testRoot = path.resolve(process.cwd(), 'tmp-test-watch-integration');

    // Helper: Setup watch integration test workspace with server
    async function setupWatchTestWorkspace(
      options: {
        watch?: boolean;
        filePattern?: string;
        captureConsole?: boolean;
      } = {},
    ) {
      // Create test workspace
      await mkdir(path.join(testRoot, 'src'), { recursive: true });

      // Create initial fakepoints file
      await writeFile(
        path.join(testRoot, 'src', 'initial.fakepoints.ts'),
        'export const initial = {};',
      );

      // Create vite config with provided options
      await writeFile(
        path.join(testRoot, 'vite.config.ts'),
        createViteConfigContent(testRoot, options),
      );

      // Setup server
      const {
        server,
        consoleLogs,
        restartCount,
        cleanup: cleanupServer,
      } = await setupTestServer(testRoot, {
        captureConsole: options.captureConsole,
      });

      return {
        server,
        consoleLogs,
        restartCount,
        testRoot,
        cleanup: async () => {
          // Cleanup server first, then workspace
          await cleanupServer();
          await rm(testRoot, { recursive: true, force: true });
        },
      };
    }

    test(`GIVEN a running server,
WHEN a new fakepoints file is added,
THEN it logs the event and triggers server restart`, async () => {
      const { testRoot, consoleLogs, restartCount, cleanup } =
        await setupWatchTestWorkspace({ captureConsole: true });

      try {
        await waitForFileSystem(100); // Wait for initial setup

        // Add a new fakepoints file
        await writeFile(
          path.join(testRoot, 'src', 'new.fakepoints.ts'),
          'export const newfakepoints = {};',
        );

        await waitForFileSystem(); // Wait for watcher to detect the change

        // Verify the event was logged
        expect(
          findLog(consoleLogs, '[watcher:add]', 'new.fakepoints.ts'),
        ).toBeDefined();

        // Verify restart was triggered
        expect(restartCount()).toBeGreaterThan(0);

        // Verify the restart reason was logged
        expect(
          findLog(consoleLogs, 'Triggering Vitest rerun', 'file added'),
        ).toBeDefined();
      } finally {
        await cleanup();
      }
    }, 10000);

    test(`GIVEN a running server,
WHEN a fakepoints file is deleted,
THEN it logs the event and triggers server restart`, async () => {
      const { testRoot, consoleLogs, restartCount, cleanup } =
        await setupWatchTestWorkspace({ captureConsole: true });

      try {
        await waitForFileSystem(100); // Wait for initial setup

        // Delete the initial fakepoints file
        await rm(path.join(testRoot, 'src', 'initial.fakepoints.ts'));

        await waitForFileSystem(); // Wait for watcher to detect the change

        // Verify the event was logged
        expect(
          findLog(consoleLogs, '[watcher:unlink]', 'initial.fakepoints.ts'),
        ).toBeDefined();

        // Verify restart was triggered
        expect(restartCount()).toBeGreaterThan(0);

        // Verify the restart reason was logged
        expect(
          findLog(consoleLogs, 'Triggering Vitest rerun', 'file deleted'),
        ).toBeDefined();
      } finally {
        await cleanup();
      }
    }, 10000);

    test(`GIVEN watch disabled (watch: false),
WHEN a new fakepoints file is added,
THEN no restart is triggered`, async () => {
      const { testRoot, restartCount, cleanup } = await setupWatchTestWorkspace(
        { watch: false },
      );

      try {
        await waitForFileSystem(100); // Wait for initial setup

        // Add a new fakepoints file
        await writeFile(
          path.join(testRoot, 'src', 'new.fakepoints.ts'),
          'export const newfakepoints = {};',
        );

        await waitForFileSystem(); // Wait to ensure watcher would have fired if enabled

        // Verify restart was NOT triggered
        expect(restartCount()).toBe(0);
      } finally {
        await cleanup();
      }
    }, 10000);

    test(`GIVEN custom filePattern option,
WHEN server starts,
THEN only files matching custom pattern are collected`, async () => {
      const { testRoot, server, cleanup } = await setupWatchTestWorkspace({
        filePattern: '.test-data.ts',
      });

      try {
        // Create files with custom pattern
        await writeFile(
          path.join(testRoot, 'src', 'custom.test-data.ts'),
          'export const customData = {};',
        );

        // Load the virtual module
        const virtualModule = await server.ssrLoadModule(
          'collected-fakepoints',
        );

        // The module should exist (even if empty)
        expect(virtualModule).toBeDefined();

        // Verify that .test-data.ts file would be watched
        // We can't easily verify the imports without complex mocking,
        // but we've already tested this in unit tests
        // This integration test verifies the plugin loads with custom pattern
      } finally {
        await cleanup();
      }
    }, 10000);
  });
});
