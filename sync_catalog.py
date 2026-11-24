"""Index public entries reachable from the two model folders only."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
import json
import re
import time

ROOT = '1HGAmijXJArvQfPT_IrlE00UkZDwTaIvv'
MODELS = {'نموذج 2025', 'نموذج 2026'}


class Listing(HTMLParser):
    def __init__(self):
        super().__init__()
        self.entries = []
        self.valid = False
        self.in_title = False
        self.item = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class', '').split()
        if a.get('id') == 'flip-contents':
            self.valid = True
        if 'flip-entry' in cls:
            ident = a.get('id', '').removeprefix('entry-')
            if not re.fullmatch(r'[\w-]+', ident):
                raise ValueError('Invalid entry')
            self.item = {'id': ident, 'title': '', 'folder': False, 'kind': ''}
            self.entries.append(self.item)
        if self.item is None:
            return
        if tag == 'a' and 'href' in a:
            self.item['folder'] = '/folders/' in a['href']
        if a.get('aria-label') and not self.item['kind']:
            self.item['kind'] = a['aria-label']
        if 'shortcut' in a.get('class', '').lower():
            self.item['shortcut'] = True
        if 'flip-entry-title' in cls:
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == 'div':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.item['title'] += data


def listing(ident):
    url = 'https://drive.google.com/embeddedfolderview?hl=en&id=' + ident
    for attempt in range(3):
        try:
            with urlopen(url, timeout=35) as response:
                parser = Listing()
                parser.feed(response.read().decode('utf8'))
            if not parser.valid or any(not x['title'] for x in parser.entries):
                raise ValueError('Incomplete Drive listing')
            return parser.entries
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2**attempt)


def collect():
    roots = [r for r in listing(ROOT) if r['folder'] and not r.get('shortcut') and r['title'] in MODELS]
    queue = [(r['id'], [r['title']]) for r in roots]
    seen = set()
    files = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        while queue:
            batch = queue
            queue = []
            for (ident, path), children in zip(batch, pool.map(listing, [b[0] for b in batch])):
                seen.add(ident)
                for item in children:
                    if item['folder']:
                        if not item.get('shortcut') and item['id'] not in seen:
                            queue.append((item['id'], path + [item['title']]))
                    else:
                        files.append(dict(id=item['id'], title=item['title'], kind=item['kind'], path=path))
    return sorted(files, key=lambda x: (x['path'], x['id']))


if __name__ == '__main__':
    rows = collect()
    Path('catalog.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    print('Public files indexed:', len(rows))
