from pathlib import Path

from django.conf import settings as django_settings

PROMPT_FILE = Path(django_settings.BASE_DIR) / "prompts" / "cot_analysis.txt"


def load_prompt_template():
    """Load the prompt template from disk."""
    return PROMPT_FILE.read_text(encoding="utf-8")


def build_prompt(document_content, form_template_content, analysis_order, custom_request=""):
    """Build the full prompt from template + content."""
    template = load_prompt_template()
    order_label = (
        "chronological order (oldest to newest)"
        if analysis_order == "chronological"
        else "reverse chronological order (newest to oldest)"
    )

    custom_request_section = ""
    if custom_request.strip():
        custom_request_section = (
            "### Custom Request\n\n"
            "You MUST fulfill the following custom request in addition to all other instructions. "
            "This takes priority over default behavior where there is a conflict:\n\n"
            f"{custom_request.strip()}"
        )

    return template.format(
        analysis_order=order_label,
        document_content=document_content,
        form_template_content=form_template_content,
        custom_request=custom_request_section,
    )


DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o",
    "gemini": "gemini-2.5-flash",
}


def call_anthropic(prompt, api_key, model=""):
    """Call Anthropic Claude API."""
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model=model or DEFAULT_MODELS["anthropic"],
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def call_openai(prompt, api_key, model=""):
    """Call OpenAI GPT API."""
    import openai

    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=model or DEFAULT_MODELS["openai"],
        messages=[{"role": "user", "content": prompt}],
        max_tokens=8192,
    )
    return response.choices[0].message.content


def call_gemini(prompt, api_key, model=""):
    """Call Google Gemini API."""
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    genai_model = genai.GenerativeModel(model or DEFAULT_MODELS["gemini"])
    response = genai_model.generate_content(prompt)
    return response.text


PROVIDER_FUNCTIONS = {
    "anthropic": call_anthropic,
    "openai": call_openai,
    "gemini": call_gemini,
}


def run_analysis(prompt, provider, api_key, model=""):
    """Dispatch to the correct AI provider."""
    func = PROVIDER_FUNCTIONS.get(provider)
    if not func:
        raise ValueError(f"Unknown provider: {provider}")
    return func(prompt, api_key, model)


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
    # Exact match first
    if model_id in OPENAI_DISPLAY_NAMES:
        return OPENAI_DISPLAY_NAMES[model_id]
    # Try matching the base model (strip date suffixes like -2025-04-14)
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
