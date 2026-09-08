"""Make one explicit text replacement into a new file; never edit the source."""
from pathlib import Path
import html
import json
import re
import sys
import zipfile
from lxml import etree
from read_document import verify

WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
TEXT = re.compile(r"(<w:t(?:\s[^>]*)?>)(.*?)(</w:t>)", re.DOTALL)
XML_SPACE = re.compile(r"(\bxml:space\s*=\s*)([\"'])(.*?)\2")
NON_TEXT = re.compile(r"<!--.*?-->|<!\[CDATA\[.*?\]\]>|<\?.*?\?>", re.DOTALL)
ENCODED_CHARACTER = re.compile(r"&(?:#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|apos|quot);|[^&]", re.DOTALL)
BOUNDARIES = {f"{{{WORD}}}{name}" for name in (
    "tab", "br", "cr", "drawing", "pict", "noBreakHyphen", "softHyphen", "sym",
    "footnoteReference", "endnoteReference", "separator", "continuationSeparator",
)}
REVIEW_ELEMENTS = {f"{{{WORD}}}{name}" for name in (
    "fldChar", "fldSimple", "instrText", "delText", "ins", "del", "moveFrom", "moveTo", "txbxContent", "sdt",
)}


def occurrences(text, find):
    """Count every candidate start, including overlapping matches."""
    positions = []
    cursor = 0
    while (position := text.find(find, cursor)) != -1:
        positions.append(position)
        cursor = position + 1
    return positions


def replace_nodes(document, nodes, find, replacement):
    values = [element.text or "" for element, _ in nodes]
    text = "".join(values)
    positions = occurrences(text, find)
    if len(positions) != 1:
        raise ValueError("The selected text must occur exactly once in the document body.")
    start, end = positions[0], positions[0] + len(find)
    cursor = 0
    edits = []
    inserted = False
    for (_, node), value in zip(nodes, values):
        left, right = cursor, cursor + len(value)
        cursor = right
        if right <= start or left >= end:
            continue
        raw_text = document[node.start(2):node.end(2)]
        boundaries = [0] + [match.end() for match in ENCODED_CHARACTER.finditer(raw_text)]
        if len(boundaries) != len(value) + 1 or boundaries[-1] != len(raw_text):
            raise ValueError("This Word text encoding requires review.")
        prefix = raw_text[:boundaries[max(0, start - left)]]
        suffix = raw_text[boundaries[max(0, end - left)]:] if end < right else ""
        updated = prefix + (html.escape(replacement, quote=False) if not inserted else "") + suffix
        inserted = True
        opening = node[1]
        if XML_SPACE.search(opening):
            opening = XML_SPACE.sub(lambda match: match[1] + match[2] + "preserve" + match[2], opening)
        else:
            opening = opening[:-1] + ' xml:space="preserve">'
        edits.append((node.start(), node.end(), opening + updated + node[3]))
    for left, right, value in reversed(edits):
        document = document[:left] + value + document[right:]
    return document


def replace_word_body(raw, find, replacement):
    document = raw.decode("utf-8")
    if "<!DOCTYPE" in document:
        raise ValueError("A Word document with a document type declaration requires review.")
    root = etree.fromstring(raw, etree.XMLParser(resolve_entities=False, no_network=True))
    if root.tag != f"{{{WORD}}}document" or root.nsmap.get("w") != WORD:
        raise ValueError("This Word text layout requires review.")
    # Parse structure for selection, but patch the original XML byte-for-byte.
    # Mask comments/CDATA so text-looking markup in them cannot become a match.
    masked = NON_TEXT.sub(lambda match: " " * len(match[0]), document)
    spans = list(TEXT.finditer(masked))
    elements = list(root.iter(f"{{{WORD}}}t"))
    if len(spans) != len(elements):
        raise ValueError("This Word text layout requires review.")
    mapped = {}
    for element, span in zip(elements, spans):
        original = document[span.start(2):span.end(2)]
        if len(element) or "<" in original or html.unescape(original) != (element.text or ""):
            raise ValueError("This Word text layout requires review.")
        mapped[element] = span
    candidates = []
    total = 0
    for paragraph in root.iter(f"{{{WORD}}}p"):
        all_text = "".join(element.text or "" for element in paragraph.iter(f"{{{WORD}}}t"))
        unsupported = (
            any(element.tag in REVIEW_ELEMENTS for element in paragraph.iter())
            or any(ancestor.tag in REVIEW_ELEMENTS or ancestor.tag == f"{{{WORD}}}p" for ancestor in paragraph.iterancestors())
            or any(element is not paragraph for element in paragraph.iter(f"{{{WORD}}}p"))
        )
        if unsupported:
            if occurrences(all_text, find):
                raise ValueError("The selected text is in a field, content control, tracked change, or nested paragraph and requires review.")
            continue
        segments = [[]]
        for element in paragraph.iter():
            if element.tag in BOUNDARIES:
                segments.append([])
            elif element.tag == f"{{{WORD}}}t":
                segments[-1].append((element, mapped[element]))
        for nodes in segments:
            count = len(occurrences("".join(element.text or "" for element, _ in nodes), find))
            total += count
            if count:
                candidates.append(nodes)
    if total != 1 or len(candidates) != 1:
        raise ValueError("The selected text must occur exactly once within uninterrupted document-body text. Headers, fields, and cross-paragraph changes require review.")
    return replace_nodes(document, candidates[0], find, replacement).encode("utf-8")


def revise(source, output, find, replacement):
    if not isinstance(find, str) or not isinstance(replacement, str) or not find or find == replacement or len(find) > 4000 or len(replacement) > 20000:
        raise ValueError("Enter a specific piece of existing text and a different replacement.")
    if any(ord(char) < 32 and char not in "\n\r\t" for char in find + replacement):
        raise ValueError("Control characters are not supported.")
    if output.exists():
        raise ValueError("The candidate already exists; it will not be overwritten.")
    if source.suffix.lower() in {".txt", ".md"}:
        if source.stat().st_size > 2 * 1024 * 1024:
            raise ValueError("This text file is too large for a revision.")
        # newline="" preserves CRLF/CR and a UTF-8 BOM outside the requested edit.
        with source.open("r", encoding="utf-8", newline="") as handle:
            text = handle.read()
        if len(occurrences(text, find)) != 1:
            raise ValueError("The selected text must occur exactly once.")
        with output.open("x", encoding="utf-8", newline="") as handle:
            handle.write(text.replace(find, replacement, 1))
        return
    if source.suffix.lower() != ".docx":
        raise ValueError("Text revisions currently support DOCX, Markdown, and text files.")
    if any(character in replacement for character in "\n\r\t"):
        raise ValueError("A Word replacement must stay within one uninterrupted text span.")
    verify(source)
    with zipfile.ZipFile(source) as archive:
        document = replace_word_body(archive.read("word/document.xml"), find, replacement)
        with zipfile.ZipFile(output, "x") as candidate:
            candidate.comment = archive.comment
            for item in archive.infolist():
                candidate.writestr(item, document if item.filename == "word/document.xml" else archive.read(item.filename))
    verify(output)


if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        revise(Path(sys.argv[1]), Path(sys.argv[2]), request["find"], request["replacement"])
        print(json.dumps({"created": True}))
    except Exception as error:
        print(json.dumps({"created": False, "message": str(error) if isinstance(error, ValueError) else "The revision could not be prepared safely."}))
        sys.exit(2)
