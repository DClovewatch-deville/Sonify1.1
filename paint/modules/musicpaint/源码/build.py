#!/usr/bin/env python3
"""Rebuild the self-contained offline app using Python's standard library."""
import argparse
import hashlib
import re
from pathlib import Path

SCRIPTS = ('04-instrument-samples.js', 'samples.js', 'vision.js', 'color.js', 'classical.js', 'music.js', 'sketch.js', 'sketch-ui.js', 'studio-ui.js', 'app.js')
ENTRY = 'MusicPaint.html'


def replace_once(html, pattern, replacement):
    result, count = re.subn(pattern, lambda _: replacement, html)
    if count != 1:
        raise ValueError(f'Expected one asset reference, found {count}: {pattern}')
    return result


def build(source):
    html = (source / 'index.html').read_text(encoding='utf-8')
    css = (source / 'styles.css').read_text(encoding='utf-8')
    html = replace_once(html, r'<link\s+rel="stylesheet"\s+href="styles\.css"\s*/?>',
                        '<style>\n' + css + '\n</style>')
    html = replace_once(html, r'<link\s+rel="stylesheet"\s+href="studio\.css"\s*/?>', '<style>\n' + (source / 'studio.css').read_text(encoding='utf-8') + '\n</style>')
    html = replace_once(html, r'<link\s+rel="stylesheet"\s+href="studio-extra\.css"\s*/?>', '<style>\n' + (source / 'studio-extra.css').read_text(encoding='utf-8') + '\n</style>')
    for name in SCRIPTS:
        code = (source / name).read_text(encoding='utf-8').replace('</script', '<\\/script')
        html = replace_once(html, r'<script\s+src="' + re.escape(name) + r'"\s*>\s*</script>',
                            '<script>\n' + code + '\n</script>')
    html = html.replace('href="index.html"', 'href="#"')
    if re.search(r'<script\b[^>]*\bsrc=', html):
        raise ValueError('External script reference remained in the offline entry')
    return html.encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare existing build without writing')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    destination = source.parent / ENTRY
    data = build(source)
    if args.check:
        if not destination.is_file() or destination.read_bytes() != data:
            raise SystemExit('Build differs: run python3 build.py')
        print('PASS: byte-for-byte reproducible offline entry')
    else:
        destination.write_bytes(data)
        print('Built:', destination.name)
    print('SHA256:', hashlib.sha256(data).hexdigest())
    print('Bytes:', len(data))


if __name__ == '__main__':
    main()
