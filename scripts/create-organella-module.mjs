#!/usr/bin/env node
/**
 * Organella Module Scaffolder CLI (create-organella-module)
 * Usage:
 *   pnpm create:module <module-id> [--title "Module Title"] [--port 5002] [--permissions "patient:read,medication:read"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith('--')) {
  console.error(
    '❌ Usage: pnpm create:module <module-id> [--title "Module Name"] [--port 5002] [--permissions "patient:read,medication:read"]'
  );
  process.exit(1);
}

const moduleId = args[0].trim().toLowerCase();
const federationName = moduleId.replace(/[^a-z0-9]/g, '_');

function getArgValue(flag, defaultVal) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultVal;
}

const moduleTitle = getArgValue('--title', `Organella ${moduleId} Module`);
const tabTitle = getArgValue('--tab-title', moduleTitle);
const port = Number(getArgValue('--port', '5002'));
const permissionsRaw = getArgValue('--permissions', 'patient:read,encounter:read');
const permissions = permissionsRaw
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const targetDir = path.join(ROOT_DIR, 'modules', moduleId);
if (fs.existsSync(targetDir)) {
  console.error(`❌ Module directory already exists: ${targetDir}`);
  process.exit(1);
}

fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });

// 1. manifest.json
const manifest = {
  id: moduleId,
  name: moduleTitle,
  version: '0.1.0',
  author: 'Organella Community',
  description: `${moduleTitle} — Micro-Frontend Extension Module for Organella`,
  permissions,
  frontend: {
    entry: `http://localhost:${port}/assets/remoteEntry.js`,
    slots: [
      {
        slotId: 'patient-workspace-tab',
        title: tabTitle,
        component: './WorkspaceTab',
      },
    ],
  },
};
fs.writeFileSync(
  path.join(targetDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8'
);
fs.writeFileSync(
  path.join(targetDir, 'module.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8'
);

// 2. package.json
const pkgJson = {
  name: `@organella-module/${moduleId}`,
  version: '0.1.0',
  private: true,
  type: 'module',
  main: './src/index.ts',
  types: './src/index.ts',
  scripts: {
    dev: `vite --port ${port} --host`,
    build: 'tsc && vite build',
    preview: `vite preview --port ${port} --host`,
    typecheck: 'tsc --noEmit',
  },
  dependencies: {
    '@organella/sdk': 'workspace:*',
    '@organella/fhir-helpers': 'workspace:*',
    react: '^18.3.1',
    'react-dom': '^18.3.1',
  },
  devDependencies: {
    '@originjs/vite-plugin-federation': '^1.3.5',
    '@types/react': '^18.3.3',
    '@types/react-dom': '^18.3.0',
    '@vitejs/plugin-react': '^4.3.0',
    typescript: '^5.4.5',
    vite: '^5.2.11',
  },
};
fs.writeFileSync(
  path.join(targetDir, 'package.json'),
  JSON.stringify(pkgJson, null, 2) + '\n',
  'utf8'
);

// 3. tsconfig.json
const tsConfig = {
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    outDir: './dist',
    rootDir: './src',
  },
  include: ['src'],
};
fs.writeFileSync(
  path.join(targetDir, 'tsconfig.json'),
  JSON.stringify(tsConfig, null, 2) + '\n',
  'utf8'
);

// 4. vite.config.ts
const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: '${federationName}',
      filename: 'remoteEntry.js',
      exposes: {
        './WorkspaceTab': './src/WorkspaceTab.tsx',
      },
      shared: ['react', 'react-dom', '@organella/sdk'],
    }),
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: ${port},
    cors: true,
  },
  preview: {
    port: ${port},
    cors: true,
  },
});
`;
fs.writeFileSync(path.join(targetDir, 'vite.config.ts'), viteConfig, 'utf8');

// 5. index.html
const indexHtml = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${moduleTitle} (Standalone Preview)</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-slate-100 text-slate-800">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
fs.writeFileSync(path.join(targetDir, 'index.html'), indexHtml, 'utf8');

// 6. src/WorkspaceTab.tsx
const workspaceTabCode = `import React, { useContext, useMemo } from 'react';
import {
  checkRequiredPermissions,
  OrganellaContext,
  PatientTabProps,
} from '@organella/sdk';

export const REQUIRED_MODULE_ROLES = ${JSON.stringify(permissions)};

export const WorkspaceTab: React.FC<PatientTabProps> = ({
  patient,
  activeEncounter,
  user,
  readonly,
}) => {
  const ctx = useContext(OrganellaContext);
  const effectiveUser = user || ctx?.user;

  const permCheck = useMemo(
    () => checkRequiredPermissions(effectiveUser?.permissions, REQUIRED_MODULE_ROLES),
    [effectiveUser?.permissions]
  );

  if (!permCheck.allowed && !readonly) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 space-y-2">
        <h4 className="font-bold text-sm">🚫 ปฏิเสธการเข้าถึงโมดูล ${moduleTitle}</h4>
        <p>{permCheck.errorMessage}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {permCheck.requiredRoles.map((r) => (
            <span
              key={r}
              className={\`font-mono px-2 py-0.5 rounded border \${
                permCheck.missingRoles.includes(r)
                  ? 'bg-red-100 text-red-800 border-red-300 font-bold'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }\`}
            >
              {permCheck.missingRoles.includes(r) ? \`✗ ขาดสิทธิ์: \${r}\` : \`✓ มีสิทธิ์: \${r}\`}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-bold text-slate-900 text-base">${moduleTitle}</h4>
          <p className="text-xs text-slate-500">
            ผู้ป่วย: {patient.prefix} {patient.firstName} {patient.lastName} (HN: {patient.hn}) | Visit: {activeEncounter?.id || '-'}
          </p>
        </div>
        <span className="text-xs bg-teal-50 text-teal-700 px-2.5 py-1 rounded border border-teal-200 font-mono">
          module: ${moduleId}
        </span>
      </div>
    </div>
  );
};

export default WorkspaceTab;
`;
fs.writeFileSync(path.join(targetDir, 'src', 'WorkspaceTab.tsx'), workspaceTabCode, 'utf8');

// 7. src/index.ts
fs.writeFileSync(
  path.join(targetDir, 'src', 'index.ts'),
  `export { WorkspaceTab, default } from './WorkspaceTab';\n`,
  'utf8'
);

// 8. src/main.tsx
const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { WorkspaceTab } from './WorkspaceTab';

const mockPatient = {
  id: 'pat-0001',
  hn: 'HN-2026-0001',
  prefix: 'นาย',
  firstName: 'สมชาย',
  lastName: 'ใจดี',
  gender: 'male' as const,
  birthDate: '1978-05-14',
  allergies: ['Penicillin'],
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white p-6 rounded-xl shadow border border-slate-200">
        <WorkspaceTab
          moduleId="${moduleId}"
          patient={mockPatient}
          readonly={true}
        />
      </div>
    </div>
  </React.StrictMode>
);
`;
fs.writeFileSync(path.join(targetDir, 'src', 'main.tsx'), mainTsx, 'utf8');

console.log(`✅ Successfully scaffolded Organella module '@organella-module/${moduleId}' at modules/${moduleId}!`);
console.log(`   - Port: ${port}`);
console.log(`   - Required Permissions: [${permissions.join(', ')}]`);
