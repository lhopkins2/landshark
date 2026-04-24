import io
import re
from pathlib import Path

IMAGE_DPI = 120
MAX_PAGES_REDUCED = 120


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

    text_parts = []
    total_meaningful_chars = 0
    for i, page in enumerate(doc):
        text = page.get_text()
        text_parts.append(f"--- Page {i + 1} ---\n{text}")
        for line in text.split("\n"):
            stripped = line.strip()
            if len(stripped) <= 20:
                continue
            # Skip browser chrome: URLs, page indicators, timestamps.
            if re.search(r"https?://|\.com|\.aspx|\.pdf|\d+\s+of\s+\d+", stripped, re.IGNORECASE):
                continue
            total_meaningful_chars += len(stripped)

    # No OCR fallback here — vision-based analysis handles scanned PDFs
    # directly via page images sent to the AI model.

    doc.close()
    return "\n".join(text_parts)


def render_pdf_pages(file_field, dpi=IMAGE_DPI, max_pages=None):
    """Render PDF pages as PNG images for vision-based analysis.

    Returns a list of (page_number, png_bytes) tuples and the total page count.
    page_number is 1-indexed.
    """
    import pymupdf

    file_field.open("rb")
    data = file_field.read()
    file_field.close()

    doc = pymupdf.open(stream=data, filetype="pdf")
    total_pages = len(doc)
    render_count = min(total_pages, max_pages) if max_pages else total_pages

    pages = []
    for i in range(render_count):
        page = doc[i]
        pixmap = page.get_pixmap(dpi=dpi)
        png_bytes = pixmap.tobytes("png")
        pages.append((i + 1, png_bytes))

    doc.close()
    return pages, total_pages


def is_pdf(file_field):
    """Check if a file is a PDF (eligible for vision-based analysis)."""
    return file_field.name.lower().endswith(".pdf")


def _extract_table_rows(table):
    """Extract rows from a table, recursing into nested tables in cells."""
    rows = []
    for row in table.rows:
        has_nested = any(cell.tables for cell in row.cells)
        if has_nested:
            for cell in row.cells:
                for nested_table in cell.tables:
                    rows.extend(_extract_table_rows(nested_table))
        else:
            # Deduplicate merged cells: adjacent cells with identical text.
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
