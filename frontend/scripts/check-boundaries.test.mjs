import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { checkImports } from './check-boundaries.mjs';
const check = (file, code) => checkImports(resolve('frontend/src', file), code);

test('static, dynamic, export and type imports respect public APIs', () => {
  for (const code of [
    "import x from '@/entities/task/model'",
    "import('@/entities/task/model')",
    "export * from '@/entities/task/model'",
    "type T = import('@/entities/task/model').Task",
  ])
    assert.equal(check('pages/sites/index.tsx', code).length, 1, code);
});
test('relative paths cannot bypass layers and slices', () => {
  assert.equal(check('entities/task/queries.ts', "import '../../features/auth'").length, 1);
  assert.equal(check('features/auth/model/use-auth.ts', "import '../../manage-task'").length, 1);
  assert.deepEqual(check('features/auth/ui/auth.tsx', "import '../model/use-auth'"), []);
});
test('valid public and lazy imports pass; comments do not count', () => {
  assert.deepEqual(
    check('app/application.tsx', "import('@/pages/sites'); // import('@/entities/task/private')"),
    [],
  );
  assert.deepEqual(check('pages/sites/index.tsx', "import { Task } from '@/entities/task'"), []);
  assert.equal(check('entities/task/model.ts', 'import(path)').length, 1);
});
