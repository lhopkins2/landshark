"""Bootstrap a docxtpl-ready COT template from a customer's plain DOCX.

Internal tooling. A customer sends their plain COT form (labels + empty
instrument table, no template syntax); run this once to inject the
placeholders, then hand-refine the output and upload it as their org template.

Usage:
    python manage.py prepare_template input.docx output.docx
"""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.analysis.services.template_intake import (
    TemplatePreparationError,
    prepare_uploaded_template,
)


class Command(BaseCommand):
    help = "Inject docxtpl placeholders into a plain COT template (.docx)."

    def add_arguments(self, parser):
        parser.add_argument("input", help="Path to the customer's plain .docx template")
        parser.add_argument("output", help="Path to write the placeholdered .docx")

    def handle(self, *args, **options):
        in_path = Path(options["input"])
        out_path = Path(options["output"])

        if not in_path.exists():
            raise CommandError(f"Input file not found: {in_path}")

        raw = in_path.read_bytes()
        try:
            prepared = prepare_uploaded_template(raw)
        except TemplatePreparationError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError(f"Could not process this DOCX: {exc}") from exc

        out_path.write_bytes(prepared)
        self.stdout.write(
            self.style.SUCCESS(
                f"Wrote {out_path} ({len(prepared)} bytes). "
                "Review/refine in Word, then upload via Settings → COT Templates."
            )
        )
