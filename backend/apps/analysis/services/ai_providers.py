import base64
import threading
from pathlib import Path

from django.conf import settings as django_settings

PROMPT_FILE = Path(django_settings.BASE_DIR) / "prompts" / "cot_analysis.txt"

# Document content marker in the prompt template — everything after this
# is injected programmatically as image or text content blocks.
_DOCUMENT_SECTION = "## DOCUMENT CONTENT"


def load_prompt_template():
    """Load the prompt template from disk."""
    return PROMPT_FILE.read_text(encoding="utf-8")



def build_prompt_content(
    page_images,
    document_text,
    analysis_order,
    custom_request="",
    legal_description="",
    total_pages=0,
):
    """Build structured content blocks for the LLM.

    Returns a list of content blocks in a provider-agnostic intermediate format:
        {"type": "text", "text": "..."}
        {"type": "image", "data": b"...", "media_type": "image/png"}

    page_images: list of (page_number, png_bytes) tuples from render_pdf_pages()
    document_text: extracted text string (used as fallback/supplement or primary for non-PDFs)
    total_pages: total page count of the original document (for truncation messaging)
    """
    template = load_prompt_template()
    order_label = (
        "chronological order (oldest to newest)"
        if analysis_order == "chronological"
        else "reverse chronological order (newest to oldest)"
    )

    # Split template at the document content section
    if _DOCUMENT_SECTION in template:
        preamble = template[: template.index(_DOCUMENT_SECTION)].rstrip()
    else:
        preamble = template

    # Substitute template variables in the preamble (use str.replace to avoid
    # crashes when user-supplied legal_description or custom_request contain braces)
    preamble = preamble.replace("{analysis_order}", order_label)
    preamble = preamble.replace(
        "{legal_description}",
        legal_description.strip() if legal_description else "(No legal description provided.)",
    )
    preamble = preamble.replace(
        "{custom_request}",
        custom_request.strip() if custom_request else "(No custom request provided.)",
    )

    content = []

    if page_images:
        # Vision mode: prompt preamble + page images
        content.append({"type": "text", "text": preamble})
        content.append({
            "type": "text",
            "text": (
                f"## DOCUMENT CONTENT\n\n"
                f"The following {len(page_images)} page(s) are images of the document. "
                f"Examine each page carefully for all visual details including stamps, "
                f"handwriting, margin annotations, struck text, and other markings."
            ),
        })

        for page_num, png_bytes in page_images:
            content.append({"type": "text", "text": f"--- Page {page_num} of {total_pages} ---"})
            content.append({"type": "image", "data": png_bytes, "media_type": "image/png"})

        # If the document was truncated, include remaining pages as text
        rendered_count = len(page_images)
        if rendered_count < total_pages and document_text:
            content.append({
                "type": "text",
                "text": (
                    f"## SUPPLEMENTARY TEXT (Pages {rendered_count + 1}–{total_pages})\n\n"
                    f"The remaining pages could not be sent as images due to context limits. "
                    f"Their extracted text is provided below:\n\n{document_text}"
                ),
            })
    else:
        # Text-only mode: inject document text directly into the prompt
        full_prompt = preamble + f"\n\n---\n\n## DOCUMENT CONTENT\n\n{document_text}"
        content.append({"type": "text", "text": full_prompt})

    return content


def build_prompt(document_content, analysis_order, custom_request="", legal_description=""):
    """Build a text-only prompt string (backward-compatible wrapper)."""
    blocks = build_prompt_content(
        page_images=[],
        document_text=document_content,
        analysis_order=analysis_order,
        custom_request=custom_request,
        legal_description=legal_description,
    )
    return blocks[0]["text"]


# ---------------------------------------------------------------------------
# Provider API calls
# ---------------------------------------------------------------------------

DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o",
    "gemini": "gemini-2.5-flash",
}

DEFAULT_MAX_TOKENS = 8192
LARGE_DOC_MAX_TOKENS = 16384
LARGE_DOC_PAGE_THRESHOLD = 30
AI_CALL_TIMEOUT = 480  # 8 minutes — fail fast instead of hanging indefinitely

# Lock for Gemini API calls — genai.configure() mutates global state,
# so concurrent calls with different API keys must be serialized.
_gemini_lock = threading.Lock()


def _max_tokens_for_content(content):
    """Scale max_tokens based on whether the request includes many images."""
    if isinstance(content, list):
        image_count = sum(1 for b in content if b.get("type") == "image")
        if image_count >= LARGE_DOC_PAGE_THRESHOLD:
            return LARGE_DOC_MAX_TOKENS
    return DEFAULT_MAX_TOKENS


def _format_anthropic(content_blocks):
    """Convert intermediate content blocks to Anthropic message format."""
    parts = []
    for block in content_blocks:
        if block["type"] == "text":
            parts.append({"type": "text", "text": block["text"]})
        elif block["type"] == "image":
            b64 = base64.b64encode(block["data"]).decode("utf-8")
            parts.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": block["media_type"],
                    "data": b64,
                },
            })
    return parts


def _format_openai(content_blocks):
    """Convert intermediate content blocks to OpenAI message format."""
    parts = []
    for block in content_blocks:
        if block["type"] == "text":
            parts.append({"type": "text", "text": block["text"]})
        elif block["type"] == "image":
            b64 = base64.b64encode(block["data"]).decode("utf-8")
            data_url = f"data:{block['media_type']};base64,{b64}"
            parts.append({
                "type": "image_url",
                "image_url": {"url": data_url, "detail": "high"},
            })
    return parts


def _format_gemini(content_blocks):
    """Convert intermediate content blocks to Gemini parts list."""
    parts = []
    for block in content_blocks:
        if block["type"] == "text":
            parts.append(block["text"])
        elif block["type"] == "image":
            parts.append({"mime_type": block["media_type"], "data": block["data"]})
    return parts


def _normalize_content(content):
    """Ensure content is a list of blocks (supports legacy string input)."""
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return content


def call_anthropic(content, api_key, model=""):
    """Call Anthropic Claude API with text or vision content."""
    import anthropic

    blocks = _normalize_content(content)
    client = anthropic.Anthropic(api_key=api_key, timeout=AI_CALL_TIMEOUT)
    message = client.messages.create(
        model=model or DEFAULT_MODELS["anthropic"],
        max_tokens=_max_tokens_for_content(blocks),
        messages=[{"role": "user", "content": _format_anthropic(blocks)}],
    )
    if not message.content:
        raise ValueError("Anthropic returned an empty response.")
    usage = {"input_tokens": message.usage.input_tokens, "output_tokens": message.usage.output_tokens}
    return message.content[0].text, usage


def _is_openai_reasoning_model(model_id):
    """Return True if the model is an OpenAI reasoning model (o1, o3, o4 series)."""
    return model_id.startswith(("o1", "o3", "o4"))


def call_openai(content, api_key, model=""):
    """Call OpenAI GPT API with text or vision content."""
    import openai

    blocks = _normalize_content(content)
    resolved_model = model or DEFAULT_MODELS["openai"]
    client = openai.OpenAI(api_key=api_key, timeout=AI_CALL_TIMEOUT)

    # Reasoning models (o1/o3/o4) require max_completion_tokens instead of max_tokens
    token_limit = _max_tokens_for_content(blocks)
    if _is_openai_reasoning_model(resolved_model):
        token_kwargs = {"max_completion_tokens": token_limit}
    else:
        token_kwargs = {"max_tokens": token_limit}

    response = client.chat.completions.create(
        model=resolved_model,
        messages=[{"role": "user", "content": _format_openai(blocks)}],
        **token_kwargs,
    )
    if not response.choices or not response.choices[0].message.content:
        raise ValueError("OpenAI returned an empty response.")
    usage = {"input_tokens": 0, "output_tokens": 0}
    if response.usage:
        usage["input_tokens"] = response.usage.prompt_tokens or 0
        usage["output_tokens"] = response.usage.completion_tokens or 0
    return response.choices[0].message.content, usage


def call_gemini(content, api_key, model=""):
    """Call Google Gemini API with text or vision content."""
    import google.generativeai as genai

    blocks = _normalize_content(content)
    with _gemini_lock:
        genai.configure(api_key=api_key)
        genai_model = genai.GenerativeModel(model or DEFAULT_MODELS["gemini"])
        response = genai_model.generate_content(
            _format_gemini(blocks),
            request_options={"timeout": AI_CALL_TIMEOUT},
        )
    usage = {"input_tokens": 0, "output_tokens": 0}
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        usage["input_tokens"] = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
        usage["output_tokens"] = getattr(response.usage_metadata, "candidates_token_count", 0) or 0
    return response.text, usage


PROVIDER_FUNCTIONS = {
    "anthropic": call_anthropic,
    "openai": call_openai,
    "gemini": call_gemini,
}


def run_analysis(content, provider, api_key, model=""):
    """Dispatch to the correct AI provider. Returns (result_text, usage_dict)."""
    func = PROVIDER_FUNCTIONS.get(provider)
    if not func:
        raise ValueError(f"Unknown provider: {provider}")
    return func(content, api_key, model)


# ---------------------------------------------------------------------------
# Model listing (unchanged)
# ---------------------------------------------------------------------------

def list_anthropic_models(api_key):
    """List available Anthropic models."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.models.list(limit=100)
    return [
        {"id": m.id, "name": m.display_name or m.id}
        for m in response.data
    ]


OPENAI_DISPLAY_NAMES = {
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4-turbo": "GPT-4 Turbo",
    "gpt-4": "GPT-4",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 Nano",
    "gpt-3.5-turbo": "GPT-3.5 Turbo",
    "o1": "o1",
    "o1-mini": "o1 Mini",
    "o1-preview": "o1 Preview",
    "o3": "o3",
    "o3-mini": "o3 Mini",
    "o3-pro": "o3 Pro",
    "o4-mini": "o4 Mini",
}


def _openai_display_name(model_id):
    """Get a friendly display name for an OpenAI model ID."""
    if model_id in OPENAI_DISPLAY_NAMES:
        return OPENAI_DISPLAY_NAMES[model_id]
    base = model_id
    for suffix_start in ("-2024", "-2025", "-2026"):
        idx = base.find(suffix_start)
        if idx != -1:
            base = base[:idx]
            break
    if base in OPENAI_DISPLAY_NAMES:
        return OPENAI_DISPLAY_NAMES[base]
    return model_id


def list_openai_models(api_key):
    """List available OpenAI chat models."""
    import openai

    client = openai.OpenAI(api_key=api_key)
    response = client.models.list()
    models = [
        {"id": m.id, "name": _openai_display_name(m.id)}
        for m in response.data
        if m.id.startswith(("gpt-", "o1", "o3", "o4"))
    ]
    models.sort(key=lambda m: m["name"])
    return models


def list_gemini_models(api_key):
    """List available Gemini generative models."""
    import google.generativeai as genai

    with _gemini_lock:
        genai.configure(api_key=api_key)
        models = [
            {"id": m.name.replace("models/", ""), "name": m.display_name or m.name}
            for m in genai.list_models()
            if "generateContent" in (m.supported_generation_methods or [])
        ]
    return models


LIST_MODELS_FUNCTIONS = {
    "anthropic": list_anthropic_models,
    "openai": list_openai_models,
    "gemini": list_gemini_models,
}


def list_models(provider, api_key):
    """List available models for a provider."""
    func = LIST_MODELS_FUNCTIONS.get(provider)
    if not func:
        raise ValueError(f"Unknown provider: {provider}")
    return func(api_key)
