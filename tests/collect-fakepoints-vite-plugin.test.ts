import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { createServer, loadConfigFromFile } from 'vite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

const demoProjectRoot = path.resolve(process.cwd(), 'tests', 'demo-project');

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

    beforeEach(async () => {
      // Create test workspace
      await mkdir(path.join(testRoot, 'src'), { recursive: true });

      // Create initial fakepoint file
      await writeFile(
        path.join(testRoot, 'src', 'initial.fakepoints.ts'),
        'export const initial = {};',
      );

      // Create vite config
      await writeFile(
        path.join(testRoot, 'vite.config.ts'),
        `import { defineConfig } from 'vite';
import { collectFakepointsPlugin } from '${path.resolve(process.cwd(), 'src/fakepoints/collect-fakepoints-vite-plugin.js').replace(/\\/g, '/')}';

export default defineConfig({
  plugins: [
    collectFakepointsPlugin({
      workspaceRoot: '${testRoot.replace(/\\/g, '/')}',
    }),
  ],
});`,
      );
    });

    afterEach(async () => {
      await rm(testRoot, { recursive: true, force: true });
    });

    test(`GIVEN a running server,
WHEN a new fakepoint file is added,
THEN it logs the event and triggers server restart`, async () => {
      const configFile = path.join(testRoot, 'vite.config.ts');
      const configResult = await loadConfigFromFile(
        { command: 'build', mode: 'test' },
        configFile,
      );

      // Capture console output
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        const message = args.join(' ');
        consoleLogs.push(message);
        originalLog(...args);
      };

      let server: Awaited<ReturnType<typeof createServer>> | null = null;
      let restartCount = 0;

      try {
        server = await createServer({
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

        // Wait for initial setup
        await new Promise(resolve => setTimeout(resolve, 100));

        // Add a new fakepoint file
        const newFilePath = path.join(testRoot, 'src', 'new.fakepoints.ts');
        await writeFile(newFilePath, 'export const newFakepoint = {};');

        // Wait for watcher to detect and process the change
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the event was logged
        const addLog = consoleLogs.find(
          log =>
            log.includes('[watcher:add]') && log.includes('new.fakepoints.ts'),
        );
        expect(addLog).toBeDefined();

        // Verify restart was triggered
        expect(restartCount).toBeGreaterThan(0);

        // Verify the restart reason was logged
        const restartLog = consoleLogs.find(
          log =>
            log.includes('Triggering Vitest rerun') &&
            log.includes('file added'),
        );
        expect(restartLog).toBeDefined();
      } finally {
        console.log = originalLog;
        await server?.close();
      }
    }, 10000); // Increase timeout for file system operations

    test(`GIVEN a running server,
WHEN a fakepoint file is deleted,
THEN it logs the event and triggers server restart`, async () => {
      const configFile = path.join(testRoot, 'vite.config.ts');
      const configResult = await loadConfigFromFile(
        { command: 'build', mode: 'test' },
        configFile,
      );

      // Capture console output
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        const message = args.join(' ');
        consoleLogs.push(message);
        originalLog(...args);
      };

      let server: Awaited<ReturnType<typeof createServer>> | null = null;
      let restartCount = 0;

      try {
        server = await createServer({
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

        // Wait for initial setup
        await new Promise(resolve => setTimeout(resolve, 100));

        // Delete the initial fakepoint file
        const fileToDelete = path.join(
          testRoot,
          'src',
          'initial.fakepoints.ts',
        );
        await rm(fileToDelete);

        // Wait for watcher to detect and process the change
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify the event was logged
        const unlinkLog = consoleLogs.find(
          log =>
            log.includes('[watcher:unlink]') &&
            log.includes('initial.fakepoints.ts'),
        );
        expect(unlinkLog).toBeDefined();

        // Verify restart was triggered
        expect(restartCount).toBeGreaterThan(0);

        // Verify the restart reason was logged
        const restartLog = consoleLogs.find(
          log =>
            log.includes('Triggering Vitest rerun') &&
            log.includes('file deleted'),
        );
        expect(restartLog).toBeDefined();
      } finally {
        console.log = originalLog;
        await server?.close();
      }
    }, 10000); // Increase timeout for file system operations

    test(`GIVEN watch disabled (watch: false),
WHEN a new fakepoint file is added,
THEN no restart is triggered`, async () => {
      // Update config to disable watch
      await writeFile(
        path.join(testRoot, 'vite.config.ts'),
        `import { defineConfig } from 'vite';
import { collectFakepointsPlugin } from '${path.resolve(process.cwd(), 'src/fakepoints/collect-fakepoints-vite-plugin.js').replace(/\\/g, '/')}';

export default defineConfig({
  plugins: [
    collectFakepointsPlugin({
      workspaceRoot: '${testRoot.replace(/\\/g, '/')}',
      watch: false,
    }),
  ],
});`,
      );

      const configFile = path.join(testRoot, 'vite.config.ts');
      const configResult = await loadConfigFromFile(
        { command: 'build', mode: 'test' },
        configFile,
      );

      let server: Awaited<ReturnType<typeof createServer>> | null = null;
      let restartCount = 0;

      try {
        server = await createServer({
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

        // Wait for initial setup
        await new Promise(resolve => setTimeout(resolve, 100));

        // Add a new fakepoint file
        const newFilePath = path.join(testRoot, 'src', 'new.fakepoints.ts');
        await writeFile(newFilePath, 'export const newFakepoint = {};');

        // Wait to ensure watcher would have fired if enabled
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify restart was NOT triggered
        expect(restartCount).toBe(0);
      } finally {
        await server?.close();
      }
    }, 10000); // Increase timeout for file system operations
  });
});
