import os
from html.parser import HTMLParser

class SimpleHTMLValidator(HTMLParser):
    def __init__(self, filepath):
        super().__init__()
        self.filepath = filepath
        self.tags = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        # We don't track self-closing tags in HTML5
        self_closing = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
                        'link', 'meta', 'param', 'source', 'track', 'wbr']
        if tag not in self_closing:
            self.tags.append(tag)

    def handle_endtag(self, tag):
        self_closing = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
                        'link', 'meta', 'param', 'source', 'track', 'wbr']
        if tag in self_closing:
            return
        if not self.tags:
            self.errors.append(f"Unexpected closing tag </{tag}> at line {self.getpos()[0]}")
            return
        last_tag = self.tags.pop()
        if last_tag != tag:
            # HTML allows some unclosed tags but let's see if there is mismatch
            self.errors.append(f"Mismatched tag: opened <{last_tag}> but closed </{tag}> at line {self.getpos()[0]}")

files_to_check = [
    r'c:\Users\iqii\Downloads\Bendahara\Admin\Admin-Dashboard.html',
    r'c:\Users\iqii\Downloads\Bendahara\Admin\Kelola-Anggota.html',
    r'c:\Users\iqii\Downloads\Bendahara\Admin\Kelola-Kas.html',
    r'c:\Users\iqii\Downloads\Bendahara\Admin\All-Transaksi.html',
    r'c:\Users\iqii\Downloads\Bendahara\pembayaran-kas.html'
]

for filepath in files_to_check:
    print(f"Checking {os.path.basename(filepath)}...")
    if not os.path.exists(filepath):
        print("File does not exist!")
        continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check simple JavaScript syntax errors
    # E.g. unmatched braces, brackets, parentheses inside scripts
    import re
    scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
    for idx, script in enumerate(scripts):
        # Basic balance check
        braces = 0
        brackets = 0
        parens = 0
        for char in script:
            if char == '{': braces += 1
            elif char == '}': braces -= 1
            elif char == '[': brackets += 1
            elif char == ']': brackets -= 1
            elif char == '(': parens += 1
            elif char == ')': parens -= 1
        if braces != 0 or brackets != 0 or parens != 0:
            print(f"  Warning: Possible unbalanced brackets in script block {idx+1}: braces={braces}, brackets={brackets}, parens={parens}")

    validator = SimpleHTMLValidator(filepath)
    try:
        validator.feed(content)
        if validator.errors:
            print(f"  HTML Warnings/Errors ({len(validator.errors)}):")
            for err in validator.errors[:5]:
                print(f"    {err}")
        else:
            print("  OK")
    except Exception as e:
        print(f"  Failed parsing: {e}")
