from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import app

client = TestClient(app.app)
ID = "dQw4w9WgXcQ"


@pytest.mark.parametrize("url", [
    f"https://www.youtube.com/watch?v={ID}",
    f"https://www.youtube.com/watch?feature=share&v={ID}&t=10s",
    f"https://youtu.be/{ID}?si=abc",
    f"https://www.youtube.com/embed/{ID}",
    f"https://www.youtube.com/shorts/{ID}",
    f"  https://youtu.be/{ID}  ",
])
def test_video_id_from_url(url):
    assert app.video_id_from_url(url) == ID


@pytest.mark.parametrize("url", ["", "hello", "https://example.com/abc", f"https://youtu.be/{ID}extra"])
def test_bad_urls_are_rejected(url):
    assert app.video_id_from_url(url) is None


def test_get_transcript_rejects_bad_url():
    r = client.post("/get_transcript", json={"url": "not a link"})
    assert r.status_code == 400 and "YouTube" in r.json()["detail"]


def test_summarize_uses_given_transcript_without_refetching():
    with patch.object(app, "fetch_transcript") as fetch, patch.object(app, "ask_gemini", return_value="# Summary") as gemini:
        r = client.post("/summarize", json={"transcript": "hello world", "prompt": "Be brief", "apiKey": "k"})
    assert r.json() == {"summary": "# Summary"}
    fetch.assert_not_called()
    key, prompt = gemini.call_args.args
    assert key == "k" and prompt.startswith("Be brief") and "hello world" in prompt


def test_missing_key_gives_clear_error(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    r = client.post("/ask", json={"transcript": "t", "question": "q"})
    assert r.status_code == 400 and "API key" in r.json()["detail"]


def test_transcript_errors_pass_through():
    with patch.object(app, "fetch_transcript", side_effect=HTTPException(404, "no captions")),          patch.object(app, "video_notes", side_effect=HTTPException(502, "x")):
        r = client.post("/get_transcript", json={"url": f"https://youtu.be/{ID}"})
    assert r.status_code == 404 and r.json()["detail"] == "no captions"


def test_pages_served():
    assert client.get("/").status_code == 200
    assert client.get("/watch").status_code == 200
    assert client.get("/static/watch.js").status_code == 200


def test_falls_back_when_main_model_overloaded(monkeypatch):
    from google.genai import errors

    calls = []

    class Models:
        def generate_content(self, model, contents, config=None):
            calls.append(model)
            if model == app.MODEL:
                raise errors.APIError(503, {"error": {"message": "high demand"}})
            return type("R", (), {"text": "fallback answer"})()

    monkeypatch.setattr(app.genai, "Client", lambda api_key: type("C", (), {"models": Models()})())
    assert app.ask_gemini("k", "p") == "fallback answer"
    assert calls == [app.MODEL, app.FALLBACK_MODEL]


def test_falls_back_to_gemini_watching_the_video():
    blocked = HTTPException(502, "Couldn't reach YouTube: blocked")
    with patch.object(app, "fetch_transcript", side_effect=blocked), \
         patch.object(app, "video_notes", return_value="notes from video") as notes:
        r = client.post("/get_transcript", json={"url": f"https://youtu.be/{ID}", "apiKey": "k"})
    assert r.json() == {"transcript": "notes from video", "source": "video"}
    notes.assert_called_once_with("k", ID)


def test_shows_caption_error_when_fallback_also_fails():
    with patch.object(app, "fetch_transcript", side_effect=HTTPException(404, "no captions")), \
         patch.object(app, "video_notes", side_effect=HTTPException(502, "gemini failed")):
        r = client.post("/get_transcript", json={"url": f"https://youtu.be/{ID}"})
    assert r.status_code == 404 and r.json()["detail"] == "no captions"


def test_key_problem_in_fallback_is_shown():
    with patch.object(app, "fetch_transcript", side_effect=HTTPException(404, "no captions")), \
         patch.object(app, "video_notes", side_effect=HTTPException(400, "Add a Gemini API key")):
        r = client.post("/get_transcript", json={"url": f"https://youtu.be/{ID}"})
    assert r.status_code == 400
