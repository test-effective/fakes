import { readdir } from 'fs/promises';
import path from 'path';
import type { Plugin } from 'vite';

export type CollectFakepointsPluginOptions = {
  /**
   * Directories to scan for fakepoints files.
   * Values can be absolute paths, or relative to workspaceRoot.
   * When provided, only these directories are scanned.
   *
   * Note: workspaceRoot is required when rootsToScan is provided.
   */
  rootsToScan?: string[];
  /**
   * The root directory (absolute path) to search for fakepoints files.
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
   * The file pattern to match fakepoints files.
   * Files matching this pattern will be collected and imported.
   *
   * @default '.fakepoints.ts'
   * @example '.fakes.ts'
   * @example '.test-data.ts'
   */
  filePattern?: string;
  /**
   * Enable debug mode to see detailed logging about plugin operations.
   * When enabled, logs information about:
   * - Watcher ignore patterns being configured
   * - Virtual module loading
   * - Number of fakepoints files loaded
   * - File watcher setup status
   * - All file system events for fakepoints files (add, change, unlink)
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
  const rootsToScanOption = options.rootsToScan;
  const workspaceRootOption = options.workspaceRoot;
  const debug = options.debug ?? false;
  const watch = options.watch ?? true;
  const ignoreDirs = new Set(options.ignoreDirs || []);
  const filePattern = options.filePattern ?? '.fakepoints.ts';
  const cwd = process.cwd();
  const scanConfig = resolveScanConfig(
    rootsToScanOption,
    workspaceRootOption,
    cwd,
  );
  const rootsToScan = scanConfig.rootsToScan;
  const workspaceRoot = scanConfig.workspaceRoot;

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
          // Find all fakepoints files across configured roots
          const fakepointFiles = await findFakepointFilesForRoots(
            rootsToScan,
            ignoreDirs,
            filePattern,
          );

          // Generate import statements for all fakepoints files using project-root relative paths when possible
          const importBaseDir = workspaceRoot;
          const imports = fakepointFiles.map(file => {
            const importPath = toImportPath(file, importBaseDir);
            return `import '${importPath}';`;
          });

          if (imports.length === 0) {
            const rootsDescription = rootsToScan.join(', ');
            console.warn(`No fakepoints files (${filePattern}) found in configured roots: ${rootsDescription}
You may need to configure rootsToScan, workspaceRoot, or filePattern in your vite.config.ts file.`);
          }

          // Return the virtual module content that imports all fakepoints files
          return `// Auto-generated virtual module that imports all ${filePattern} files
${imports.join('\n')}

${debug ? `console.log('Loaded ${imports.length} fakepoints file(s)');` : ''}
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

        // Find all fakepoints files absolute paths (required for watcher setup)
        const absoluteFakepointPaths = await findFakepointFilesForRoots(
          rootsToScan,
          ignoreDirs,
          filePattern,
        );

        // Explicitly add fakepoints files to watcher
        server.watcher.add(absoluteFakepointPaths);

        // Watch configured roots for new fakepoints files
        // Note: Vite's watcher is pre-configured with ignore patterns at initialization:
        // - **/.git/**, **/node_modules/**, **/test-results/**
        // - Cache dir, out dirs, and anything in .gitignore
        // These patterns are automatically applied to all watched paths
        server.watcher.add(rootsToScan);

        // Watch for ALL events to debug
        if (debug) {
          server.watcher.on('all', (event, file) => {
            if (file.endsWith(filePattern)) {
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
          if (file.endsWith(filePattern)) {
            console.log(
              `\n➕ [watcher:add] New fakepoints file added: ${file}`,
            );

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
          if (file.endsWith(filePattern)) {
            console.log(
              `\n➖ [watcher:unlink] fakepoints file deleted: ${file}`,
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
 * Recursively finds all fakepoints files matching the given pattern in a directory
 */
async function findFakepointFiles(
  rootDir: string,
  ignoreDirs: Set<string>,
  filePattern: string,
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
        } else if (entry.isFile() && entry.name.endsWith(filePattern)) {
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

async function findFakepointFilesForRoots(
  rootsToScan: string[],
  ignoreDirs: Set<string>,
  filePattern: string,
): Promise<string[]> {
  const allFiles = await Promise.all(
    rootsToScan.map(root => findFakepointFiles(root, ignoreDirs, filePattern)),
  );
  const dedupedAbsoluteFiles = new Set<string>();

  for (let index = 0; index < rootsToScan.length; index++) {
    const root = rootsToScan[index];
    const filesInRoot = allFiles[index] ?? [];
    for (const relativeFile of filesInRoot) {
      dedupedAbsoluteFiles.add(path.resolve(root, relativeFile));
    }
  }

  return [...dedupedAbsoluteFiles].sort();
}

function resolveScanConfig(
  rootsToScan: string[] | undefined,
  workspaceRoot: string | undefined,
  cwd: string,
): { rootsToScan: string[]; workspaceRoot: string } {
  if (rootsToScan && rootsToScan.length > 0) {
    if (!workspaceRoot) {
      throw new Error(
        '"workspaceRoot" is required when "rootsToScan" is provided.',
      );
    }

    if (!path.isAbsolute(workspaceRoot)) {
      throw new Error(
        `"workspaceRoot" must be an absolute path when used with "rootsToScan". Received "${workspaceRoot}".`,
      );
    }

    const resolvedRoots = rootsToScan.map(root =>
      path.isAbsolute(root) ? root : path.resolve(workspaceRoot, root),
    );
    return {
      rootsToScan: [...new Set(resolvedRoots)],
      workspaceRoot,
    };
  }

  if (workspaceRoot) {
    if (!path.isAbsolute(workspaceRoot)) {
      console.warn(
        `"workspaceRoot" must be an absolute path. Received "${workspaceRoot}". Falling back to process.cwd().`,
      );
      return { rootsToScan: [cwd], workspaceRoot: cwd };
    }
    return { rootsToScan: [workspaceRoot], workspaceRoot };
  }

  return { rootsToScan: [cwd], workspaceRoot: cwd };
}

function toImportPath(absoluteFilePath: string, importBaseDir: string): string {
  const relativePath = path.relative(importBaseDir, absoluteFilePath);
  const normalizedAbsolutePath = absoluteFilePath.replace(/\\/g, '/');

  if (
    relativePath &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  ) {
    return path.posix.join('/', relativePath.replace(/\\/g, '/'));
  }

  return `/@fs/${normalizedAbsolutePath}`;
}
