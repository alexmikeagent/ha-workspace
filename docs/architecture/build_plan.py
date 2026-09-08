from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parent

# Prose edits preserve paths, commands, code fences, and source links.
REWRITES = {
    'Build a personal, browser-based workspace using': 'Build a personal web workspace with',
    'This proposal preserves the requested flows and replaces its simulated operations with persistent services.': 'The application will keep these flows and save their state in persistent services.',
    'These are candidate pins, not proof that the complete application compiles together.': 'These are candidate pins. The complete application still needs an installation and build test.',
    'rather than assuming the scaffold already meets them': 'and check whether the scaffold meets them',
    'rather than absolute paths as domain identity': 'for domain identity',
    'rather than a claim about': 'without claiming to identify',
    'Use a small Bun workspace monorepo because': 'A small Bun workspace monorepo fits because',
    'The first meaningful deliverable is a persistent': 'The first deliverable is a persistent',
    'not an exactly-once claim': 'so operations must tolerate repeated attempts',
    'Do not claim Office fidelity or spreadsheet recalculation before testing real samples.': 'Test real files before relying on Office layout fidelity or spreadsheet recalculation.',
    'The observed': 'The observed',
    'Recreate the layout with shadcn primitives and our own tokens; no bundled app assets are needed.': 'Recreate the layout with shadcn primitives and our own tokens.',
    'Its Inter-first font stack and narrow 180px sidebar are approximation choices.': 'The prototype uses an Inter-first font stack and a 180px sidebar.',
    'Use system monospace for Markdown source and identifiers.': 'Use the system monospace font for Markdown source and identifiers.',
    'A proprietary font is not required to achieve the reference\'s system-text appearance.': 'System fonts provide the intended text appearance.',
    'rather than document state': 'separately from document state',
    'rather than assuming': 'and verify whether',
    'This is a design contract for the implementation; no pixel-perfect or browser-validation claim is made for an unbuilt UI.': 'These are requirements for implementation. The application UI has not yet been built or tested.',
    'None of the remaining choices blocks this architecture draft.': 'The remaining choices can be resolved during implementation.',
    'while preserving the current run\'s snapshot': 'while the current run keeps its snapshot',
    'The working hosting assumption': 'The hosting assumption',
}

def prose(text):
    for before, after in REWRITES.items():
        text = text.replace(before, after)
    # Technical ranges become explicit words. Punctuation in code stays untouched.
    text = re.sub(r'(?<=\d)–(?=\d)', ' to ', text)
    text = text.replace(' — ', ': ').replace('—', ', ').replace('–', '-')
    return text

def inline(text):
    tokens = []
    def hold(markup):
        tokens.append(markup)
        return f'\x00{len(tokens)-1}\x00'
    text = re.sub(r'`([^`]+)`', lambda m: hold('<code>'+html.escape(m[1])+'</code>'), text)
    text = re.sub(r'\[([^]]+)\]\(([^)]+)\)', lambda m: hold('<a href="'+html.escape(m[2], quote=True)+'" target="_blank" rel="noopener">'+html.escape(prose(m[1]))+'</a>'), text)
    text = html.escape(prose(text))
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    return re.sub(r'\x00(\d+)\x00', lambda m: tokens[int(m[1])], text)

def markdown(text):
    lines = text.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('```'):
            language = line[3:]
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith('```'):
                code.append(lines[i]); i += 1
            i += 1
            if language == 'mermaid':
                out.append('<p>The interactive system map above shows these components and their responsibilities.</p>')
            else:
                out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>')
            continue
        if line.startswith('|'):
            rows=[]
            while i < len(lines) and lines[i].startswith('|'):
                cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[:\- ]+', c) for c in cells):
                    rows.append(cells)
                i+=1
            head='<thead><tr>'+''.join('<th scope="col">'+inline(c)+'</th>' for c in rows[0])+'</tr></thead>'
            body='<tbody>'+''.join('<tr>'+''.join('<td>'+inline(c)+'</td>' for c in row)+'</tr>' for row in rows[1:])+'</tbody>'
            out.append('<div class="table-wrap"><table>'+head+body+'</table></div>')
            continue
        if line.startswith('### '):
            out.append('<h3>'+inline(line[4:])+'</h3>'); i+=1; continue
        if line.startswith('#### '):
            out.append('<h4>'+inline(line[5:])+'</h4>'); i+=1; continue
        if re.match(r'^(\d+\. |- )', line):
            ordered=bool(re.match(r'^\d+\.', line)); tag='ol' if ordered else 'ul'; items=[]
            while i<len(lines) and re.match(r'^(\d+\. |- )',lines[i]):
                items.append('<li>'+inline(re.sub(r'^(\d+\. |- )','',lines[i]))+'</li>');i+=1
            out.append('<'+tag+'>'+''.join(items)+'</'+tag+'>');continue
        paragraph=[]
        while i<len(lines) and lines[i].strip() and not re.match(r'^(```|\||#{2,4} |\d+\. |- )',lines[i]):
            paragraph.append(lines[i]);i+=1
        out.append('<p>'+inline(' '.join(paragraph))+'</p>')
    return '\n'.join(out)

def notes(file, prefix):
    text=(ROOT/file).read_text()
    text=re.sub(r'^# .*\n','',text,count=1)
    chunks=re.split(r'^## (.+)$',text,flags=re.M)
    result=[]
    if chunks[0].strip():
        result.append('<details><summary>'+prefix+' / document context</summary><div class="appendix-content">'+markdown(chunks[0])+'</div></details>')
    for j in range(1,len(chunks),2):
        result.append('<details><summary>'+prefix+' / '+html.escape(prose(chunks[j]))+'</summary><div class="appendix-content">'+markdown(chunks[j+1])+'</div></details>')
    return '\n'.join(result)

template=(ROOT/'plan.template.html').read_text()
appendix=notes('SETUP.md','Foundation')+'<div class="appendix-divider">Architecture decisions</div>'+notes('ARCHITECTURE.md','Architecture')+'<div class="appendix-divider">Effect implementation guidance</div>'+notes('EFFECT_GUIDE.md','Effect')+'<div class="appendix-divider">Interface requirements</div>'+notes('DESIGN.md','Design')
sample=(ROOT/'effect-example.mts').read_text().split('\nconst runtime =', 1)[0].strip()
output=template.replace('{{APPENDIX}}',appendix).replace('{{EFFECT_SAMPLE}}', html.escape(sample))
assert '{{APPENDIX}}' not in output and '{{EFFECT_SAMPLE}}' not in output
(ROOT/'ha-workspace-plan.html').write_text(output)
print('Created', ROOT/'ha-workspace-plan.html', len(output.encode()), 'bytes')
