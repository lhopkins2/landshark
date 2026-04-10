"""Background tasks for COT analysis, executed by Django-Q2."""

import logging
import os

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import connections

from apps.documents.models import Document

from .models import COTAnalysis
from .services.ai_providers import build_prompt_content, run_analysis
from .services.document_generator import generate_document
from .services.document_parser import MAX_PAGES_REDUCED, extract_text_from_file, is_pdf, render_pdf_pages

logger = logging.getLogger(__name__)


class _AnalysisCancelledError(Exception):
    """Sentinel raised when a background analysis detects cancellation."""


def _check_cancelled(analysis_id):
    """Re-read status from DB; raise if the user cancelled."""
    fresh = COTAnalysis.objects.filter(id=analysis_id).values_list("status", flat=True).first()
    if fresh == COTAnalysis.Status.CANCELLED:
        raise _AnalysisCancelledError()


def run_analysis_task(
    analysis_id,
    document_id,
    analysis_order,
    output_format,
    provider,
    api_key,
    model,
    user_id,
    custom_request="",
    legal_description="",
):
    """Run the full analysis pipeline. Called by Django-Q2 async_task."""
    user_model = get_user_model()

    try:
        analysis = COTAnalysis.objects.get(id=analysis_id)
        document = Document.objects.get(id=document_id)
        user = user_model.objects.get(id=user_id)

        # Step 1: Prepare document content
        analysis.progress_step = COTAnalysis.ProgressStep.EXTRACTING_TEXT
        analysis.save(update_fields=["progress_step", "updated_at"])

        page_images = []
        document_text = ""
        total_pages = 0

        if is_pdf(document.file):
            page_images, total_pages = render_pdf_pages(document.file, max_pages=MAX_PAGES_REDUCED)
            document_text = extract_text_from_file(document.file)
        else:
            document_text = extract_text_from_file(document.file)

        _check_cancelled(analysis_id)

        # Step 2: Build structured content
        analysis.progress_step = COTAnalysis.ProgressStep.BUILDING_PROMPT
        analysis.save(update_fields=["progress_step", "updated_at"])

        content_blocks = build_prompt_content(
            page_images=page_images,
            document_text=document_text,
            analysis_order=analysis_order,
            custom_request=custom_request,
            legal_description=legal_description,
            total_pages=total_pages,
        )

        prompt_text_parts = [b["text"] for b in content_blocks if b.get("type") == "text"]
        image_count = sum(1 for b in content_blocks if b.get("type") == "image")
        block_count = len(content_blocks)
        debug_header = f"[DEBUG: {block_count} content blocks, {image_count} images, {total_pages} total pages]\n\n"
        analysis.prompt_text = debug_header + "\n\n".join(prompt_text_parts)
        analysis.save(update_fields=["prompt_text", "updated_at"])

        _check_cancelled(analysis_id)

        # Step 3: Call AI
        analysis.progress_step = COTAnalysis.ProgressStep.CALLING_AI
        analysis.save(update_fields=["progress_step", "updated_at"])

        result, usage = run_analysis(content_blocks, provider, api_key, model)
        analysis.result_text = result
        analysis.input_tokens = usage.get("input_tokens", 0)
        analysis.output_tokens = usage.get("output_tokens", 0)
        analysis.save(update_fields=["result_text", "input_tokens", "output_tokens", "updated_at"])

        _check_cancelled(analysis_id)

        # Step 4: Generate document
        analysis.progress_step = COTAnalysis.ProgressStep.GENERATING_DOCUMENT
        analysis.save(update_fields=["progress_step", "updated_at"])

        base_name = os.path.splitext(document.original_filename)[0]
        ext = "docx" if output_format == "docx" else "pdf"
        mime = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            if output_format == "docx"
            else "application/pdf"
        )

        doc_title = f"{base_name} - Analyzed"
        generated_filename = f"{doc_title}.{ext}"
        version = 1
        while Document.objects.filter(original_filename=generated_filename).exists():
            version += 1
            doc_title = f"{base_name} - Analyzed - v{version}"
            generated_filename = f"{doc_title}.{ext}"

        buf = generate_document(result, output_format, title=doc_title)
        generated_doc = Document.objects.create(
            original_filename=generated_filename,
            file_size=buf.getbuffer().nbytes,
            mime_type=mime,
            tract_number=document.tract_number,
            last_record_holder=document.last_record_holder,
            description=f"Processed from {document.original_filename}",
            uploaded_by=user,
            folder=document.folder,
            chain_of_title=document.chain_of_title,
        )
        generated_doc.file.save(generated_filename, ContentFile(buf.read()), save=True)

        _check_cancelled(analysis_id)

        # Step 5: Complete — use update_fields to avoid overwriting a concurrent cancel
        analysis.generated_document = generated_doc
        analysis.status = COTAnalysis.Status.COMPLETED
        analysis.progress_step = COTAnalysis.ProgressStep.COMPLETE
        analysis.save(update_fields=["generated_document", "status", "progress_step", "updated_at"])

    except _AnalysisCancelledError:
        pass

    except Exception as e:
        logger.exception("Analysis %s failed", analysis_id)
        try:
            analysis = COTAnalysis.objects.get(id=analysis_id)
            analysis.error_message = str(e)
            analysis.status = COTAnalysis.Status.FAILED
            analysis.progress_step = COTAnalysis.ProgressStep.FAILED
            analysis.save()
        except Exception:
            logger.exception("Failed to save error state for analysis %s", analysis_id)

    finally:
        connections.close_all()
