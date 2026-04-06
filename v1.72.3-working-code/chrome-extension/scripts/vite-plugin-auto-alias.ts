import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ViteAlias = {
  find: string;
  replacement: string;
};

const MANUAL_ALIAS_OVERRIDES = new Set([
  'sonner',
  '@monaco-editor/react',
]);

type PackageJsonShape = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function readPackageJson(projectDir: string): PackageJsonShape {
  const pkgPath = resolve(projectDir, 'package.json');

  if (!existsSync(pkgPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8')) as PackageJsonShape;
  } catch {
    return {};
  }
}

export function generateAutoAliases(projectDir: string): ViteAlias[] {
  const pkg = readPackageJson(projectDir);

  const dependencyNames = Object.keys({
    ...(pkg.dependencies ?? {}),
    ...(pkg.optionalDependencies ?? {}),
  })
    .filter((name) => !MANUAL_ALIAS_OVERRIDES.has(name))
    .sort((a, b) => a.localeCompare(b));

  return dependencyNames.map((name) => ({
    find: name,
    replacement: resolve(projectDir, 'node_modules', name),
  }));
}
