import path from 'path';
import { createServer, loadConfigFromFile } from 'vite';
import { describe, expect, test } from 'vitest';

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

      // Import setupFakepoints from the registry
      // This ensures we're using the same registry instance that the fakepoints registered with
      const registryModule = await server.ssrLoadModule(
        path.resolve(
          process.cwd(),
          'src',
          'fakepoints',
          'fakepoints-registry.ts',
        ),
      );
      const { setupFakepoints } = registryModule as {
        setupFakepoints: (debug?: boolean) => void;
      };

      // Capture console.log to verify fakepoints executed
      const consoleLogs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        consoleLogs.push(args.join(' '));
        originalLog(...args);
      };

      try {
        // Now call setupFakepoints (like users would in beforeAll)
        // This should execute all registered fakepoints
        setupFakepoints();

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
});
