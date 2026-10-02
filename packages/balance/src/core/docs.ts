// Reads the sim's source for the words around its numbers: each module's
// header comment, the doc comment above each export, and the doc comments
// on interface fields. Runs at build time (Node), so the editor shows the
// code's own explanations without shipping the source.

export interface ModuleDocs {
  /** The module's opening comment, joined into one paragraph. */
  header: string;
  /** Doc comment and 1-based line of each `export const`. */
  exports: Record<string, { doc: string; line: number }>;
  /** Doc comments on interface fields, by field name (the first one in the module wins). */
  props: Record<string, string>;
}

export type SimDocs = Record<string, ModuleDocs>;

function cleanDoc(raw: string): string {
  return raw
    .trim()
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l !== '')
    .join(' ')
    .trim();
}

export function extractDocs(source: string): ModuleDocs {
  const lines = source.split('\n');
  const headerLines: string[] = [];
  for (const l of lines) {
    if (!l.startsWith('//')) break;
    headerLines.push(l.replace(/^\/\/\s?/, '').trim());
  }
  const header = headerLines.join(' ').replace(/\s+/g, ' ').trim();

  const exports: ModuleDocs['exports'] = {};
  const exportRe = /export\s+(?:const|let)\s+([A-Za-z_$][\w$]*)/g;
  for (let m = exportRe.exec(source); m; m = exportRe.exec(source)) {
    const before = source.slice(0, m.index);
    const line = before.split('\n').length;
    let doc = '';
    const jsdoc = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*$/.exec(before);
    if (jsdoc) doc = cleanDoc(jsdoc[0]);
    else {
      const comments: string[] = [];
      for (let i = line - 2; i >= 0 && /^\s*\/\//.test(lines[i]!); i--) comments.unshift(lines[i]!.replace(/^\s*\/\/\s?/, '').trim());
      // The module header is not this export's comment.
      if (!(comments.length && line - 1 - comments.length === 0)) doc = comments.join(' ');
    }
    exports[m[1]!] = { doc, line };
  }

  const props: ModuleDocs['props'] = {};
  const propRe = /\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/g;
  for (let m = propRe.exec(source); m; m = propRe.exec(source)) {
    const name = m[2]!;
    if (!(name in props)) props[name] = cleanDoc(`/**${m[1]!}*/`);
  }
  return { header, exports, props };
}
