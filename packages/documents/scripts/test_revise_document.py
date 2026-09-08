"""Synthetic revision-boundary tests. All fixtures live in a disposable temp directory."""
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile
from lxml import etree
from revise_document import revise
from read_document import extract, preview_row

WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
OPEN = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="' + WORD + '" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    'mc:Ignorable="w14" mc:PreserveAttributes="w14:paraId"><w:body>'
)
CLOSE = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>'


class RevisionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ha-revision-fixture-")
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name)

    def document(self, paragraphs, name="source.docx", opening=OPEN):
        source = self.directory / name
        xml = (opening + paragraphs + CLOSE).encode("utf-8")
        with zipfile.ZipFile(source, "x", zipfile.ZIP_DEFLATED) as archive:
            archive.comment = b"Synthetic package comment"
            archive.writestr("word/document.xml", xml)
            archive.writestr("word/styles.xml", b'<w:styles xmlns:w="' + WORD.encode() + b'">  <w:style w:styleId="Keep"/> </w:styles>')
            archive.writestr("word/header1.xml", b'<w:hdr xmlns:w="' + WORD.encode() + b'"><w:p><w:r><w:t>Header stays unchanged</w:t></w:r></w:p></w:hdr>')
            archive.writestr("custom/opaque.bin", b"\x00\x01\xff\r\nprivate synthetic bytes")
        return source

    def revise(self, source, find, replacement):
        original = source.read_bytes()
        output = self.directory / ("candidate" + source.suffix)
        revise(source, output, find, replacement)
        self.assertEqual(source.read_bytes(), original)
        return output

    def rejected(self, source, find, replacement="replacement"):
        original = source.read_bytes()
        output = self.directory / ("rejected" + source.suffix)
        with self.assertRaises(ValueError):
            revise(source, output, find, replacement)
        self.assertEqual(source.read_bytes(), original)
        self.assertFalse(output.exists())

    def test_replaces_across_formatted_runs_and_preserves_all_other_parts(self):
        paragraph = '<w:p w:rsidR="01234567"><w:r><w:rPr><w:b/></w:rPr><w:t>Before ab</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>cdef after</w:t></w:r></w:p>'
        source = self.document(paragraph)
        output = self.revise(source, "bcde", "new & <text>")
        expected = (
            OPEN + '<w:p w:rsidR="01234567"><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Before anew &amp; &lt;text&gt;</w:t></w:r>'
            '<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">f after</w:t></w:r></w:p>' + CLOSE
        ).encode()
        with zipfile.ZipFile(source) as before, zipfile.ZipFile(output) as after:
            self.assertEqual(after.read("word/document.xml"), expected)
            self.assertEqual(before.comment, after.comment)
            self.assertEqual(before.namelist(), after.namelist())
            for name in before.namelist():
                if name != "word/document.xml":
                    self.assertEqual(before.read(name), after.read(name))
            # Compatibility attributes and their namespace declarations survive exactly.
            self.assertTrue(after.read("word/document.xml").startswith(OPEN.encode()))

    def test_preserves_entity_encoding_outside_the_selected_text(self):
        source = self.document('<w:p><w:r><w:t xml:space="preserve">&#x41;&#32;&amp; old &#65; &apos;</w:t></w:r></w:p>')
        output = self.revise(source, "old", "new")
        with zipfile.ZipFile(source) as before, zipfile.ZipFile(output) as after:
            self.assertEqual(after.read("word/document.xml"), before.read("word/document.xml").replace(b"old", b"new"))

    def test_explicit_default_whitespace_is_changed_to_preserve(self):
        source = self.document("<w:p><w:r><w:t xml:space = 'default'>old</w:t></w:r></w:p>")
        output = self.revise(source, "old", "  new  ")
        with zipfile.ZipFile(output) as archive:
            xml = archive.read("word/document.xml")
            self.assertIn(b"xml:space = 'preserve'", xml)
            text = next(etree.fromstring(xml).iter("{" + WORD + "}t"))
            self.assertEqual(text.text, "  new  ")

    def test_rejects_overlapping_docx_matches(self):
        self.rejected(self.document('<w:p><w:r><w:t>aaaa</w:t></w:r></w:p>'), "aaa")

    def test_rejects_multiple_docx_occurrences(self):
        self.rejected(self.document('<w:p><w:r><w:t>old</w:t></w:r></w:p><w:p><w:r><w:t>old</w:t></w:r></w:p>'), "old")

    def test_rejects_cross_paragraph_selection(self):
        self.rejected(self.document('<w:p><w:r><w:t>first</w:t></w:r></w:p><w:p><w:r><w:t>second</w:t></w:r></w:p>'), "firstsecond")

    def test_rejects_matches_across_tabs_breaks_and_drawings(self):
        for number, boundary in enumerate(["tab", "br", "cr", "drawing", "pict", "noBreakHyphen", "sym", "footnoteReference"]):
            with self.subTest(boundary=boundary):
                source = self.document(f'<w:p><w:r><w:t>first</w:t><w:{boundary}/><w:t>second</w:t></w:r></w:p>', name=f"boundary-{number}.docx")
                self.rejected(source, "firstsecond")

    def test_rejects_field_result_edits(self):
        source = self.document('<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/><w:t>old</w:t><w:fldChar w:fldCharType="end"/></w:r></w:p>')
        self.rejected(source, "old")

    def test_rejects_simple_fields_and_tracked_changes(self):
        for number, element in enumerate(["fldSimple", "ins", "del"]):
            with self.subTest(element=element):
                source = self.document(f'<w:p><w:{element}><w:r><w:t>old</w:t></w:r></w:{element}></w:p>', name=f"review-{number}.docx")
                self.rejected(source, "old")

    def test_rejects_nested_textbox_paragraphs(self):
        self.rejected(self.document('<w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>old</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>'), "old")

    def test_rejects_bound_content_controls_and_controls_around_paragraphs(self):
        control = '<w:sdt><w:sdtPr><w:dataBinding w:xpath="/example/value"/></w:sdtPr><w:sdtContent><w:r><w:t>old</w:t></w:r></w:sdtContent></w:sdt>'
        self.rejected(self.document('<w:p>' + control + '</w:p>'), "old")
        outer = self.document('<w:sdt><w:sdtContent><w:p><w:r><w:t>old</w:t></w:r></w:p></w:sdtContent></w:sdt>', name="outer.docx")
        self.rejected(outer, "old")

    def test_duplicate_zip_parts_are_rejected_before_creating_a_candidate(self):
        source = self.document('<w:p><w:r><w:t>old</w:t></w:r></w:p>')
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(source, "a") as archive:
                archive.writestr("word/styles.xml", b'<duplicate/>')
        self.rejected(source, "old")

    def test_comment_markup_does_not_count_as_visible_text(self):
        source = self.document('<!-- <w:p><w:r><w:t>old</w:t></w:r></w:p> --><w:p><w:r><w:t>old</w:t></w:r></w:p>')
        output = self.revise(source, "old", "new")
        with zipfile.ZipFile(output) as archive:
            xml = archive.read("word/document.xml")
            self.assertIn(b'<!-- <w:p><w:r><w:t>old</w:t></w:r></w:p> -->', xml)
            self.assertIn(b'<w:t xml:space="preserve">new</w:t>', xml)

    def test_undeclared_compatibility_namespace_blocks_output(self):
        invalid = OPEN.replace('xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ', "")
        self.rejected(self.document('<w:p><w:r><w:t>old</w:t></w:r></w:p>', opening=invalid), "old")

    def test_word_owner_file_blocks_output(self):
        source = self.document('<w:p><w:r><w:t>old</w:t></w:r></w:p>')
        owner = source.with_name("~$" + source.name)
        owner.write_bytes(b"synthetic owner")
        self.rejected(source, "old")
        self.assertEqual(owner.read_bytes(), b"synthetic owner")

    def test_plaintext_preserves_utf8_bom_and_mixed_line_endings(self):
        source = self.directory / "source.md"
        original = b"\xef\xbb\xbfHeading\r\nold\r\nAnother\rFinal\n"
        source.write_bytes(original)
        output = self.revise(source, "old", "new")
        self.assertEqual(output.read_bytes(), original.replace(b"old", b"new"))

    def test_rejects_overlapping_plaintext_matches(self):
        source = self.directory / "source.txt"
        source.write_text("aaaa", encoding="utf-8")
        self.rejected(source, "aaa")

    def test_existing_candidate_is_never_overwritten(self):
        source = self.directory / "source.txt"
        source.write_bytes(b"old")
        output = self.directory / "candidate.txt"
        output.write_bytes(b"keep existing")
        with self.assertRaises(ValueError):
            revise(source, output, "old", "new")
        self.assertEqual(source.read_bytes(), b"old")
        self.assertEqual(output.read_bytes(), b"keep existing")

    def test_csv_marks_long_cells_and_extra_columns_as_truncated(self):
        source = self.directory / "wide.csv"
        source.write_text(",".join(["x" * 501] + ["value"] * 30), encoding="utf-8")
        original = source.read_bytes()
        result = extract(source)
        self.assertTrue(result["truncated"])
        self.assertEqual(len(result["sheets"][0]["rows"][0]), 30)
        self.assertEqual(len(result["sheets"][0]["rows"][0][0]), 500)
        self.assertEqual(source.read_bytes(), original)

    def test_csv_marks_extra_columns_even_when_cells_are_short(self):
        source = self.directory / "columns.csv"
        source.write_text(",".join(["value"] * 31), encoding="utf-8")
        self.assertTrue(extract(source)["truncated"])

    def test_sheet_row_clipping_is_explicit_without_spreadsheet_dependencies(self):
        row, clipped = preview_row((None, 123, "x" * 501))
        self.assertEqual(row, ["", "123", "x" * 500])
        self.assertTrue(clipped)
        self.assertEqual(preview_row((None, "x" * 500)), (["", "x" * 500], False))


if __name__ == "__main__":
    unittest.main()
