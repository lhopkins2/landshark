import base64
import json
import re
import threading
from typing import Any, TypedDict


class UsageDict(TypedDict):
    """Token-usage counters returned by every provider call."""

    input_tokens: int
    output_tokens: int


class ContentBlock(TypedDict, total=False):
    """Provider-agnostic content block.

    `type` is "text" or "image". Text blocks carry `text`; image blocks carry
    raw `data` bytes and `media_type` ("image/png").
    """

    type: str
    text: str
    data: bytes
    media_type: str


class ModelInfo(TypedDict):
    """One entry returned by `list_*_models`."""

    id: str
    name: str


DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o",
    "gemini": "gemini-2.5-flash",
}

DEFAULT_MAX_TOKENS = 8192
LARGE_DOC_MAX_TOKENS = 16384
LARGE_DOC_PAGE_THRESHOLD = 30
AI_CALL_TIMEOUT = 480  # 8 minutes — fail fast instead of hanging indefinitely

# genai.configure() mutates global SDK state, so concurrent calls with different keys must serialize.
_gemini_lock = threading.Lock()


def _max_tokens_for_content(content: list[ContentBlock]) -> int:
    """Scale max_tokens up for requests with many images."""
    image_count = sum(1 for b in content if b.get("type") == "image")
    if image_count >= LARGE_DOC_PAGE_THRESHOLD:
        return LARGE_DOC_MAX_TOKENS
    return DEFAULT_MAX_TOKENS


def _format_anthropic(content_blocks: list[ContentBlock]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
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


def _format_openai(content_blocks: list[ContentBlock]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
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


def _format_gemini(content_blocks: list[ContentBlock]) -> list[Any]:
    parts: list[Any] = []
    for block in content_blocks:
        if block["type"] == "text":
            parts.append(block["text"])
        elif block["type"] == "image":
            parts.append({"mime_type": block["media_type"], "data": block["data"]})
    return parts


def _is_openai_reasoning_model(model_id: str) -> bool:
    """True for o1/o3/o4 series, which have different kwargs than chat models."""
    return model_id.startswith(("o1", "o3", "o4"))


# Structured-JSON calls used by Stage 1 / Stage 2 of the pipeline. Each provider
# has a *_json call; run_structured_analysis dispatches and parses with a single retry.


_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE | re.MULTILINE)


def _strip_json_fences(text: str) -> str:
    """Drop ```json fences a model may emit despite the system prompt."""
    return _CODE_FENCE_RE.sub("", text).strip()


def call_anthropic_json(content: list[ContentBlock], api_key: str, model: str = "") -> tuple[str, UsageDict]:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key, timeout=AI_CALL_TIMEOUT)
    message = client.messages.create(
        model=model or DEFAULT_MODELS["anthropic"],
        max_tokens=_max_tokens_for_content(content),
        system="You return only strict JSON. No prose, no markdown fences, no commentary.",
        messages=[{"role": "user", "content": _format_anthropic(content)}],
    )
    if not message.content:
        raise ValueError("Anthropic returned an empty response.")
    usage: UsageDict = {
        "input_tokens": message.usage.input_tokens,
        "output_tokens": message.usage.output_tokens,
    }
    return message.content[0].text, usage


def call_openai_json(content: list[ContentBlock], api_key: str, model: str = "") -> tuple[str, UsageDict]:
    """OpenAI JSON-mode call. Falls back to plain output for reasoning models, which don't support response_format."""
    import openai

    resolved_model = model or DEFAULT_MODELS["openai"]
    client = openai.OpenAI(api_key=api_key, timeout=AI_CALL_TIMEOUT)

    token_limit = _max_tokens_for_content(content)
    is_reasoning = _is_openai_reasoning_model(resolved_model)
    kwargs: dict[str, Any] = {
        "model": resolved_model,
        "messages": [{"role": "user", "content": _format_openai(content)}],
    }
    if is_reasoning:
        kwargs["max_completion_tokens"] = token_limit
    else:
        kwargs["max_tokens"] = token_limit
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    if not response.choices or not response.choices[0].message.content:
        raise ValueError("OpenAI returned an empty response.")
    usage: UsageDict = {"input_tokens": 0, "output_tokens": 0}
    if response.usage:
        usage["input_tokens"] = response.usage.prompt_tokens or 0
        usage["output_tokens"] = response.usage.completion_tokens or 0
    return response.choices[0].message.content, usage


def call_gemini_json(
    content: list[ContentBlock],
    api_key: str,
    model: str = "",
    thinking_budget: int | None = None,
) -> tuple[str, UsageDict]:
    """Gemini JSON-output call. thinking_budget=0 disables internal thinking on Gemini 2.5+.

    Pre-2.5 SDKs reject `thinking_config`; on rejection we retry without it (paying
    for thinking tokens) so the call still succeeds.
    """
    import google.generativeai as genai

    base_config: dict[str, Any] = {"response_mime_type": "application/json"}
    full_config: dict[str, Any] = dict(base_config)
    if thinking_budget is not None:
        full_config["thinking_config"] = {"thinking_budget": int(thinking_budget)}

    def _attempt(generation_config: dict[str, Any]) -> Any:
        genai.configure(api_key=api_key)
        genai_model = genai.GenerativeModel(
            model or DEFAULT_MODELS["gemini"],
            generation_config=generation_config,
        )
        return genai_model.generate_content(
            _format_gemini(content),
            request_options={"timeout": AI_CALL_TIMEOUT},
        )

    with _gemini_lock:
        try:
            response = _attempt(full_config)
        except Exception as exc:
            # Older SDKs surface "Unknown field" for thinking_config — strip and retry.
            if "thinking_config" in full_config and "thinking_config" in str(exc):
                response = _attempt(base_config)
            else:
                raise
    usage: UsageDict = {"input_tokens": 0, "output_tokens": 0}
    if hasattr(response, "usage_metadata") and response.usage_metadata:
        usage["input_tokens"] = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
        usage["output_tokens"] = getattr(response.usage_metadata, "candidates_token_count", 0) or 0
    return response.text, usage


JSON_PROVIDER_FUNCTIONS = {
    "anthropic": call_anthropic_json,
    "openai": call_openai_json,
    "gemini": call_gemini_json,
}


def run_structured_analysis(
    content: list[ContentBlock],
    provider: str,
    api_key: str,
    model: str = "",
    thinking_budget: int | None = None,
) -> tuple[Any, UsageDict]:
    """Call the provider expecting strict JSON. Returns (parsed_obj, usage_dict).

    The parsed object is whatever `json.loads` produced — typically a dict, but the
    contract with downstream callers is documented per call site (they all
    `isinstance(parsed, dict)`-check first), hence the `Any` return type here.

    Retries once on JSON parse failure. Raises ValueError if both attempts fail.
    Usage tokens are summed across attempts.

    thinking_budget: Gemini 2.5+ only. 0 disables internal thinking, saving output tokens
    on mechanical tasks. Currently no-op for Anthropic / OpenAI.
    """
    func = JSON_PROVIDER_FUNCTIONS.get(provider)
    if not func:
        raise ValueError(f"Unknown provider: {provider}")

    # Only Gemini accepts thinking_budget today; other providers' signatures don't take it.
    kwargs: dict[str, Any] = {}
    if provider == "gemini" and thinking_budget is not None:
        kwargs["thinking_budget"] = thinking_budget

    total_usage: UsageDict = {"input_tokens": 0, "output_tokens": 0}
    last_error: json.JSONDecodeError | None = None
    last_text = ""

    for _ in range(2):
        text, usage = func(content, api_key, model, **kwargs)
        total_usage["input_tokens"] += usage.get("input_tokens", 0)
        total_usage["output_tokens"] += usage.get("output_tokens", 0)
        last_text = text

        try:
            parsed = json.loads(_strip_json_fences(text))
            return parsed, total_usage
        except json.JSONDecodeError as exc:
            last_error = exc
            continue

    snippet = last_text[:500] if last_text else "(empty)"
    raise ValueError(f"Provider returned invalid JSON after retry: {last_error}. First 500 chars: {snippet}")


def list_anthropic_models(api_key: str) -> list[ModelInfo]:
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


def _openai_display_name(model_id: str) -> str:
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


def list_openai_models(api_key: str) -> list[ModelInfo]:
    import openai

    client = openai.OpenAI(api_key=api_key)
    response = client.models.list()
    models: list[ModelInfo] = [
        {"id": m.id, "name": _openai_display_name(m.id)}
        for m in response.data
        if m.id.startswith(("gpt-", "o1", "o3", "o4"))
    ]
    models.sort(key=lambda m: m["name"])
    return models


def list_gemini_models(api_key: str) -> list[ModelInfo]:
    import google.generativeai as genai

    with _gemini_lock:
        genai.configure(api_key=api_key)
        models: list[ModelInfo] = [
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


def list_models(provider: str, api_key: str) -> list[ModelInfo]:
    func = LIST_MODELS_FUNCTIONS.get(provider)
    if not func:
        raise ValueError(f"Unknown provider: {provider}")
    return func(api_key)
