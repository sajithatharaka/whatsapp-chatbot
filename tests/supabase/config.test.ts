import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const supabaseDir = path.join(__dirname, '../../supabase');

describe('supabase/config.toml', () => {
  it('declares exactly one [functions.<name>] entry per function directory', () => {
    const configToml = readFileSync(path.join(supabaseDir, 'config.toml'), 'utf-8');
    const declaredFunctions = [...configToml.matchAll(/^\[functions\.([\w-]+)\]/gm)]
      .map((match) => match[1])
      .sort();

    const functionDirs = readdirSync(path.join(supabaseDir, 'functions'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== '_shared')
      .map((entry) => entry.name)
      .sort();

    expect(declaredFunctions).toEqual(functionDirs);
  });
});

describe('supabase/migrations', () => {
  const migrationFiles = readdirSync(path.join(supabaseDir, 'migrations')).filter((name) =>
    name.endsWith('.sql')
  );

  it('has at least one migration', () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it('every migration follows the <14-digit-timestamp>_<slug>.sql naming convention', () => {
    for (const name of migrationFiles) {
      expect(name).toMatch(/^\d{14}_.+\.sql$/);
    }
  });

  it('has no duplicate migration timestamps', () => {
    const timestamps = migrationFiles.map((name) => name.slice(0, 14));
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });
});
