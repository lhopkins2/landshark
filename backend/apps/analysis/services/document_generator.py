import io
import re
from copy import deepcopy
from pathlib import Path

from docx import Document as DocxDocument
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from fpdf import FPDF
from fpdf.enums import TableBordersLayout
from fpdf.fonts import FontFace

_FONTS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "fonts"
_FONT_REGULAR = str(_FONTS_DIR / "DejaVuSans.ttf")
_FONT_BOLD = str(_FONTS_DIR / "DejaVuSans-Bold.ttf")


def generate_docx(text: str, title: str = "") -> io.BytesIO:
    doc = DocxDocument()

    if title:
        doc.add_heading(title, level=1)

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            doc.add_paragraph("")
            i += 1
            continue

        if stripped.startswith("### "):
            doc.add_heading(stripped[4:], level=3)
        elif stripped.startswith("## "):
            doc.add_heading(stripped[3:], level=2)
        elif stripped.startswith("# "):
            doc.add_heading(stripped[2:], level=1)
        elif _is_table_row(stripped):
            table_rows: list[list[str]] = []
            while i < len(lines):
                row_stripped = lines[i].strip()
                if _is_table_separator(row_stripped):
                    i += 1
                    continue
                if _is_table_row(row_stripped):
                    table_rows.append(_parse_table_row(row_stripped))
                    i += 1
                    continue
                break
            if table_rows:
                num_cols = len(table_rows[0])
                table = doc.add_table(rows=len(table_rows), cols=num_cols, style="Table Grid")
                for col_idx, header in enumerate(table_rows[0]):
                    if _is_page_col(header):
                        table.columns[col_idx].width = Inches(0.55)
                for row_idx, row_data in enumerate(table_rows):
                    for col_idx, cell_text in enumerate(row_data[:num_cols]):
                        cell = table.cell(row_idx, col_idx)
                        cell.text = cell_text
                        for paragraph in cell.paragraphs:
                            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                            for run in paragraph.runs:
                                run.font.size = Pt(9)
                    if row_idx == 0:
                        for col_idx in range(num_cols):
                            for run in table.cell(0, col_idx).paragraphs[0].runs:
                                run.bold = True
            continue
        else:
            doc.add_paragraph(stripped)

        i += 1

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


def _clean_cell_text(text: str) -> str:
    """Normalize whitespace in a table cell value.

    Collapses tabs, multiple spaces, and embedded newlines so cell content
    is always clean single-line text suitable for PDF/DOCX rendering.
    """
    text = re.sub(r"[\t\r\f\v]+", " ", text)   # tabs → space
    text = re.sub(r"\n+", " ", text)             # newlines → space
    text = re.sub(r" {2,}", " ", text)           # collapse runs of spaces
    return text.strip()


def _parse_table_row(line: str) -> list[str]:
    cells = line.strip().strip("|").split("|")
    return [_clean_cell_text(c) for c in cells]


def _is_table_row(line: str) -> bool:
    return line.startswith("|") and line.endswith("|")


def _is_table_separator(line: str) -> bool:
    return bool(re.match(r"^\|[-:| ]+\|$", line))


def _is_page_col(header: str) -> bool:
    """Return True if the header looks like a page-number column (Doc Pg, Page, Pg, etc.)."""
    norm = re.sub(r"[^a-z]", "", header.lower())
    return norm in ("docpg", "page", "pages", "pg")


def _compute_col_widths(headers: list[str], total_width: float) -> list[float]:
    """Compute column widths, giving page-number columns a narrow fixed width."""
    narrow = 18  # mm — just enough for "91-96"
    narrow_count = sum(1 for h in headers if _is_page_col(h))
    normal_count = len(headers) - narrow_count
    remaining = total_width - (narrow * narrow_count)
    normal_width = remaining / normal_count if normal_count else total_width / len(headers)
    return [narrow if _is_page_col(h) else normal_width for h in headers]


def _render_pdf_table(pdf: FPDF, rows: list[list[str]]) -> None:
    if not rows:
        return

    num_cols = len(rows[0])

    heading_style = FontFace(emphasis="BOLD", size_pt=8)
    pdf.set_font("DejaVu", "", 8)

    table_width = pdf.epw  # effective page width (minus margins)
    col_widths = _compute_col_widths(rows[0], table_width) if num_cols > 0 else None

    with pdf.table(
        borders_layout=TableBordersLayout.ALL,
        first_row_as_headings=True,
        headings_style=heading_style,
        line_height=5,
        align="LEFT",
        col_widths=col_widths,
    ) as table:
        for row_data in rows:
            row = table.row()
            padded = row_data[:num_cols] + [""] * max(0, num_cols - len(row_data))
            for cell_text in padded:
                row.cell(cell_text, align="LEFT")

    pdf.set_font("DejaVu", "", 10)


def generate_pdf(text: str, title: str = "") -> io.BytesIO:
    pdf = FPDF()
    pdf.add_font("DejaVu", "", _FONT_REGULAR)
    pdf.add_font("DejaVu", "B", _FONT_BOLD)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    if title:
        pdf.set_font("DejaVu", "B", 14)
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    pdf.set_font("DejaVu", "", 10)

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            pdf.ln(4)
            i += 1
            continue

        if stripped.startswith("### "):
            pdf.set_font("DejaVu", "B", 11)
            pdf.cell(0, 7, stripped[4:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("DejaVu", "", 10)
        elif stripped.startswith("## "):
            pdf.set_font("DejaVu", "B", 12)
            pdf.cell(0, 8, stripped[3:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("DejaVu", "", 10)
        elif stripped.startswith("# "):
            pdf.set_font("DejaVu", "B", 14)
            pdf.cell(0, 10, stripped[2:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("DejaVu", "", 10)
        elif _is_table_row(stripped):
            table_rows: list[list[str]] = []
            while i < len(lines):
                row_stripped = lines[i].strip()
                if _is_table_separator(row_stripped):
                    i += 1
                    continue
                if _is_table_row(row_stripped):
                    table_rows.append(_parse_table_row(row_stripped))
                    i += 1
                    continue
                break
            try:
                _render_pdf_table(pdf, table_rows)
            except Exception:
                for row_data in table_rows:
                    pdf.multi_cell(0, 5, " | ".join(row_data), new_x="LMARGIN", new_y="NEXT")
            continue
        else:
            pdf.multi_cell(0, 5, stripped, new_x="LMARGIN", new_y="NEXT")

        i += 1

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf


def generate_document(text: str, output_format: str, title: str = "") -> io.BytesIO:
    if output_format == "docx":
        return generate_docx(text, title)
    return generate_pdf(text, title)


def _extract_data_rows_from_ai_text(text: str) -> list[list[str]]:
    """Extract only data rows (not the header) from the AI's markdown table."""
    rows: list[list[str]] = []
    found_header = False
    for line in text.split("\n"):
        stripped = line.strip()
        if not _is_table_row(stripped):
            continue
        if _is_table_separator(stripped):
            continue
        if not found_header:
            found_header = True  # skip the AI's header row — template already has it
            continue
        rows.append(_parse_table_row(stripped))
    return rows


def _collect_all_tables(doc: DocxDocument):
    """Recursively collect all tables in the document, including nested ones."""
    tables = []

    def _recurse(element):
        for table in getattr(element, "tables", []):
            tables.append(table)
            for row in table.rows:
                for cell in row.cells:
                    _recurse(cell)

    _recurse(doc)
    return tables


def _find_data_table(doc: DocxDocument):
    """Find the main data table in the template.

    Searches all tables (including nested ones inside cells) and returns the
    one whose "column header row" has the most unique non-empty cells — that
    is the actual data table, not a wrapper or header-fields table.
    """
    all_tables = _collect_all_tables(doc)
    if not all_tables:
        return None

    best_table = None
    best_score = 0
    for table in all_tables:
        for row in table.rows:
            unique = {c.text.strip() for c in row.cells if c.text.strip()}
            if len(unique) > best_score:
                best_score = len(unique)
                best_table = table

    return best_table


def _find_column_header_row(table) -> int:
    """Find the row that serves as the column header for data rows.

    This is the row with the most unique non-empty cell values — it contains
    headings like 'Document Caption', 'Grantor', 'Grantee', etc.
    Returns the row index (0-based).
    """
    best_idx = 0
    best_count = 0
    for i, row in enumerate(table.rows):
        unique = {c.text.strip() for c in row.cells if c.text.strip()}
        if len(unique) > best_count:
            best_count = len(unique)
            best_idx = i
    return best_idx


def _get_template_row(table, header_row_idx: int) -> int:
    """Return the index of the row to use as a formatting template.

    Prefers a data row after the column header. Falls back to the header row.
    """
    if len(table.rows) > header_row_idx + 1:
        return len(table.rows) - 1  # last row — usually a blank data row
    return header_row_idx


def _set_cell_text_preserving_format(tc_elem, text: str):
    """Replace all text in a <w:tc> element while keeping paragraph/run formatting."""
    paragraphs = tc_elem.findall(qn("w:p"))
    if not paragraphs:
        return

    p = paragraphs[0]

    for extra_p in paragraphs[1:]:
        tc_elem.remove(extra_p)

    # Preserve run-level formatting (font, size, etc.) from the first existing run.
    existing_runs = p.findall(qn("w:r"))
    run_props_copy = None
    if existing_runs:
        existing_run_props = existing_runs[0].find(qn("w:rPr"))
        if existing_run_props is not None:
            run_props_copy = deepcopy(existing_run_props)

    for run in existing_runs:
        p.remove(run)

    from lxml import etree

    r = etree.SubElement(p, qn("w:r"))
    if run_props_copy is not None:
        r.insert(0, run_props_copy)
    t = etree.SubElement(r, qn("w:t"))
    t.text = text
    t.set(qn("xml:space"), "preserve")


def _extract_header_fields_from_ai_text(text: str) -> dict[str, str]:
    """Extract key: value header fields that appear before the markdown table.

    Looks for lines like 'TAX ID #: 12345' or 'RECORD OWNER: Jane Doe'.
    """
    fields: dict[str, str] = {}
    for line in text.split("\n"):
        stripped = line.strip()
        if _is_table_row(stripped) or _is_table_separator(stripped):
            break  # stop once we hit the table
        if stripped.startswith("#"):
            continue  # skip markdown headings
        if ":" in stripped:
            key, _, value = stripped.partition(":")
            key = key.strip()
            value = value.strip()
            if key and value:
                fields[key] = value
    return fields


def _fill_header_fields_in_doc(doc: DocxDocument, fields: dict[str, str]):
    """Search the template for header field labels and fill in their values.

    Handles two common patterns:
    1. Paragraph text containing "LABEL:" followed by blanks / underscores.
    2. Table cells where one cell has the label and the adjacent cell is empty.
    """
    if not fields:
        return

    normalised = {k.upper().strip().rstrip(":"): v for k, v in fields.items()}

    # Pattern 1: paragraphs matching "LABEL:___" or "LABEL:   "
    for para in doc.paragraphs:
        for key, value in normalised.items():
            pattern = re.compile(
                re.escape(key) + r"\s*:\s*[_\s]*$",
                re.IGNORECASE,
            )
            if pattern.search(para.text):
                para.text = re.sub(
                    re.escape(key) + r"(\s*:\s*)[_\s]*$",
                    key + r"\1" + value,
                    para.text,
                    flags=re.IGNORECASE,
                )

    # Pattern 2: table cells — label cell followed by empty value cell (including nested tables).
    all_tables = _collect_all_tables(doc)
    for table in all_tables:
        for row in table.rows:
            cells = row.cells
            for i, cell in enumerate(cells):
                cell_text = cell.text.strip().rstrip(":").upper()
                if cell_text in normalised and i + 1 < len(cells):
                    next_cell = cells[i + 1]
                    # Only fill cells that are blank or underscore placeholders.
                    if not next_cell.text.strip() or next_cell.text.strip("_ ") == "":
                        next_cell.text = normalised[cell_text]


def generate_from_docx_template(template_file_field, ai_text: str) -> io.BytesIO:
    """Clone the original DOCX template and inject AI data rows into its table.

    Preserves all images, formatting, headers, and layout from the template.
    Only adds new data rows to the existing table structure.
    """
    template_file_field.open("rb")
    data = template_file_field.read()
    template_file_field.close()

    doc = DocxDocument(io.BytesIO(data))

    data_rows = _extract_data_rows_from_ai_text(ai_text)

    header_fields = _extract_header_fields_from_ai_text(ai_text)
    _fill_header_fields_in_doc(doc, header_fields)

    if not data_rows:
        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf

    target_table = _find_data_table(doc)
    if not target_table:
        # Fall back to from-scratch generation when the template has no table.
        return generate_docx(ai_text)

    # Everything at and before the column header row is preserved; rows after
    # it are treated as placeholder data rows and replaced.
    col_header_idx = _find_column_header_row(target_table)

    tmpl_row_idx = _get_template_row(target_table, col_header_idx)
    template_tr = deepcopy(target_table.rows[tmpl_row_idx]._tr)

    trs_to_remove = []
    for i in range(col_header_idx + 1, len(target_table.rows)):
        trs_to_remove.append(target_table.rows[i]._tr)
    for tr in trs_to_remove:
        target_table._tbl.remove(tr)

    for row_data in data_rows:
        new_tr = deepcopy(template_tr)
        cells = new_tr.findall(qn("w:tc"))
        for i, tc in enumerate(cells):
            if i < len(row_data):
                _set_cell_text_preserving_format(tc, row_data[i])
            else:
                _set_cell_text_preserving_format(tc, "")
        target_table._tbl.append(new_tr)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
