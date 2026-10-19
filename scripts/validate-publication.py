"""Check generated files and local HTML links without a browser."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import argparse
import json
import sys

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.links = []
        self.path = path

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for key in ('href', 'src'):
            if attrs.get(key):
                self.links.append(attrs[key])

def validate(root):
    pages = {}
    errors = []
    checked = 0
    for file in root.rglob('*.html'):
        page = Page(file)
        page.feed(file.read_text(encoding='utf-8-sig'))
        pages[file.resolve()] = page
        if len(page.ids) != len(set(page.ids)):
            errors.append([str(file.relative_to(root)), 'duplicate ids'])
    if not pages:
        errors.append(['site', 'no HTML pages'])
    for file, page in pages.items():
        for link in page.links:
            url = urlsplit(link)
            if url.scheme or url.netloc or url.path.startswith('/'):
                continue
            target = (file.parent / unquote(url.path)).resolve() if url.path else file
            if target.is_dir():
                target = target / 'index.html'
            checked += 1
            if not target.exists():
                errors.append([str(file.relative_to(root)), link, 'missing file'])
            elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
                errors.append([str(file.relative_to(root)), link, 'missing anchor'])
    for name in ['output/pdf/case-storeassist.pdf', 'prototype/dist/app.js', 'site.js', 'site.css']:
        if not (root / name).is_file():
            errors.append([name, 'missing deliverable'])
    for stem in ['01-bpmn-as-is','02-bpmn-to-be','03-bpmn-create-request','04-bpmn-cancellation','05-bpmn-discrepancy','06-bpmn-search-handover','07-bpmn-service-handover','08-request-states']:
        for suffix in ['png', 'svg', 'puml' if stem.startswith('08') else 'bpmn']:
            if not (root / 'assets/diagrams' / f'{stem}.{suffix}').is_file():
                errors.append([stem, suffix, 'missing diagram'])
    print(json.dumps({'pages':len(pages), 'links':checked, 'errors':errors}, ensure_ascii=False, indent=2))
    return not errors

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('root', type=Path, nargs='?', default=Path(__file__).resolve().parents[1] / 'pages-build')
    sys.exit(0 if validate(parser.parse_args().root.resolve()) else 1)
