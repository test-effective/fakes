import { readdir } from 'fs/promises';
import path from 'path';
import type { Plugin } from 'vite';

export type CollectFakepointsPluginOptions = {
  /**
   * The root directory to search for fakepoints files.
   * Defaults to process.cwd()
   */
  workspaceRoot?: string;
  debug?: boolean;
};

export function collectFakepointsPlugin(
  options: CollectFakepointsPluginOptions = {},
): Plugin[] {
  const VIRTUAL_MODULE_ID = 'collected-fakepoints';
  const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const debug = options.debug ?? false;
  return [
    // Pre plugin: Handle virtual module registration
    {
      name: 'collect-fakepoints:pre',
      enforce: 'pre', // Run before other plugins to ensure virtual module is registered early

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
          const fakepointFiles = await findFakepointFiles(workspaceRoot);

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
    },
  ];
}

/**
 * Recursively finds all .fakepoints.ts files in a directory
 */
async function findFakepointFiles(rootDir: string): Promise<string[]> {
  const fakepointFiles: string[] = [];
  const ignoreDirs = new Set(['node_modules', 'dist', 'tmp', '.git']);

  async function walk(dir: string, basePath: string = '') {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const relativePath = basePath
          ? path.join(basePath, entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          // Skip ignored directories
          if (!ignoreDirs.has(entry.name)) {
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
