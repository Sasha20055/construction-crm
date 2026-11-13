// Introspect the exact migration with PostgreSQL (PGlite) when local Supabase isn't running.
// Cloud/local Supabase can also generate the equivalent contract via `npm run db:types`.
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { format } from 'prettier';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
for (const name of (await readdir('backend/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort()) {
  await db.exec(await readFile(`backend/migrations/${name}`, 'utf8'));
}
const { rows: enums } =
  await db.query(`select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels from pg_type t
join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' group by t.typname`);
const enumNames = new Set(enums.map((e) => e.typname));
const type = (name) =>
  enumNames.has(name)
    ? `Database['public']['Enums']['${name}']`
    : /^(int|float|numeric)/.test(name)
      ? 'number'
      : name === 'bool'
        ? 'boolean'
        : 'string';
const { rows: columns } =
  await db.query(`select table_name,column_name,udt_name,is_nullable,column_default
from information_schema.columns where table_schema='public' order by table_name,ordinal_position`);
const tables = [...new Set(columns.map((c) => c.table_name))];
const { rows: fns } =
  await db.query(`select p.proname, p.proargnames, p.proargtypes::oid[] as arg_oids,
p.pronargdefaults, t.typname as return_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_type t on t.oid=p.prorettype where n.nspname='public' order by p.proname`);
const { rows: types } = await db.query('select oid,typname from pg_type');
const names = new Map(types.map((t) => [t.oid, t.typname]));
let out =
  '// Generated from the migration by backend/scripts/generate-schema-types.mjs. Do not edit manually.\n';
out += 'export type Database = { public: { Tables: {\n';
for (const table of tables) {
  const cols = columns.filter((c) => c.table_name === table);
  const shape = (mode) =>
    cols
      .map(
        (c) =>
          `  ${c.column_name}${mode === 'Update' || (mode === 'Insert' && (c.column_default !== null || c.is_nullable === 'YES')) ? '?' : ''}: ${type(c.udt_name)}${c.is_nullable === 'YES' ? ' | null' : ''};`,
      )
      .join('\n');
  out += `${table}: {\nRow: {\n${shape('Row')}\n};\nInsert: {\n${shape('Insert')}\n};\nUpdate: {\n${shape('Update')}\n};\nRelationships: [];\n};\n`;
}
out += '}; Views: { [_ in never]: never }; Functions: {\n';
for (const fn of fns) {
  const resultType = tables.includes(fn.return_name)
    ? `Database['public']['Tables']['${fn.return_name}']['Row']`
    : fn.return_name === 'void'
      ? 'undefined'
      : type(fn.return_name);
  out += `${fn.proname}: { Args: { ${fn.proargnames.map((name, i) => `${name}${i >= fn.arg_oids.length - fn.pronargdefaults ? '?' : ''}: ${type(names.get(fn.arg_oids[i]))}${name === 'p_comment' ? ' | null' : ''}`).join('; ')} }; Returns: ${resultType} };\n`;
}
out += `}; Enums: { ${enums.map((e) => `${e.typname}: ${e.labels.map((l) => `'${l}'`).join(' | ')}`).join('; ')} }; CompositeTypes: { [_ in never]: never } } };\n`;
out +=
  "export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];\n";
await writeFile(
  'frontend/src/shared/api/database.types.ts',
  await format(out, {
    parser: 'typescript',
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'all',
  }),
);
await db.close();
console.log('Database types generated from PostgreSQL catalog');
