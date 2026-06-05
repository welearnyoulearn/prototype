"""
Adds try/catch INSIDE the body of exported route handlers that lack it.
Keeps function signatures 100% untouched.

Before:
  export async function GET(req: NextRequest) {
    const { rows } = await pool.query(...)
    return NextResponse.json(rows)
  }

After:
  export async function GET(req: NextRequest) {
    try {
      const { rows } = await pool.query(...)
      return NextResponse.json(rows)
    } catch (err: unknown) {
      console.error('[API]', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
"""
import re, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app', 'api')

CATCH_BLOCK = (
    ' catch (err: unknown) {\n'
    '    console.error(\'[API]\', err)\n'
    '    return NextResponse.json({ error: \'Internal server error\' }, { status: 500 })\n'
    '  }'
)

def find_close_brace(s, start):
    """Return index of the } that closes the { at position start."""
    depth = 0
    i = start
    in_str = False
    sc = None
    while i < len(s):
        c = s[i]
        if in_str:
            if c == '\\' and sc != '`': i += 2; continue
            if c == sc: in_str = False
        else:
            if c in ('"', "'", '`'): in_str = True; sc = c
            elif c == '{': depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0: return i
        i += 1
    return -1

def find_matching_paren(s, start):
    """Return index of the ) that closes the ( at position start."""
    depth = 0
    i = start
    in_str = False
    sc = None
    while i < len(s):
        c = s[i]
        if in_str:
            if c == '\\' and sc != '`': i += 2; continue
            if c == sc: in_str = False
        else:
            if c in ('"', "'", '`'): in_str = True; sc = c
            elif c == '(': depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0: return i
        i += 1
    return -1

HANDLER_RE = re.compile(
    r'export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(',
    re.MULTILINE
)

def needs_wrap(body: str) -> bool:
    stripped = body.strip()
    return not (stripped.startswith('try {') or stripped.startswith('try{'))

def indent_body(body: str, extra: str = '  ') -> str:
    lines = body.split('\n')
    return '\n'.join(extra + l if l.strip() else l for l in lines)

def transform(path):
    with open(path, encoding='utf-8') as f:
        src = f.read()

    out = src
    offset = 0
    changed = False

    for m in HANDLER_RE.finditer(src):
        adj = m.start() + offset  # adjusted pos in `out`

        # Find opening paren of params
        paren_open = out.index('(', adj)
        paren_close = find_matching_paren(out, paren_open)
        if paren_close == -1: continue

        # Find the opening { of the function body (skip whitespace after params close)
        after_params = out[paren_close+1:].lstrip()
        # Could be ': void {' or just ' {' or '{\n'
        # Find the next '{' after paren_close
        brace_open = out.index('{', paren_close)
        brace_close = find_close_brace(out, brace_open)
        if brace_close == -1: continue

        body = out[brace_open+1:brace_close]
        if not needs_wrap(body): continue

        # Wrap body in try/catch
        indented = indent_body(body)
        new_body = '\n  try {' + indented + '}' + CATCH_BLOCK + '\n'

        out = out[:brace_open+1] + new_body + out[brace_close:]
        offset += len(new_body) - len(body)
        changed = True

    if not changed:
        return False

    with open(path, 'w', encoding='utf-8') as f:
        f.write(out)
    return True

count = 0
for dirpath, _, files in os.walk(ROOT):
    for fn in files:
        if fn == 'route.ts':
            fp = os.path.join(dirpath, fn)
            try:
                if transform(fp):
                    rel = os.path.relpath(fp, os.path.join(ROOT, '..', '..'))
                    print(f"  wrapped: {rel}")
                    count += 1
            except Exception as e:
                rel = os.path.relpath(fp, os.path.join(ROOT, '..', '..'))
                print(f"  ERROR {rel}: {e}")

print(f"\nDone — {count} files updated")
