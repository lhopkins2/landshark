"""Background tasks for COT analysis, executed by Django-Q2."""

import logging
import os
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import connections

from apps.documents.models import Document

from .models import COTAnalysis
from .services.document_generator import generate_document
from .services.pipeline import PipelineResult, run_pipeline

if TYPE_CHECKING:
    from apps.accounts.models import User

logger = logging.getLogger(__name__)


class _AnalysisCancelledError(Exception):
    """Sentinel raised when a background analysis detects cancellation."""


def _check_cancelled(analysis_id: str) -> None:
    """Re-read status from DB; raise _AnalysisCancelledError if the user cancelled."""
    fresh = COTAnalysis.objects.filter(id=analysis_id).values_list("status", flat=True).first()
    if fresh == COTAnalysis.Status.CANCELLED:
        raise _AnalysisCancelledError()


def _resolve_title_agent_name(user: "User") -> str:
    """Best-effort display name for the TITLE AGENT header line.

    Prefers `User.get_full_name()`, falls back to email when first/last are blank.
    """
    full = (user.get_full_name() or "").strip()
    return full or (user.email or "")


def _output_format_meta(output_format: str) -> tuple[str, str]:
    """Map output_format to (extension, mime_type)."""
    if output_format == "docx":
        return (
            "docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    return ("pdf", "application/pdf")


def _build_unique_generated_filename(
    document: Document, output_format: str
) -> tuple[str, str, str, str]:
    """Return (doc_title, generated_filename, ext, mime), suffixing -v2/-v3 until unique within the chain."""
    ext, mime = _output_format_meta(output_format)
    base_name = os.path.splitext(document.original_filename)[0]
    doc_title = f"{base_name} - Analyzed"
    generated_filename = f"{doc_title}.{ext}"
    scope_qs = Document.objects.filter(chain_of_title=document.chain_of_title)
    version = 1
    while scope_qs.filter(original_filename=generated_filename).exists():
        version += 1
        doc_title = f"{base_name} - Analyzed - v{version}"
        generated_filename = f"{doc_title}.{ext}"
    return doc_title, generated_filename, ext, mime


def _save_pipeline_result_to_analysis(analysis: COTAnalysis, result: PipelineResult) -> str:
    """Persist all pipeline-result fields onto the analysis row. Returns the rendered markdown.

    Single writer shared by `_run_new_pipeline` and `reanalyze_task`.
    """
    full_markdown = result.get("result_text") or result.get("narrative", "")
    usage = result.get("usage", {}) or {}
    analysis.pipeline_version = result.get("pipeline_version", "v1")
    analysis.parsed_documents = result.get("parsed_documents")
    analysis.chain_events = result.get("chain_events")
    analysis.narrative = result.get("narrative", "")
    analysis.notes = result.get("notes")
    analysis.failed_pages_count = result.get("failed_pages_count", 0)
    analysis.header_extracted = result.get("header_extracted") or {}
    analysis.input_tokens = usage.get("input_tokens", 0)
    analysis.output_tokens = usage.get("output_tokens", 0)
    analysis.result_text = full_markdown
    analysis.prompt_text = _build_pipeline_prompt_log(result)
    analysis.save(update_fields=[
        "pipeline_version",
        "parsed_documents",
        "chain_events",
        "narrative",
        "notes",
        "failed_pages_count",
        "header_extracted",
        "input_tokens",
        "output_tokens",
        "result_text",
        "prompt_text",
        "updated_at",
    ])
    return full_markdown


def _mark_failed(analysis: COTAnalysis, error_message: str) -> None:
    """Move the analysis into the FAILED terminal state."""
    analysis.error_message = error_message
    analysis.status = COTAnalysis.Status.FAILED
    analysis.progress_step = COTAnalysis.ProgressStep.FAILED
    analysis.save(update_fields=["error_message", "status", "progress_step", "updated_at"])


def _build_pipeline_prompt_log(result: PipelineResult) -> str:
    """Build the Troubleshooting-tab prompt log.

    Includes Stage 1 + Stage 2 system prompts plus counts of instruments, pages,
    and tokens so a debugger can reconstruct what the model saw without dumping every image.
    """
    from pathlib import Path

    from django.conf import settings as dj_settings

    prompts_dir = Path(dj_settings.BASE_DIR) / "prompts"
    stage1 = (prompts_dir / "stage1_extract_instruments.txt").read_text(encoding="utf-8")
    stage2 = (prompts_dir / "stage2_resolve_chain.txt").read_text(encoding="utf-8")

    usage = result.get("usage", {}) or {}
    parsed = result.get("parsed_documents") or []
    total_pages = sum(pd.get("total_pages", 0) for pd in parsed)
    total_instruments = sum(len(pd.get("instruments", [])) for pd in parsed)
    chain_events_block = result.get("chain_events") or {}
    events = (
        chain_events_block.get("events") if isinstance(chain_events_block, dict) else chain_events_block
    ) or []
    open_questions = (
        chain_events_block.get("open_questions") if isinstance(chain_events_block, dict) else []
    ) or []

    summary = (
        "[Pipeline v1]\n"
        f"Pages rendered: {total_pages}\n"
        f"Instruments parsed: {total_instruments}\n"
        f"Chain events: {len(events)}\n"
        f"Open questions: {len(open_questions)}\n"
        f"Input tokens (total): {usage.get('input_tokens', 0)}\n"
        f"Output tokens (total): {usage.get('output_tokens', 0)}\n"
    )

    return (
        summary
        + "\n=== STAGE 1 PROMPT (per-document JSON extraction; pages sent as images) ===\n\n"
        + stage1
        + "\n\n=== STAGE 2 PROMPT (chain resolution + narrative; structured input only) ===\n\n"
        + stage2
    )


def run_analysis_task(
    analysis_id: str,
    document_id: str,
    analysis_order: str,
    output_format: str,
    provider: str,
    api_key: str,
    model: str,
    user_id: str,
    legal_description: str = "",
) -> None:
    """Run the full analysis pipeline. Called by Django-Q2 async_task."""
    user_model = get_user_model()

    try:
        analysis = COTAnalysis.objects.get(id=analysis_id)
        document = Document.objects.get(id=document_id)
        user = user_model.objects.get(id=user_id)

        # Django-Q2 may retry up to max_attempts; bail if already terminal.
        if analysis.status == COTAnalysis.Status.COMPLETED:
            return
        if analysis.status == COTAnalysis.Status.CANCELLED:
            return

        if analysis.status == COTAnalysis.Status.FAILED:
            analysis.status = COTAnalysis.Status.PROCESSING
            analysis.error_message = ""
            analysis.save(update_fields=["status", "error_message", "updated_at"])

        _run_new_pipeline(
            analysis=analysis,
            document=document,
            user=user,
            provider=provider,
            api_key=api_key,
            model=model,
            output_format=output_format,
            legal_description=legal_description,
            analysis_order=analysis_order,
        )

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


def _run_new_pipeline(
    analysis: COTAnalysis,
    document: Document,
    user: "User",
    provider: str,
    api_key: str,
    model: str,
    output_format: str,
    legal_description: str,
    analysis_order: str,
) -> None:
    """Run the two-stage structured pipeline and persist its output.

    Stage 1 + Stage 2 results land on COTAnalysis (parsed_documents, chain_events,
    narrative, notes, failed_pages_count); a PDF/DOCX is rendered for download.
    """
    analysis.progress_step = COTAnalysis.ProgressStep.EXTRACTING_TEXT
    analysis.save(update_fields=["progress_step", "updated_at"])

    _check_cancelled(analysis.id)

    result = run_pipeline(
        document=document,
        provider=provider,
        api_key=api_key,
        model=model,
        legal_description=legal_description,
        analysis_order=analysis_order,
        title_agent_name=_resolve_title_agent_name(user),
        header_fields=analysis.header_fields or {},
    )

    # result_text holds a markdown document (table + narrative + notes) for the PDF/DOCX generator.
    full_markdown = _save_pipeline_result_to_analysis(analysis, result)

    if result.get("error"):
        _mark_failed(analysis, result["error"])
        return

    _persist_pipeline_result(analysis, full_markdown, user, document, output_format)


def _persist_pipeline_result(
    analysis: COTAnalysis,
    full_markdown: str,
    user: "User",
    document: Document,
    output_format: str,
) -> None:
    """Render the deliverable PDF/DOCX, link it to the analysis, and mark it COMPLETED.

    Shared by initial and re-analyze flows; assumes structured fields are already saved.
    """
    _check_cancelled(analysis.id)

    analysis.progress_step = COTAnalysis.ProgressStep.GENERATING_DOCUMENT
    analysis.save(update_fields=["progress_step", "updated_at"])

    doc_title, generated_filename, _, mime = _build_unique_generated_filename(
        document, output_format
    )
    buf = generate_document(full_markdown, output_format, title=doc_title)
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

    _check_cancelled(analysis.id)

    analysis.generated_document = generated_doc
    analysis.status = COTAnalysis.Status.COMPLETED
    analysis.progress_step = COTAnalysis.ProgressStep.COMPLETE
    analysis.save(update_fields=["generated_document", "status", "progress_step", "updated_at"])


def reanalyze_task(
    new_analysis_id: str,
    parent_analysis_id: str,
    instrument_edits: list[dict[str, object]],
    pages_to_rescan: list[int],
    user_instructions: str,
    provider: str,
    api_key: str,
    model: str,
    user_id: str,
    output_format: str,
    analysis_order: str,
    legal_description: str = "",
) -> None:
    """Re-analyze background task.

    Loads the parent's structured output, applies instrument edits and any
    page re-scans, runs the chain resolver, and persists onto the new analysis row.
    """
    from .services.reanalyze import run_reanalyze

    user_model = get_user_model()
    try:
        analysis = COTAnalysis.objects.get(id=new_analysis_id)
        parent_analysis = COTAnalysis.objects.get(id=parent_analysis_id)
        document = parent_analysis.document
        user = user_model.objects.get(id=user_id)

        if analysis.status == COTAnalysis.Status.COMPLETED:
            return
        if analysis.status == COTAnalysis.Status.CANCELLED:
            return
        if analysis.status == COTAnalysis.Status.FAILED:
            analysis.status = COTAnalysis.Status.PROCESSING
            analysis.error_message = ""
            analysis.save(update_fields=["status", "error_message", "updated_at"])

        analysis.progress_step = COTAnalysis.ProgressStep.CALLING_AI
        analysis.save(update_fields=["progress_step", "updated_at"])

        _check_cancelled(analysis.id)

        result = run_reanalyze(
            parent_analysis=parent_analysis,
            instrument_edits=instrument_edits or [],
            pages_to_rescan=pages_to_rescan or [],
            user_instructions=user_instructions or "",
            provider=provider,
            api_key=api_key,
            model=model,
            legal_description=legal_description,
            analysis_order=analysis_order,
            title_agent_name=_resolve_title_agent_name(user),
        )

        full_markdown = _save_pipeline_result_to_analysis(analysis, result)

        if result.get("error"):
            _mark_failed(analysis, result["error"])
            return

        _persist_pipeline_result(analysis, full_markdown, user, document, output_format)

    except _AnalysisCancelledError:
        pass

    except Exception as e:
        logger.exception("Reanalyze %s failed", new_analysis_id)
        try:
            analysis = COTAnalysis.objects.get(id=new_analysis_id)
            analysis.error_message = str(e)
            analysis.status = COTAnalysis.Status.FAILED
            analysis.progress_step = COTAnalysis.ProgressStep.FAILED
            analysis.save()
        except Exception:
            logger.exception("Failed to save error state for reanalyze %s", new_analysis_id)

    finally:
        connections.close_all()
