"""Export the project handoff Markdown to a macro-free Word document.

Uses Python's standard library only. Supports headings, lists, tables, links
as readable text, and fenced code blocks. Does not alter the application.
"""

import argparse
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def readable(text):
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)
    return text.replace("**", "").replace("`", "")


def paragraph(text="", style="Normal", code=False):
    properties = f'<w:pStyle w:val="{style}"/>'
    if code:
        properties += (
            '<w:shd w:fill="F1F5F1"/><w:spacing w:after="0" w:line="240" '
            'w:lineRule="auto"/><w:ind w:left="120" w:right="120"/>'
        )
    return (
        f"<w:p><w:pPr>{properties}</w:pPr><w:r>"
        f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    )


def table(rows):
    columns = max(len(row) for row in rows)
    width = 9360 // columns
    grid = "".join(f'<w:gridCol w:w="{width}"/>' for _ in range(columns))
    parts = [
        '<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/>'
        '<w:tblLayout w:type="fixed"/><w:tblBorders>'
        '<w:top w:val="single" w:sz="4" w:color="D9E4D9"/>'
        '<w:left w:val="single" w:sz="4" w:color="D9E4D9"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="D9E4D9"/>'
        '<w:right w:val="single" w:sz="4" w:color="D9E4D9"/>'
        '<w:insideH w:val="single" w:sz="4" w:color="D9E4D9"/>'
        '<w:insideV w:val="single" w:sz="4" w:color="D9E4D9"/>'
        '</w:tblBorders><w:tblCellMar>'
        '<w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
        '<w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/>'
        f"</w:tblCellMar></w:tblPr><w:tblGrid>{grid}</w:tblGrid>"
    ]
    for index, row in enumerate(rows):
        properties = "<w:tblHeader/>" if index == 0 else ""
        parts.append(f"<w:tr><w:trPr>{properties}</w:trPr>")
        for cell in row:
            shading = '<w:shd w:fill="E8F2E6"/>' if index == 0 else ""
            parts.append(
                f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>'
                f"{shading}</w:tcPr>"
                f'{paragraph(readable(cell), "TableHeader" if index == 0 else "TableText")}'
                "</w:tc>"
            )
        parts.append("</w:tr>")
    parts.append("</w:tbl>")
    return "".join(parts)


def markdown_body(source):
    lines = source.splitlines()
    parts = []
    index = 0
    in_code = False
    while index < len(lines):
        line = lines[index]
        if line.startswith("```"):
            in_code = not in_code
            if not in_code:
                parts.append(paragraph("", "CodeSpacer"))
            index += 1
            continue
        if in_code:
            parts.append(paragraph(line, "Code", code=True))
        elif line.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].startswith("|"):
                cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", cell) for cell in cells):
                    rows.append(cells)
                index += 1
            parts.append(table(rows))
            continue
        elif line.strip():
            heading = re.match(r"^(#{1,6})\s+(.*)", line)
            if heading:
                level = len(heading.group(1))
                style = "Title" if level == 1 else f"Heading{min(level - 1, 3)}"
                parts.append(paragraph(readable(heading.group(2)), style))
            elif line.startswith("- "):
                parts.append(paragraph("• " + readable(line[2:]), "ListText"))
            elif re.match(r"^\d+\.\s", line):
                parts.append(paragraph(readable(line), "ListText"))
            else:
                parts.append(paragraph(readable(line)))
        index += 1
    if in_code:
        raise ValueError("Unclosed fenced code block")
    return "".join(parts)


STYLES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W}">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      <w:sz w:val="22"/><w:color w:val="173B29"/><w:lang w:val="es-EC"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/>
      <w:widowControl/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:spacing w:before="120" w:after="320"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="002D1B"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="0"/>
      <w:spacing w:before="340" w:after="180"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="087D16"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="1"/>
      <w:spacing w:before="240" w:after="140"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="002D1B"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>
    <w:basedOn w:val="Heading2"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListText"><w:name w:val="List Text"/>
    <w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="240" w:hanging="180"/>
      <w:spacing w:after="100"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/>
    <w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
      <w:sz w:val="17"/><w:color w:val="173B29"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CodeSpacer"><w:name w:val="Code Spacer"/>
    <w:pPr><w:spacing w:after="60" w:line="80" w:lineRule="exact"/></w:pPr>
    <w:rPr><w:sz w:val="4"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/>
    <w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr>
    <w:rPr><w:sz w:val="20"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/>
    <w:basedOn w:val="TableText"/><w:rPr><w:b/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Header"><w:name w:val="Header"/>
    <w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr>
    <w:rPr><w:sz w:val="18"/><w:color w:val="526158"/></w:rPr>
  </w:style>
</w:styles>"""


def export(source, destination, overwrite=False):
    text = source.read_text(encoding="utf-8")
    body = markdown_body(text)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W}" xmlns:r="{R}"><w:body>{body}'
        '<w:sectPr><w:headerReference w:type="default" r:id="rId2"/>'
        '<w:footerReference w:type="default" r:id="rId3"/>'
        '<w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="1134" w:right="1273" w:bottom="1134" w:left="1273" '
        'w:header="567" w:footer="567" w:gutter="0"/>'
        '</w:sectPr></w:body></w:document>'
    )
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>"""
    root_rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>"""
    document_rels = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>"""
    header = (
        f'<w:hdr xmlns:w="{W}">'
        f'{paragraph("CacaoSmart IoT  |  Entrega a Bryan  |  24/11/2026", "Header")}'
        "</w:hdr>"
    )
    footer = (
        f'<w:ftr xmlns:w="{W}"><w:p><w:pPr><w:pStyle w:val="Header"/>'
        '<w:jc w:val="right"/></w:pPr><w:r><w:t>Página </w:t></w:r>'
        '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>'
        "</w:p></w:ftr>"
    )
    core = """<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/">
 <dc:title>CacaoSmart IoT — Avance y traspaso a Bryan</dc:title>
 <dc:subject>Estado, pruebas iniciales, continuidad y entrega Git</dc:subject>
 <dc:creator>Proyecto CacaoSmart IoT</dc:creator>
 <dc:description>Guía de revisión local; no acredita preparación para producción.</dc:description>
</cp:coreProperties>"""
    parts = {
        "[Content_Types].xml": content_types,
        "_rels/.rels": root_rels,
        "docProps/core.xml": core,
        "word/document.xml": document,
        "word/styles.xml": STYLES,
        "word/_rels/document.xml.rels": document_rels,
        "word/header1.xml": header,
        "word/footer1.xml": footer,
    }
    for name, xml in parts.items():
        try:
            ET.fromstring(xml)
        except ET.ParseError as error:
            raise ValueError(f"Invalid XML part: {name}") from error
    if destination.exists() and not overwrite:
        raise FileExistsError(f"Refusing to overwrite existing document: {destination}")
    with ZipFile(destination, "w" if overwrite else "x", compression=ZIP_DEFLATED) as package:
        for name, xml in parts.items():
            package.writestr(name, xml.encode("utf-8"))
    with ZipFile(destination) as package:
        if package.testzip():
            raise ValueError("Invalid Word package")
    print(f"Created: {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Handoff Markdown file")
    parser.add_argument("destination", type=Path, help="New .docx output path")
    parser.add_argument("--overwrite", action="store_true", help="Replace a previously generated .docx")
    args = parser.parse_args()
    if args.destination.suffix.lower() != ".docx":
        parser.error("Destination must have .docx extension")
    export(args.source, args.destination, args.overwrite)
