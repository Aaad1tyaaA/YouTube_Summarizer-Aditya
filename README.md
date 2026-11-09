# YouTube TLDR

Paste a YouTube link, get a structured summary, then ask follow-up questions about the video. Answers come only from the video's transcript.

Built with FastAPI, `youtube-transcript-api` and Google Gemini, with a plain HTML/JS frontend.

## Features

- **Summaries** in headings and bullet points, with a custom prompt if you want one
- **Chat with the video:** follow-up questions answered from the transcript only
- **Any caption language:** non-English captions are auto-translated to English
- **Chat history** saved in the browser, with rename and PDF export
- **Handles Gemini overload:** falls back to a second model on HTTP 503, and turns rate limits and bad keys into clear messages
- **Safe rendering:** AI output is sanitised with DOMPurify, and user text is never treated as HTML

## Run it locally

```bash
cd python_app
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --app-dir . --reload
```

Open http://localhost:8000.

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). You can either type it on the home page, where it's stored only in your browser, or put it in `python_app/.env`:

```
GEMINI_API_KEY=your-key
# optional
GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.5-flash
```

## Tests

```bash
cd python_app
pip install pytest httpx
python -m pytest -q
```

## How it works

| Endpoint | Does |
|---|---|
| `POST /get_transcript` | Video URL → transcript (English, or translated to English) |
| `POST /summarize` | Transcript + prompt → Markdown summary |
| `POST /ask` | Transcript + question → answer grounded in the transcript |
| `GET /config` | Tells the frontend whether the server already has a key |

The browser fetches the transcript once and sends it with each summary and question, so YouTube is only called one time per video.
