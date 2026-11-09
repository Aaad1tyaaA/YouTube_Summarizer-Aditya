import os
import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import errors as genai_errors
from pydantic import BaseModel
from youtube_transcript_api import NoTranscriptFound, TranscriptsDisabled, YouTubeTranscriptApi

HERE = Path(__file__).parent
STATIC = HERE / "static"
load_dotenv(HERE / ".env")

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")
VIDEO_ID = re.compile(r"(?:v=|/|embed/|shorts/|youtu\.be/)([a-zA-Z0-9_-]{11})(?:[?&#/]|$)")


class TranscriptRequest(BaseModel):
    url: str


class SummarizeRequest(BaseModel):
    transcript: str
    prompt: str = ""
    apiKey: str = ""


class AskRequest(BaseModel):
    transcript: str
    question: str
    apiKey: str = ""


app = FastAPI(title="YouTube TLDR")


def video_id_from_url(url: str) -> str | None:
    match = VIDEO_ID.search(url.strip())
    return match.group(1) if match else None


def fetch_transcript(video_id: str) -> str:
    """English transcript, or the first available one auto-translated to English."""
    try:
        transcripts = YouTubeTranscriptApi().list(video_id)
        try:
            transcript = transcripts.find_transcript(["en", "en-US", "en-GB"])
        except NoTranscriptFound:
            first = next(iter(transcripts))
            if not first.is_translatable:
                raise HTTPException(404, "This video has captions, but none in English and they can't be translated.")
            transcript = first.translate("en")
        return " ".join(t.text for t in transcript.fetch() if t.text.strip())
    except (NoTranscriptFound, TranscriptsDisabled, StopIteration):
        raise HTTPException(404, "This video has no captions, so it can't be summarised.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Couldn't reach YouTube: {e}")


def ask_gemini(api_key: str, prompt: str) -> str:
    key = api_key.strip() or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise HTTPException(400, "Add a Gemini API key on the home page.")
    client = genai.Client(api_key=key)  # keep a reference: an inline client gets closed mid-request
    try:
        try:
            response = client.models.generate_content(model=MODEL, contents=prompt)
        except genai_errors.APIError as e:
            if e.code != 503 or MODEL == FALLBACK_MODEL:
                raise
            response = client.models.generate_content(model=FALLBACK_MODEL, contents=prompt)  # main model overloaded
    except genai_errors.APIError as e:
        if e.code == 429:
            raise HTTPException(429, "Gemini rate limit reached. Wait 30-60 seconds and try again.")
        if e.code in (400, 401, 403) and "key" in str(e).lower():
            raise HTTPException(401, "Gemini rejected the API key. Check it on the home page.")
        raise HTTPException(502, f"Gemini error: {e.message or e}")
    except Exception as e:
        raise HTTPException(502, f"Couldn't reach Gemini: {e}")
    return (response.text or "").strip() or "Gemini returned an empty response."


@app.post("/get_transcript")
def get_transcript(req: TranscriptRequest):
    video_id = video_id_from_url(req.url)
    if not video_id:
        raise HTTPException(400, "That doesn't look like a YouTube video link.")
    return {"transcript": fetch_transcript(video_id)}


@app.post("/summarize")
def summarize(req: SummarizeRequest):
    instructions = req.prompt.strip() or "Summarise this video concisely with headings and bullet points."
    return {"summary": ask_gemini(req.apiKey, f"{instructions}\n\nTRANSCRIPT:\n{req.transcript}")}


@app.post("/ask")
def ask(req: AskRequest):
    prompt = (
        "Answer the question using only the transcript below. "
        "If the transcript doesn't cover it, say so.\n\n"
        f"TRANSCRIPT:\n{req.transcript}\n\nQUESTION:\n{req.question}"
    )
    return {"answer": ask_gemini(req.apiKey, prompt)}


@app.get("/config")
def config():
    """Lets the frontend know whether the server already has a key."""
    return {"serverKey": bool(os.getenv("GEMINI_API_KEY")), "model": MODEL}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/watch")
def watch():
    return FileResponse(STATIC / "watch.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
