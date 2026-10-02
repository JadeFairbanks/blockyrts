#!/usr/bin/env python3
"""Extracts the blueprint .docx into docs/blueprint.md.

The .docx in the project's shared folder is canon; this markdown copy lets
code threads read the spec from the repository. Re-run after the doc changes:

    python3 packages/tools/scripts/extract-blueprint.py path/to/adventure-blueprint-controls.docx docs/blueprint.md

Standard library only. Handles headings, list paragraphs (with nesting
levels), bold and italic runs, and tables (as markdown tables).
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def run_text(r):
    parts = []
    for child in r:
        tag = child.tag
        if tag == W + 't':
            parts.append(child.text or '')
        elif tag == W + 'tab':
            parts.append(' ')
        elif tag in (W + 'br', W + 'cr'):
            parts.append(' ')
        elif tag == W + 'noBreakHyphen':
            parts.append('-')
    text = ''.join(parts)
    rpr = r.find(W + 'rPr')
    bold = italic = False
    if rpr is not None:
        b = rpr.find(W + 'b')
        i = rpr.find(W + 'i')
        bold = b is not None and b.get(W + 'val') not in ('0', 'false')
        italic = i is not None and i.get(W + 'val') not in ('0', 'false')
        va = rpr.find(W + 'vertAlign')
        if va is not None and va.get(W + 'val') == 'superscript' and text:
            text = '^' + text
    return text, bold, italic


def para_text(p, allow_format=True):
    out = []
    for r in p.iter(W + 'r'):
        text, bold, italic = run_text(r)
        if not text:
            continue
        if allow_format and text.strip():
            lead = text[: len(text) - len(text.lstrip())]
            trail = text[len(text.rstrip()):]
            core = text.strip()
            if bold and italic:
                core = f'***{core}***'
            elif bold:
                core = f'**{core}**'
            elif italic:
                core = f'*{core}*'
            text = lead + core + trail
        out.append(text)
    s = ''.join(out)
    # Merge adjacent same-format markers produced by split runs.
    s = s.replace('****', '').replace('** **', ' ')
    return re.sub(r'[ \t]+', ' ', s).strip()


def style_of(p):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        return '', None
    st = ppr.find(W + 'pStyle')
    style = st.get(W + 'val') if st is not None else ''
    num = ppr.find(W + 'numPr')
    level = None
    if num is not None:
        ilvl = num.find(W + 'ilvl')
        level = int(ilvl.get(W + 'val')) if ilvl is not None else 0
    return style, level


def cell_text(tc):
    paras = [para_text(p) for p in tc.iter(W + 'p')]
    return '<br>'.join(t for t in paras if t).replace('|', '\\|')


def table_md(tbl):
    rows = []
    for tr in tbl.findall(W + 'tr'):
        cells = []
        for tc in tr.findall(W + 'tc'):
            span = 1
            tcpr = tc.find(W + 'tcPr')
            if tcpr is not None and tcpr.find(W + 'gridSpan') is not None:
                span = int(tcpr.find(W + 'gridSpan').get(W + 'val'))
            cells.append(cell_text(tc))
            cells.extend([''] * (span - 1))
        rows.append(cells)
    if not rows:
        return ''
    width = max(len(r) for r in rows)
    rows = [r + [''] * (width - len(r)) for r in rows]
    lines = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * width]
    lines += ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
    return '\n'.join(lines)


def convert(docx_path):
    with zipfile.ZipFile(docx_path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    out = []
    for el in body:
        if el.tag == W + 'p':
            style, level = style_of(el)
            if style == 'Title':
                out.append('# ' + para_text(el, False))
            elif style == 'Subtitle':
                out.append('*' + para_text(el, False) + '*')
            elif style.startswith('Heading'):
                n = int(style[7:] or 1)
                out.append('#' * (n + 1) + ' ' + para_text(el, False))
            else:
                text = para_text(el)
                if not text:
                    continue
                if level is not None:
                    out.append('  ' * level + '- ' + text)
                else:
                    out.append(text)
        elif el.tag == W + 'tbl':
            out.append(table_md(el))
    # Blank lines between blocks, but keep consecutive list items together.
    md = []
    for i, block in enumerate(out):
        is_item = block.lstrip().startswith('- ')
        prev_item = i > 0 and out[i - 1].lstrip().startswith('- ')
        if md and not (is_item and prev_item):
            md.append('')
        md.append(block)
    return '\n'.join(md) + '\n'


HEADER = """<!--
Generated from the canonical blueprint, adventure-blueprint-controls.docx, by
packages/tools/scripts/extract-blueprint.py. Do not edit by hand: the .docx is
canon and blueprint changes go through the project coordinator. Re-run the
script to refresh this copy.
-->

"""

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: extract-blueprint.py <blueprint.docx> <out.md>')
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        f.write(HEADER + convert(sys.argv[1]))
