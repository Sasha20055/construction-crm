import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const layers = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const root = resolve('frontend/src');
const parts = (path) => relative(root, path).split(sep);

export function checkImports(path, source) {
  const [sourceLayer, sourceSlice] = parts(path);
  const failures = [];
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function inspect(value) {
    if (!value.startsWith('@/') && !value.startsWith('.')) return;
    const target = value.startsWith('@/')
      ? resolve(root, value.slice(2))
      : resolve(dirname(path), value);
    const [targetLayer, targetSlice, ...rest] = parts(target);
    const sameSlice = sourceLayer === targetLayer && sourceSlice === targetSlice;
    const fail = (reason) => failures.push(`${relative(root, path)}: ${reason}: ${value}`);
    if (!layers.includes(targetLayer)) return fail('unknown layer or import outside src');
    if (layers.indexOf(targetLayer) > layers.indexOf(sourceLayer)) fail('upward import');
    if (targetLayer === sourceLayer && !['app', 'shared'].includes(sourceLayer) && !sameSlice)
      fail('cross-slice import');
    if (!sameSlice && targetLayer !== 'app' && rest.length) fail('private slice import');
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      inspect(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) inspect(argument.text);
      else failures.push(`${relative(root, path)}: dynamic imports must have a literal path`);
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      inspect(node.argument.literal.text);
    ts.forEachChild(node, visit);
  }
  visit(file);
  return failures;
}
async function walk(dir) {
  const failures = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) failures.push(...(await walk(path)));
    else if (/\.(ts|tsx)$/.test(path))
      failures.push(...checkImports(path, await readFile(path, 'utf8')));
  }
  return failures;
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const failures = await walk(root);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  } else console.log('FSD import boundaries: OK');
}
