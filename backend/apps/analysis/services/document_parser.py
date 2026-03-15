import io
import re
from pathlib import Path


def extract_text_from_file(file_field):
    """Extract text content from a PDF, DOCX, or TXT file."""
    filename = file_field.name.lower()

    if filename.endswith(".pdf"):
        return _extract_pdf_text(file_field)
    elif filename.endswith(".docx"):
        return _extract_docx_text(file_field)
    elif filename.endswith(".txt"):
        file_field.open("rb")
        content = file_field.read().decode("utf-8", errors="replace")
        file_field.close()
        return content
    else:
        raise ValueError(f"Unsupported file type: {Path(filename).suffix}")


def _extract_pdf_text(file_field):
    import pymupdf

    file_field.open("rb")
    data = file_field.read()
    file_field.close()

    doc = pymupdf.open(stream=data, filetype="pdf")

    # First pass: try normal text extraction
    text_parts = []
    total_meaningful_chars = 0
    for page in doc:
        text = page.get_text()
        text_parts.append(text)
        # Count chars excluding whitespace, short lines, URLs, and page indicators
        for line in text.split("\n"):
            stripped = line.strip()
            if len(stripped) <= 20:
                continue
            # Skip browser chrome: URLs, page indicators, timestamps
            if re.search(r"https?://|\.com|\.aspx|\.pdf|\d+\s+of\s+\d+", stripped, re.IGNORECASE):
                continue
            total_meaningful_chars += len(stripped)

    # If normal extraction yields very little real content, use OCR
    avg_chars_per_page = total_meaningful_chars / max(len(doc), 1)
    if avg_chars_per_page < 300:
        text_parts = []
        for page in doc:
            tp = page.get_textpage_ocr(flags=0, full=True, dpi=300)
            text_parts.append(page.get_text("text", textpage=tp))

    doc.close()
    return "\n".join(text_parts)


def _extract_table_rows(table):
    """Extract rows from a table, recursing into nested tables in cells."""
    rows = []
    for row in table.rows:
        # Check if any cell contains a nested table
        has_nested = any(cell.tables for cell in row.cells)
        if has_nested:
            # Recurse into nested tables found in this row's cells
            for cell in row.cells:
                for nested_table in cell.tables:
                    rows.extend(_extract_table_rows(nested_table))
        else:
            # Deduplicate merged cells: adjacent cells with identical text
            seen = []
            for cell in row.cells:
                text = cell.text.strip().replace("\n", " ")
                if not seen or text != seen[-1]:
                    seen.append(text)
            row_text = " | ".join(seen)
            if row_text.strip(" |"):
                rows.append(row_text)
    return rows


def _extract_docx_text(file_field):
    from docx import Document as DocxDocument

    file_field.open("rb")
    data = file_field.read()
    file_field.close()

    doc = DocxDocument(io.BytesIO(data))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]

    for table in doc.tables:
        parts.extend(_extract_table_rows(table))

    return "\n".join(parts)
