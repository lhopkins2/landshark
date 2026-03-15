import io
import re
from copy import deepcopy

from docx import Document as DocxDocument
from docx.oxml.ns import qn
from docx.shared import Pt
from fpdf import FPDF
from fpdf.enums import TableBordersLayout
from fpdf.fonts import FontFace


def generate_docx(text: str, title: str = "") -> io.BytesIO:
    """Generate a DOCX file from analysis result text."""
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
            # Collect all consecutive table rows
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
            # Render as a proper Word table
            if table_rows:
                num_cols = len(table_rows[0])
                table = doc.add_table(rows=len(table_rows), cols=num_cols, style="Table Grid")
                for row_idx, row_data in enumerate(table_rows):
                    for col_idx, cell_text in enumerate(row_data[:num_cols]):
                        cell = table.cell(row_idx, col_idx)
                        cell.text = cell_text
                        for paragraph in cell.paragraphs:
                            paragraph.style.font.size = Pt(9)
                    # Bold the header row
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


def _parse_table_row(line: str) -> list[str]:
    """Parse a markdown table row into cell values."""
    cells = line.strip().strip("|").split("|")
    return [c.strip() for c in cells]


def _is_table_row(line: str) -> bool:
    return line.startswith("|") and line.endswith("|")


def _is_table_separator(line: str) -> bool:
    return bool(re.match(r"^\|[-:| ]+\|$", line))


def _render_pdf_table(pdf: FPDF, rows: list[list[str]]) -> None:
    """Render collected markdown table rows as a proper fpdf2 table."""
    if not rows:
        return

    num_cols = len(rows[0])

    # Switch to landscape if too many columns for portrait
    if num_cols > 7:
        pdf.add_page(orientation="L")

    heading_style = FontFace(emphasis="BOLD", size_pt=8)
    pdf.set_font("Helvetica", "", 8)

    with pdf.table(
        borders_layout=TableBordersLayout.ALL,
        first_row_as_headings=True,
        headings_style=heading_style,
        line_height=5,
    ) as table:
        for row_data in rows:
            row = table.row()
            # Pad or truncate to match header column count
            padded = row_data[:num_cols] + [""] * max(0, num_cols - len(row_data))
            for cell_text in padded:
                row.cell(cell_text)

    pdf.set_font("Helvetica", "", 10)


def generate_pdf(text: str, title: str = "") -> io.BytesIO:
    """Generate a PDF file from analysis result text."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    if title:
        pdf.set_font("Helvetica", "B", 14)
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    pdf.set_font("Helvetica", "", 10)

    lines = text.split("\n")
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped:
            pdf.ln(4)
            i += 1
            continue

        if stripped.startswith("### "):
            pdf.set_font("Helvetica", "B", 11)
            pdf.cell(0, 7, stripped[4:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10)
        elif stripped.startswith("## "):
            pdf.set_font("Helvetica", "B", 12)
            pdf.cell(0, 8, stripped[3:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10)
        elif stripped.startswith("# "):
            pdf.set_font("Helvetica", "B", 14)
            pdf.cell(0, 10, stripped[2:], new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("Helvetica", "", 10)
        elif _is_table_row(stripped):
            # Collect all consecutive table rows
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
                # Fallback: render table rows as plain text if table rendering fails
                for row_data in table_rows:
                    pdf.multi_cell(0, 5, " | ".join(row_data), new_x="LMARGIN", new_y="NEXT")
            continue  # skip the i += 1 at the bottom
        else:
            pdf.multi_cell(0, 5, stripped, new_x="LMARGIN", new_y="NEXT")

        i += 1

    buf = io.BytesIO()
    pdf.output(buf)
    buf.seek(0)
    return buf


def generate_document(text: str, output_format: str, title: str = "") -> io.BytesIO:
    """Generate a document in the specified format."""
    if output_format == "docx":
        return generate_docx(text, title)
    return generate_pdf(text, title)


# ---------------------------------------------------------------------------
# Template-based DOCX generation: clones the original template and injects
# only the AI-generated data rows into the existing table structure.
# ---------------------------------------------------------------------------


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


def _find_data_table(doc: DocxDocument):
    """Find the main data table in the template (the one with the most columns)."""
    if not doc.tables:
        return None
    return max(doc.tables, key=lambda t: len(t.columns) if t.rows else 0)


def _get_template_row(table) -> int:
    """Return the index of the row to use as a formatting template.

    Prefers the first data row (index 1+). Falls back to the header row (0).
    """
    if len(table.rows) > 1:
        return len(table.rows) - 1  # last row — usually a blank data row
    return 0


def _set_cell_text_preserving_format(tc_elem, text: str):
    """Replace all text in a <w:tc> element while keeping paragraph/run formatting."""
    paragraphs = tc_elem.findall(qn("w:p"))
    if not paragraphs:
        return

    p = paragraphs[0]

    # Remove extra paragraphs (keep only the first)
    for extra_p in paragraphs[1:]:
        tc_elem.remove(extra_p)

    # Grab run-level properties from the first existing run (font, size, etc.)
    existing_runs = p.findall(qn("w:r"))
    run_props_copy = None
    if existing_runs:
        existing_run_props = existing_runs[0].find(qn("w:rPr"))
        if existing_run_props is not None:
            run_props_copy = deepcopy(existing_run_props)

    # Clear all runs
    for run in existing_runs:
        p.remove(run)

    # Build a new run with the preserved formatting
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

    # Normalise keys for fuzzy matching
    normalised = {k.upper().strip().rstrip(":"): v for k, v in fields.items()}

    # Pattern 1: paragraphs
    for para in doc.paragraphs:
        for key, value in normalised.items():
            # e.g. "TAX ID #:___" or "TAX ID #:   "
            pattern = re.compile(
                re.escape(key) + r"\s*:\s*[_\s]*$",
                re.IGNORECASE,
            )
            if pattern.search(para.text):
                # Replace underscores/blanks after the colon with the value
                para.text = re.sub(
                    re.escape(key) + r"(\s*:\s*)[_\s]*$",
                    key + r"\1" + value,
                    para.text,
                    flags=re.IGNORECASE,
                )

    # Pattern 2: table cells (label cell followed by empty value cell)
    for table in doc.tables:
        for row in table.rows:
            cells = row.cells
            for i, cell in enumerate(cells):
                cell_text = cell.text.strip().rstrip(":").upper()
                if cell_text in normalised and i + 1 < len(cells):
                    next_cell = cells[i + 1]
                    # Only fill if the value cell is blank or underscores
                    if not next_cell.text.strip() or next_cell.text.strip("_ ") == "":
                        next_cell.text = normalised[cell_text]


def generate_from_docx_template(template_file_field, ai_text: str) -> io.BytesIO:
    """Clone the original DOCX template and inject AI data rows into its table.

    Preserves all images, formatting, headers, and layout from the template.
    Only adds new data rows to the existing table structure.
    """
    # Read the template file
    template_file_field.open("rb")
    data = template_file_field.read()
    template_file_field.close()

    doc = DocxDocument(io.BytesIO(data))

    # Parse AI data rows from markdown output
    data_rows = _extract_data_rows_from_ai_text(ai_text)

    # Try to fill header fields (TAX ID #, TRACT #, etc.)
    header_fields = _extract_header_fields_from_ai_text(ai_text)
    _fill_header_fields_in_doc(doc, header_fields)

    if not data_rows:
        # No table data — return the template with header fields filled
        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf

    target_table = _find_data_table(doc)
    if not target_table:
        # No table in template — fall back to from-scratch generation
        return generate_docx(ai_text)

    # Identify the template row (the row we'll clone for formatting)
    tmpl_row_idx = _get_template_row(target_table)
    template_tr = deepcopy(target_table.rows[tmpl_row_idx]._tr)

    # Remove all data rows (everything after the header row).
    # The header row is row 0; data/placeholder rows are row 1+.
    trs_to_remove = []
    for i in range(1, len(target_table.rows)):
        trs_to_remove.append(target_table.rows[i]._tr)
    for tr in trs_to_remove:
        target_table._tbl.remove(tr)

    # Insert each AI data row by cloning the template row
    for row_data in data_rows:
        new_tr = deepcopy(template_tr)
        cells = new_tr.findall(qn("w:tc"))
        for i, tc in enumerate(cells):
            if i < len(row_data):
                _set_cell_text_preserving_format(tc, row_data[i])
            else:
                _set_cell_text_preserving_format(tc, "")
        # If AI has more columns than the template, ignore extras
        target_table._tbl.append(new_tr)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf
