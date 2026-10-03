// Finds where a value of the sim's data is written in the source, so
// balance:apply can change it in that one place. Follows a path (export
// name, keys, indices) through object and array literals, spreads, local
// constants, imports, small helper functions (their parameters and the
// objects they return) and `.map` copies, down to what is written there:
//
// - a literal: rewritten (through a scale helper such as `ds(16)`, `cm(120)`
//   or `45 * STEPS_PER_SECOND`, the literal inside is rewritten);
// - a named constant or enum member used for this row only (`research:
//   R.Bronze`, `[ST, 20]`): that use is replaced, the constant left alone;
// - a default the row takes from a shared object (`...base`): the row gets
//   its own key, which overrides the default for it alone.
//
// Anything that would change other rows too (a literal inside a helper
// several rows call, a shared list, a value worked out by a formula) is
// reported for a person to change.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

export type DataPath = ReadonlyArray<string | number>;

/** What the edit does: rewrite a literal, replace an expression, or add a key to a row's object. */
export type EditKind = 'literal' | 'scaled' | 'replace' | 'insert';

export interface Located {
  ok: true;
  kind: EditKind;
  /** File relative to the sim's src folder, and the span to replace (start = end for an insert). */
  file: string;
  start: number;
  end: number;
  line: number;
  /** What is written there now (for an insert, the object it goes in). */
  text: string;
  /** For an insert: the key to add, and whether a comma is needed before it. */
  key?: string;
  comma?: boolean;
  /** The enum a replaced reference belongs to (`Res` for `Res.Stone` or for an alias of it), so the new one can be written by name. */
  enumName?: string;
}

export interface NotLocated {
  ok: false;
  /** Why it needs a person, in plain words. */
  reason: string;
  /** Where to look, when known: file:line. */
  where?: string;
}

export type Location = Located | NotLocated;

export type Runtime = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

const NOT_FOUND = Symbol('not found');

interface Env {
  sf: ts.SourceFile;
  /** Parameters bound to the call's arguments. */
  params: Map<string, { expr: ts.Expression; env: Env } | null>;
  /** Constants declared inside the function body being followed. */
  locals: Map<string, ts.Expression>;
  /** Set when what is being followed is shared by several rows: a helper's body, a `.map` callback, a constant used more than once. */
  shared: string;
}

type Res = { leaf: ts.Expression; env: Env } | NotLocated | Located | typeof NOT_FOUND;

function isResult(r: Res): r is NotLocated | Located {
  return r !== NOT_FOUND && 'ok' in r;
}

export class SourceIndex {
  private readonly files = new Map<string, ts.SourceFile>();

  /** `runtime` (the sim's modules by path) lets enum members be read by name; without it references are written as numbers. */
  constructor(readonly simSrc: string, readonly runtime: Runtime = {}) {}

  file(rel: string): ts.SourceFile | null {
    const cached = this.files.get(rel);
    if (cached) return cached;
    const abs = join(this.simSrc, rel);
    if (!existsSync(abs)) return null;
    const sf = ts.createSourceFile(rel, readFileSync(abs, 'utf8'), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    this.files.set(rel, sf);
    return sf;
  }

  /** Where the value at `path` in module `module` is written. */
  locate(module: string, path: DataPath): Location {
    const sf = this.file(module);
    if (!sf) return { ok: false, reason: `the sim has no file ${module}` };
    const [name, ...rest] = path;
    if (typeof name !== 'string') return { ok: false, reason: 'the path does not start with an export name' };
    const init = this.topConst(sf, name);
    if (!init) return { ok: false, reason: `${module} has no constant ${name}` };
    const r = this.walk(init, rest, this.topEnv(sf), 0);
    if (r === NOT_FOUND) return { ok: false, reason: 'the value is not written in the source (it comes from a default or a calculation)', where: this.where(sf, init) };
    if ('ok' in r) return r;
    return this.leaf(r.leaf, r.env, 0);
  }

  private topEnv(sf: ts.SourceFile): Env {
    return { sf, params: new Map(), locals: new Map(), shared: '' };
  }

  private where(sf: ts.SourceFile, n: ts.Node): string {
    return `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  }

  private fail(reason: string, env: Env, n: ts.Node): NotLocated {
    return { ok: false, reason, where: this.where(env.sf, n) };
  }

  private topConst(sf: ts.SourceFile, name: string): ts.Expression | null {
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return d.initializer;
    }
    return null;
  }

  private topFunction(sf: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | null {
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name && st.body) return st;
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || d.name.text !== name || !d.initializer) continue;
        const init = unwrap(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
      }
    }
    return null;
  }

  /** An imported name: the file it comes from (within the sim) and its name there. */
  private imported(sf: ts.SourceFile, name: string): { sf: ts.SourceFile; name: string } | null {
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const spec = st.moduleSpecifier.text;
      if (!spec.startsWith('.')) continue;
      const named = st.importClause?.namedBindings;
      if (!named || !ts.isNamedImports(named)) continue;
      for (const el of named.elements) {
        if (el.name.text !== name) continue;
        const rel = relative(this.simSrc, resolve(dirname(join(this.simSrc, sf.fileName)), spec)).split('\\').join('/');
        const other = this.file(rel);
        return other ? { sf: other, name: (el.propertyName ?? el.name).text } : null;
      }
    }
    return null;
  }

  /** Resolves a name to its expression: a bound parameter, a local of the followed function, a constant of the file or an import. */
  private lookup(name: string, env: Env): { expr: ts.Expression; env: Env } | NotLocated | null {
    if (env.params.has(name)) {
      const p = env.params.get(name);
      return p ?? { ok: false, reason: `it is worked out from ${name}, which this row does not set` };
    }
    const local = env.locals.get(name);
    if (local) return { expr: local, env };
    let sf = env.sf;
    let top = this.topConst(sf, name);
    let declName = name;
    if (!top) {
      const imp = this.imported(sf, name);
      if (imp) {
        sf = imp.sf;
        declName = imp.name;
        top = this.topConst(sf, imp.name);
      }
    }
    if (!top) return null;
    const uses = countRefs(sf, declName);
    const shared = env.shared || (uses > 1 ? `the constant ${declName}, which ${uses} places use` : '');
    return { expr: top, env: { ...this.topEnv(sf), shared } };
  }

  private walk(expr: ts.Expression, path: DataPath, env: Env, depth: number): Res {
    if (depth > 60) return this.fail('the value is too deeply nested to follow', env, expr);
    const e = unwrap(expr);
    if (path.length === 0) return { leaf: e, env };
    const [step, ...rest] = path;

    if (ts.isIdentifier(e)) {
      const found = this.lookup(e.text, env);
      if (!found) return this.fail(`it comes from ${e.text}, which could not be followed`, env, e);
      if ('ok' in found) return found;
      return this.walk(found.expr, path, found.env, depth + 1);
    }

    if (ts.isObjectLiteralExpression(e)) {
      if (typeof step !== 'string') return this.fail('the path expects a list here but the source has an object', env, e);
      // A row spread into a shared object ({ heightCm: 400, ...row }): a key the row lacks can be added to the row.
      let rowTarget: { obj: ts.ObjectLiteralExpression; env: Env } | null = null;
      for (let i = e.properties.length - 1; i >= 0; i--) {
        const p = e.properties[i]!;
        const explicit = ts.isPropertyAssignment(p) && this.keyOf(p.name, env) === step ? p.initializer
          : ts.isShorthandPropertyAssignment(p) && p.name.text === step ? p.name : null;
        if (explicit) {
          const r = this.walk(explicit, rest, env, depth + 1);
          if (rest.length === 0 && env.shared && rowTarget && r !== NOT_FOUND && !isResult(r)) return this.insert(rowTarget.obj, step, rowTarget.env);
          return r;
        }
        if (ts.isSpreadAssignment(p)) {
          const inner = unwrap(p.expression);
          // ...(cond ? { a } : {}): only a problem if a branch sets this key.
          if (ts.isConditionalExpression(inner)) {
            const a = this.walk(inner.whenTrue, path, env, depth + 1);
            const b = this.walk(inner.whenFalse, path, env, depth + 1);
            if (a === NOT_FOUND && b === NOT_FOUND) continue;
            return this.fail('the value depends on a condition', env, inner);
          }
          const r = this.walk(p.expression, path, env, depth + 1);
          if (r === NOT_FOUND) {
            if (!rowTarget) {
              const row = this.objectOf(p.expression, env, depth + 1);
              if (row && !row.env.shared) rowTarget = row;
            }
            continue;
          }
          // A default from a shared object (...base, ...defaults): give this row its own key instead, if the row is its own.
          const sharedDefault = (isResult(r) && !r.ok) || (!isResult(r) && r.env.shared !== '');
          if (rest.length === 0 && sharedDefault && !env.shared) return this.insert(e, step, env);
          if (rest.length === 0 && sharedDefault && rowTarget) return this.insert(rowTarget.obj, step, rowTarget.env);
          return r;
        }
      }
      return NOT_FOUND;
    }

    if (ts.isArrayLiteralExpression(e)) {
      if (typeof step !== 'number') return this.fail('the path expects an object here but the source has a list', env, e);
      let i = 0;
      for (const el of e.elements) {
        if (ts.isSpreadElement(el)) {
          const spread = this.arrayOf(el.expression, env, depth + 1);
          if (!spread) return this.fail('the list is built from other lists', env, el);
          if (step < i + spread.items.length) return this.walk(spread.items[step - i]!, rest, spread.env, depth + 1);
          i += spread.items.length;
          continue;
        }
        if (i === step) return this.walk(el, rest, env, depth + 1);
        i++;
      }
      return NOT_FOUND;
    }

    if (ts.isCallExpression(e)) {
      // rows.map((r) => ({ ...r, extra })) keeps each row's own values.
      if (ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === 'map' && typeof step === 'number') {
        const cb = e.arguments[0] && unwrap(e.arguments[0]);
        if (!cb || !(ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) return this.fail('the list is made by a calculation', env, e);
        const p0 = cb.parameters[0];
        const body = ts.isBlock(cb.body) ? singleReturn(cb.body) : cb.body;
        if (!p0 || !ts.isIdentifier(p0.name) || !body) return this.fail('the list is made by a calculation', env, e);
        const list = e.expression.expression;
        const rowEnv: Env = { sf: env.sf, params: new Map(env.params), locals: new Map(env.locals), shared: env.shared || 'the .map that makes every row' };
        // The row's item, followed when the callback uses it.
        const item = this.arrayOf(list, env, depth + 1);
        if (item && item.items[step]) rowEnv.params.set(p0.name.text, { expr: item.items[step]!, env: item.env });
        else rowEnv.params.set(p0.name.text, null);
        return this.walk(body, rest, rowEnv, depth + 1);
      }
      const callee = unwrap(e.expression);
      if (!ts.isIdentifier(callee)) return this.fail('the value is worked out by a calculation', env, e);
      const fnEnv = this.enterCall(e, callee.text, env);
      if (!fnEnv) {
        // A wrapper we cannot read: look in its only argument. The check after applying catches a wrapper that overrides it.
        if (e.arguments.length === 1) return this.walk(e.arguments[0]!, path, env, depth + 1);
        return this.fail(`the value is worked out by ${callee.text}()`, env, e);
      }
      if ('ok' in fnEnv) return fnEnv;
      return this.walk(fnEnv.body, path, fnEnv.env, depth + 1);
    }

    if (ts.isConditionalExpression(e)) return this.fail('the value depends on a condition', env, e);
    return this.fail('the value is worked out by a calculation', env, e);
  }

  /** The items of a list expression (through names, parameters and spreads), or null when it is not a plain list. */
  private arrayOf(expr: ts.Expression, env: Env, depth: number): { items: ts.Expression[]; env: Env } | null {
    if (depth > 60) return null;
    const e = unwrap(expr);
    if (ts.isIdentifier(e)) {
      const found = this.lookup(e.text, env);
      if (!found || 'ok' in found) return null;
      return this.arrayOf(found.expr, found.env, depth + 1);
    }
    if (!ts.isArrayLiteralExpression(e)) return null;
    // Items of a spread keep their own env, so only lists without nested spreads of other envs are flattened.
    const items: ts.Expression[] = [];
    for (const el of e.elements) {
      if (ts.isSpreadElement(el)) {
        // Items past a list we cannot read have unknown positions: stop there.
        const inner = this.arrayOf(el.expression, env, depth + 1);
        if (!inner || inner.env !== env) break;
        items.push(...inner.items);
      } else items.push(el);
    }
    return { items, env };
  }

  /** The object literal an expression stands for (through names and parameters), or null. */
  private objectOf(expr: ts.Expression, env: Env, depth: number): { obj: ts.ObjectLiteralExpression; env: Env } | null {
    if (depth > 60) return null;
    const e = unwrap(expr);
    if (ts.isObjectLiteralExpression(e)) return { obj: e, env };
    if (ts.isIdentifier(e)) {
      const found = this.lookup(e.text, env);
      if (!found || 'ok' in found) return null;
      return this.objectOf(found.expr, found.env, depth + 1);
    }
    return null;
  }

  /** A key of an object literal: written, or computed from an enum member (`[Band.Fringe]`). */
  private keyOf(n: ts.PropertyName, env: Env): string | null {
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
    if (ts.isComputedPropertyName(n)) {
      const v = this.evaluate(n.expression, env, 0);
      return v === undefined ? null : String(v);
    }
    return null;
  }

  /** The value of a simple expression (a number, an enum member, a constant), using the sim's modules; undefined if unknown. */
  private evaluate(expr: ts.Expression, env: Env, depth: number): number | undefined {
    if (depth > 20) return undefined;
    const e = unwrap(expr);
    if (ts.isNumericLiteral(e)) return Number(e.text);
    if (ts.isIdentifier(e)) {
      const found = this.lookup(e.text, env);
      return found && !('ok' in found) ? this.evaluate(found.expr, found.env, depth + 1) : undefined;
    }
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
      const obj = this.enumObject(e.expression.text, env);
      const v = obj?.[e.name.text];
      return typeof v === 'number' ? v : undefined;
    }
    return undefined;
  }

  /**
   * The runtime object an enum name refers to in a file (Res, Mob: a const object of numbers with a type of the same
   * name), when the sim's modules were given. Other objects of numbers (BURST, BLAST) are not enums.
   */
  private enumObject(name: string, env: Env): Record<string, unknown> | undefined {
    let sf = env.sf;
    let declName = name;
    if (!this.topConst(sf, name)) {
      const imp = this.imported(sf, name);
      if (!imp) return undefined;
      sf = imp.sf;
      declName = imp.name;
    }
    const v = this.runtime[sf.fileName]?.[declName];
    const typed = sf.statements.some((st) => ts.isTypeAliasDeclaration(st) && st.name.text === declName);
    if (v && typeof v === 'object' && typed && Object.values(v).every((x) => typeof x === 'number')) return v as Record<string, unknown>;
    // A local alias of an enum: const R = Research.
    const init = this.topConst(sf, declName);
    if (init && ts.isIdentifier(unwrap(init))) return this.enumObject((unwrap(init) as ts.Identifier).text, { ...env, sf });
    return undefined;
  }

  /** The enum a reference expression names, followed through aliases (`ST` for `Res.Stone`), if it is in scope where it is written. */
  private enumOf(expr: ts.Expression, env: Env, depth = 0): string | undefined {
    if (depth > 10) return undefined;
    const e = unwrap(expr);
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
      return this.enumObject(e.expression.text, env) ? e.expression.text : undefined;
    }
    if (ts.isIdentifier(e) && !env.params.has(e.text)) {
      const init = this.topConst(env.sf, e.text);
      if (!init) return undefined;
      const u = unwrap(init);
      if (ts.isPropertyAccessExpression(u) && ts.isIdentifier(u.expression) && this.enumObject(u.expression.text, env)) return u.expression.text;
      return this.enumOf(u, env, depth + 1);
    }
    return undefined;
  }

  private insert(obj: ts.ObjectLiteralExpression, key: string, env: Env): Located {
    const close = obj.getEnd() - 1;
    const props = obj.properties;
    const last = props[props.length - 1];
    const trailingComma = props.hasTrailingComma;
    const at = last ? (trailingComma ? close : last.getEnd()) : close;
    // Indent like the object's other lines when it spans several.
    return {
      ok: true, kind: 'insert', file: env.sf.fileName, start: at, end: at, text: obj.getText(env.sf).slice(0, 60), key,
      comma: !!last && !trailingComma, line: env.sf.getLineAndCharacterOfPosition(at).line + 1,
    };
  }

  /** Binds a call's arguments to the function's parameters; returns the expression it returns. */
  private enterCall(call: ts.CallExpression, name: string, env: Env): { body: ts.Expression; env: Env } | NotLocated | null {
    let sf = env.sf;
    let fnName = name;
    let fn = this.topFunction(sf, name);
    if (!fn) {
      const imp = this.imported(sf, name);
      if (imp) {
        sf = imp.sf;
        fnName = imp.name;
        fn = this.topFunction(sf, imp.name);
      }
    }
    if (!fn?.body) return null;
    const params = new Map<string, { expr: ts.Expression; env: Env } | null>();
    for (let i = 0; i < fn.parameters.length; i++) {
      const p = fn.parameters[i]!;
      if (!ts.isIdentifier(p.name) || p.dotDotDotToken) return null;
      const arg = call.arguments[i];
      if (arg) params.set(p.name.text, { expr: arg, env });
      else if (p.initializer) params.set(p.name.text, { expr: p.initializer, env: { ...this.topEnv(sf), shared: `the default of ${fnName}()'s ${p.name.text}` } });
      else params.set(p.name.text, null);
    }
    const locals = new Map<string, ts.Expression>();
    let body: ts.Expression | null;
    if (ts.isBlock(fn.body)) {
      for (const st of fn.body.statements) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) locals.set(d.name.text, d.initializer);
      }
      body = singleReturn(fn.body);
    } else body = fn.body;
    if (!body) return null;
    const calls = countCalls(sf, fnName);
    const shared = env.shared || (calls > 1 ? `${fnName}(), which ${calls} rows share` : '');
    return { body, env: { sf, params, locals, shared } };
  }

  /** What is written at the end of the path, and how to change it for this row alone. */
  private leaf(expr: ts.Expression, env: Env, depth: number): Location {
    const e = unwrap(expr);
    if (depth > 20) return this.fail('the value is too deeply nested to follow', env, e);
    const at = (n: ts.Node, kind: EditKind, extra: Partial<Located> = {}): Location => {
      if (env.shared) return this.fail(`it is written in ${env.shared}, so changing it there would change other rows too`, env, n);
      return {
        ok: true, kind, file: env.sf.fileName, start: n.getStart(env.sf), end: n.getEnd(), text: n.getText(env.sf),
        line: env.sf.getLineAndCharacterOfPosition(n.getStart(env.sf)).line + 1, ...extra,
      };
    };
    if (isNumberLiteral(e) || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword) return at(e, 'literal');
    if (ts.isIdentifier(e) && env.params.has(e.text)) {
      const p = env.params.get(e.text);
      if (!p) return this.fail(`it is worked out from ${e.text}, which this row does not set`, env, e);
      return this.leaf(p.expr, p.env, depth + 1);
    }
    // A scale helper: ds(16), cm(120), sec(60).
    if (ts.isCallExpression(e) && e.arguments.length === 1 && ts.isIdentifier(unwrap(e.expression))) {
      const inner = this.leaf(e.arguments[0]!, env, depth + 1);
      if (inner.ok && inner.kind === 'literal') return { ...inner, kind: 'scaled' };
      if (inner.ok) return this.fail(`it is worked out by ${e.getText(env.sf)}`, env, e);
      return inner;
    }
    // 45 * STEPS_PER_SECOND, 10 * M.
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
      const l = unwrap(e.left);
      const r = unwrap(e.right);
      const lit = isNumberLiteral(l) ? l : isNumberLiteral(r) ? r : null;
      const other = lit === l ? r : l;
      if (lit && (ts.isIdentifier(other) || ts.isPropertyAccessExpression(other)) && !(ts.isIdentifier(other) && env.params.has(other.text))) return at(lit, 'scaled');
      const param = [l, r].find((x) => ts.isIdentifier(x) && env.params.has(x.text));
      if (param) {
        const inner = this.leaf(param, env, depth + 1);
        if (inner.ok && inner.kind === 'literal') return { ...inner, kind: 'scaled' };
        if (inner.ok) return this.fail(`it is worked out by ${e.getText(env.sf)}`, env, e);
        return inner;
      }
    }
    // A named constant or enum member used here: replace this use only.
    if (ts.isIdentifier(e) || (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression))) {
      const enumName = this.enumOf(e, env);
      return at(e, 'replace', enumName ? { enumName } : {});
    }
    return this.fail(`it is worked out by the formula ${e.getText(env.sf)}`, env, e);
  }
}

function unwrap(e: ts.Expression): ts.Expression {
  let x = e;
  for (;;) {
    if (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
    else return x;
  }
}

function isNumberLiteral(e: ts.Expression): boolean {
  return ts.isNumericLiteral(e) || (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand));
}

function singleReturn(b: ts.Block): ts.Expression | null {
  const returns = b.statements.filter(ts.isReturnStatement);
  return returns.length === 1 && returns[0]!.expression ? returns[0]!.expression : null;
}

function countCalls(sf: ts.SourceFile, name: string): number {
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) n++;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** Uses of a top-level name in its file, its declaration and property keys left out. */
function countRefs(sf: ts.SourceFile, name: string): number {
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) {
      const p = node.parent;
      const isDecl = (ts.isVariableDeclaration(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node)
        || (ts.isPropertyAccessExpression(p) && p.name === node) || ts.isImportSpecifier(p) || ts.isExportSpecifier(p);
      if (!isDecl) n++;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
}

/** The number a literal reads as. */
export function literalValue(text: string): number | boolean {
  if (text === 'true') return true;
  if (text === 'false') return false;
  return Number(text.replace(/_/g, ''));
}
