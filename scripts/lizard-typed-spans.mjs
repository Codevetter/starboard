import ts from 'typescript';

// Lizard can misread JSX closing tags and escaped regex literals and merge following
// declarations into one function. Bound only impossible named-function spans;
// keep its conservative CCN and parameter counts and all existing thresholds.
export function boundTypedFunctionLength(line, row, readSource) {
  const fields = line.match(/"(?:[^"]|"")*"|[^,]+/gu);
  if (!fields || fields.length < 10) return row;
  const unquote = (value) => value.replace(/^"|"$/gu, '').replaceAll('""', '"');
  const file = unquote(fields[6]);
  const name = unquote(fields[7]);
  if (!/^.*\.tsx?$/.test(file) || name === '(anonymous)') return row;
  const source = ts.createSourceFile(
    file,
    readSource(file),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const declarations = source.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
  );
  if (declarations.length !== 1) return row;
  const declaration = declarations[0];
  const actualLength =
    source.getLineAndCharacterOfPosition(declaration.end).line -
    source.getLineAndCharacterOfPosition(declaration.getStart(source)).line +
    1;
  return row[4] > actualLength ? [...row.slice(0, 4), actualLength] : row;
}
