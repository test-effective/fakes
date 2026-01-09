import { readdir } from 'fs/promises';
import path from 'path';
import type { Plugin } from 'vite';

export type CollectFakepointsPluginOptions = {
  /**
   * The root directory to search for fakepoints files.
   * Defaults to process.cwd()
   */
  workspaceRoot?: string;
  /**
   * Directories to ignore when scanning for fakepoints files during initial collection.
   *
   * Note: Vite's watcher automatically ignores .git, node_modules, test-results, cache, and configured out directories.
   * This option is only used for the initial file scan at startup.
   *
   * Common directories to ignore: 'tmp', '.nx', 'coverage', 'build', 'out', 'dist', '.cache'
   *
   * @example ['tmp', '.nx', 'coverage', 'build', 'out']
   */
  ignoreDirs?: string[];
  /**
   * Enable file watching for fakepoints files.
   * When enabled, adding/deleting/changing fakepoints files will trigger test reruns.
   * Disable this if you experience performance issues with large workspaces.
   *
   * @default true
   */
  watch?: boolean;
  /**
   * Enable debug mode to see detailed logging about plugin operations.
   * When enabled, logs information about:
   * - Watcher ignore patterns being configured
   * - Virtual module loading
   * - Number of fakepoint files loaded
   * - File watcher setup status
   * - All file system events for .fakepoints.ts files (add, change, unlink)
   *
   * Useful for troubleshooting issues with file discovery, watching, or test reruns.
   *
   * @default false
   */
  debug?: boolean;
};

export function collectFakepointsPlugin(
  options: CollectFakepointsPluginOptions = {},
): Plugin[] {
  const VIRTUAL_MODULE_ID = 'collected-fakepoints';
  const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const debug = options.debug ?? false;
  const watch = options.watch ?? true;
  const ignoreDirs = new Set(options.ignoreDirs || []);

  return [
    // Pre plugin: Handle virtual module registration
    {
      name: 'collect-fakepoints:pre',
      enforce: 'pre', // Run before other plugins to ensure virtual module is registered early

      config() {
        // Add ignore patterns to Vite's watcher configuration
        // This ensures the watcher doesn't watch these directories when we add the workspace root
        if (options.ignoreDirs && options.ignoreDirs.length > 0) {
          const ignorePatterns = options.ignoreDirs.map(dir => `**/${dir}/**`);

          if (debug) {
            console.log(`\n📋 [config] Adding ignore patterns to watcher:`);
            console.log(`   ${ignorePatterns.join(', ')}`);
          }

          return {
            server: {
              watch: {
                ignored: ignorePatterns,
              },
            },
          };
        }
      },

      resolveId(id: string) {
        // Handle virtual module
        if (id === VIRTUAL_MODULE_ID) {
          return RESOLVED_VIRTUAL_MODULE_ID;
        }
        return null;
      },

      async load(id: string) {
        // Handle the virtual module that imports all fakepoints
        if (id === RESOLVED_VIRTUAL_MODULE_ID) {
          if (debug) {
            console.log(`🔄 Loading virtual module ${VIRTUAL_MODULE_ID}`);
          }
          // Find all .fakepoints.ts files in the workspace
          const fakepointFiles = await findFakepointFiles(
            workspaceRoot,
            ignoreDirs,
          );

          // Generate import statements for all fakepoint files using direct file paths
          const imports = fakepointFiles.map(file => {
            const relativePath = path.posix.join('/', file);
            return `import '${relativePath}';`;
          });

          if (imports.length === 0) {
            console.warn(`� No fakepoint files found in ${workspaceRoot}
You may need to configure the workspaceRoot in your vite.config.ts file 
to point to the actual root of the workspace.`);
          }

          // Return the virtual module content that imports all fakepoint files
          return `// Auto-generated virtual module that imports all .fakepoints.ts files
${imports.join('\n')}

${debug ? `console.log('Loaded ${imports.length} fakepoint file(s)');` : ''}
`;
        }

        return null;
      },

      async configureServer(server) {
        // Skip watcher setup if disabled
        if (!watch) {
          if (debug) {
            console.log(
              '\n📡 [configureServer] File watching disabled via options.watch=false',
            );
          }
          return;
        }

        // Find all fakepoints files and find their absolute paths (required for the watch to work)
        const fakepointFiles = await findFakepointFiles(
          workspaceRoot,
          ignoreDirs,
        );
        const absoluteFakepointPaths = fakepointFiles.map(file =>
          path.resolve(workspaceRoot, file),
        );

        // Explicitly add fakepoints files to watcher
        server.watcher.add(absoluteFakepointPaths);

        // Watch the entire workspace root for new fakepoint files
        // This ensures 'add' events fire even for fakepoints in new directories
        const absoluteWorkspaceRoot = path.resolve(workspaceRoot);

        // Add workspace root to watcher
        // Note: Vite's watcher is pre-configured with ignore patterns at initialization:
        // - **/.git/**, **/node_modules/**, **/test-results/**
        // - Cache dir, out dirs, and anything in .gitignore
        // These patterns are automatically applied to all watched paths
        server.watcher.add([absoluteWorkspaceRoot]);

        // Watch for ALL events to debug
        if (debug) {
          server.watcher.on('all', (event, file) => {
            if (file.endsWith('.fakepoints.ts')) {
              console.log(`\n🔔 [watcher:all] Event '${event}' for: ${file}`);
            }
          });
        }

        // Helper to trigger Vitest rerun when files are added/deleted
        // Restarts the server to ensure the virtual module is regenerated with the updated file list
        // File changes (not add/delete) are handled automatically via forceRerunTriggers
        const triggerVitestRerun = async (reason: string) => {
          console.log(`   💡 Triggering Vitest rerun (${reason})`);
          console.log(`   ✓ Restarting server to reload virtual module`);
          await server.restart();
        };

        // Watch for new fakepoints files being added
        server.watcher.on('add', file => {
          if (file.endsWith('.fakepoints.ts')) {
            console.log(`\n➕ [watcher:add] New fakepoint file added: ${file}`);

            // Add the new file to our tracking list
            absoluteFakepointPaths.push(file);

            // Explicitly add the new file to the watcher so changes to it are detected
            server.watcher.add([file]);
            if (debug) {
              console.log(`   ✓ Added to watcher for change detection`);
            }

            // Restart server to reload virtual module with new file
            triggerVitestRerun('file added');
          }
        });

        // Watch for fakepoints files being deleted
        server.watcher.on('unlink', file => {
          if (file.endsWith('.fakepoints.ts')) {
            console.log(
              `\n➖ [watcher:unlink] Fakepoint file deleted: ${file}`,
            );
            // Remove from our tracking list
            const index = absoluteFakepointPaths.indexOf(file);
            if (index > -1) {
              absoluteFakepointPaths.splice(index, 1);
            }
            // Restart server to reload virtual module without deleted file
            triggerVitestRerun('file deleted');
          }
        });
      },
    },
  ];
}

/**
 * Recursively finds all .fakepoints.ts files in a directory
 */
async function findFakepointFiles(
  rootDir: string,
  ignoreDirs: Set<string>,
): Promise<string[]> {
  const fakepointFiles: string[] = [];

  const defaultIgnoreDirs = new Set(['node_modules', 'dist', 'tmp', '.git']);
  const allIgnoreDirs = new Set([...defaultIgnoreDirs, ...ignoreDirs]);

  async function walk(dir: string, basePath = '') {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = basePath
          ? path.join(basePath, entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (!allIgnoreDirs.has(entry.name)) {
            await walk(path.join(dir, entry.name), relativePath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.fakepoints.ts')) {
          fakepointFiles.push(relativePath);
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
      console.warn(`Warning: Could not read directory ${dir}:`, error);
    }
  }

  await walk(rootDir);
  return fakepointFiles;
}
