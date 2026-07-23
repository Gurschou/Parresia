#!/usr/bin/env python3
"""
AwakenX Web API
================
FastAPI-backend for AwakenX-agenten.
Kør med: uvicorn awakenx_api:app --reload

API Endpoints:
- POST /chat/{user_id} - Send en besked til AwakenX
- POST /end/{user_id}   - Afslut session og gem hukommelse
- GET  /status          - Tjek om API'en kører
"""

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import hashlib
import hmac
import httpx
import os
import sys
from pathlib import Path
from mistralai.client.models.file import File as MistralFile

# Tilføj projekt-roden til Python-path (for at importere AwakenX)
sys.path.insert(0, str(Path(__file__).parent))

from awakenx_agent import AwakenX

app = FastAPI(
    title="1MM AI API",
    description="Precision Performance Intelligence med persistent hukommelse",
    version="1.1.0"
)

# CORS (for at tillade requests fra frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tillad alle origins (udvikling)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global agent storage (i production: brug en database)
agents: dict[str, AwakenX] = {}


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str
    user_id: str


class StatusResponse(BaseModel):
    status: str
    active_sessions: int


class EndResponse(BaseModel):
    status: str


class ResetResponse(BaseModel):
    status: str


class VoiceResponse(BaseModel):
    transcript: str
    reply: str
    audio_data: str


class RealtimeSessionRequest(BaseModel):
    """
    Request an OpenAI Realtime *ephemeral* credential.

    The browser receives a short-lived client secret, never OPENAI_API_KEY.
    `user_id` is HMAC-pseudonymised before being sent as OpenAI's safety
    identifier. It is not logged, embedded in the session instructions or
    persisted by this endpoint.

    Consent is intentionally explicit: microphone audio and its live
    transcription are health-adjacent data in this product. This prototype
    gates processing on consent but does not claim to persist it; the
    versioned consent record belongs in the Digital Twin data layer once the
    web app is connected to Postgres.
    """

    user_id: str = Field(min_length=1, max_length=200)
    consent_to_process_voice: bool


class RealtimeSessionResponse(BaseModel):
    client_secret: str
    expires_at: int | None = None


OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/client_secrets"
OPENAI_REALTIME_MODEL = os.environ.get("OPENAI_REALTIME_MODEL", "gpt-realtime")
OPENAI_REALTIME_VOICE = os.environ.get("OPENAI_REALTIME_VOICE", "marin")

# Kept deliberately PII-free. Live audio is sent directly browser -> OpenAI
# over WebRTC; this backend only mints a short-lived credential.
REALTIME_INSTRUCTIONS = """
You are 1MM, a precise, calm performance-intelligence companion for
competitive amateur endurance athletes. Speak Danish by default unless the
athlete speaks another language. Listen first; ask at most one clarifying
question when it materially changes advice. Be concise, specific and
non-judgmental. Treat correlations as hypotheses, never diagnoses or facts.
Do not give medical diagnosis, emergency advice, or prescriptions. If the
athlete describes acute danger, self-harm, chest pain, severe symptoms, or
an emergency, tell them to seek immediate local professional help.
Do not ask for or repeat directly identifying information. Do not claim
access to wearable data, history, patterns, or a Digital Twin unless the
user explicitly supplies it in this conversation.
""".strip()


def openai_safety_identifier(user_id: str, api_key: str) -> str:
    """Return a stable opaque safety id without sending a user identifier."""
    digest = hmac.new(
        api_key.encode("utf-8"),
        user_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"1mm-{digest}"


def get_agent(user_id: str) -> AwakenX:
    """Hent eller opret en session, med en brugbar fejl hvis nøglen mangler."""
    if user_id not in agents:
        try:
            agents[user_id] = AwakenX(user_id=user_id)
        except SystemExit as error:
            raise HTTPException(
                status_code=500,
                detail=f"MISTRAL_API_KEY mangler: {error}",
            ) from error
    return agents[user_id]


@app.get("/", include_in_schema=False)
async def get_app():
    """Servér 1MM AI's weboplevelse."""
    return FileResponse(Path(__file__).parent / "index.html")


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """Tjek API-status"""
    return StatusResponse(
        status="running",
        active_sessions=len(agents)
    )


@app.post("/chat/{user_id}", response_model=ChatResponse)
async def chat(user_id: str, request: ChatRequest):
    """
    Send en besked til AwakenX.
    
    - **user_id**: Unikt ID for brugeren (f.eks. "bruger123")
    - **message**: Brugerens besked
    
    Returnerer AwakenX' svar.
    """
    agent = get_agent(user_id)
    reply = agent.chat(request.message)
    
    return ChatResponse(
        reply=reply,
        user_id=user_id
    )


@app.post("/voice/turn/{user_id}", response_model=VoiceResponse)
async def voice_turn(user_id: str, audio: UploadFile = File(...)):
    """
    Ét stemmetur: transskriber lyd, få 1MM-svar og returnér tale som MP3.

    Klienten sender en kort webm/ogg/wav-optagelse. Mistrals API-nøgle bliver
    kun brugt på serveren — aldrig i browseren.
    """
    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=415, detail="Upload en lydfil.")

    content = await audio.read()
    if not content:
        raise HTTPException(status_code=400, detail="Lydoptagelsen var tom.")

    agent = get_agent(user_id)
    try:
        transcription = agent.client.audio.transcriptions.complete(
            model="voxtral-mini-2602",
            file=MistralFile(
                fileName=audio.filename or "voice-turn.webm",
                content=content,
                content_type=audio.content_type,
            ),
        )
        transcript = transcription.text.strip()
        if not transcript:
            raise HTTPException(status_code=422, detail="Jeg kunne ikke høre tale i optagelsen.")

        reply = agent.chat(
            "Brugeren siger følgende i en live stemmesamtale. Svar kort, "
            "naturligt og på dansk. Stil højst ét opklarende spørgsmål, hvis "
            "det er nødvendigt før en ansvarlig 1MM-analyse.\n\n"
            f"Transskription: {transcript}"
        )
        speech = agent.client.audio.speech.complete(
            model="voxtral-mini-tts-2603",
            input=reply,
            response_format="mp3",
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Stemmebehandling fejlede: {error}") from error

    return VoiceResponse(
        transcript=transcript,
        reply=reply,
        audio_data=speech.audio_data,
    )


@app.post("/voice/realtime/session", response_model=RealtimeSessionResponse)
async def create_realtime_session(
    request: RealtimeSessionRequest,
):
    """
    Mint a short-lived OpenAI Realtime credential for a browser WebRTC call.

    Audio takes this path:

      browser microphone --WebRTC--> OpenAI Realtime

    The app server never receives or stores raw audio, SDP, or an OpenAI API
    key. The returned `client_secret` is scoped to one short-lived session.
    Native semantic VAD has `interrupt_response=true`, so if the athlete
    starts speaking while 1MM speaks, OpenAI stops its current answer
    (ChatGPT Live-style barge-in).
    """
    if not request.consent_to_process_voice:
        raise HTTPException(
            status_code=403,
            detail=(
                "Stemmebehandling kræver eksplicit samtykke til at behandle "
                "mikrofonlyd og live-transskription."
            ),
        )

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Never expose configuration details or a key in a browser response.
        raise HTTPException(
            status_code=503,
            detail="Live-stemme er ikke konfigureret endnu. Prøv igen senere.",
        )

    session_config = {
        "session": {
            "type": "realtime",
            "model": OPENAI_REALTIME_MODEL,
            "instructions": REALTIME_INSTRUCTIONS,
            "audio": {
                "input": {
                    "transcription": {"model": "gpt-4o-mini-transcribe"},
                    "turn_detection": {
                        "type": "semantic_vad",
                        "create_response": True,
                        "interrupt_response": True,
                    },
                },
                "output": {"voice": OPENAI_REALTIME_VOICE},
            },
        }
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # OpenAI recommends binding an opaque safety identifier while minting
        # ephemeral credentials. HMAC means a name entered in the legacy user
        # field never leaves the app as a name.
        "OpenAI-Safety-Identifier": openai_safety_identifier(
            request.user_id,
            api_key,
        ),
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                OPENAI_REALTIME_URL,
                headers=headers,
                json=session_config,
            )
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=503,
            detail="Live-stemmeforbindelsen kunne ikke oprettes. Prøv igen.",
        ) from error

    if response.is_error:
        # Do not proxy vendor error bodies: they can contain operational
        # details we should not expose to a browser.
        raise HTTPException(
            status_code=502,
            detail="Live-stemmeforbindelsen blev afvist. Prøv igen senere.",
        )

    payload = response.json()
    client_secret = payload.get("client_secret", {}).get("value")
    if not isinstance(client_secret, str) or not client_secret:
        raise HTTPException(
            status_code=502,
            detail="Live-stemmeforbindelsen returnerede et ugyldigt svar.",
        )

    return RealtimeSessionResponse(
        client_secret=client_secret,
        expires_at=payload.get("client_secret", {}).get("expires_at"),
    )


@app.post("/end/{user_id}", response_model=EndResponse)
async def end_session(user_id: str):
    """
    Afslut en session og gem hukommelsen.
    
    - **user_id**: Unikt ID for brugeren
    """
    if user_id in agents:
        agent = agents.pop(user_id)
        agent.end_session()
        return EndResponse(status=f"Session for {user_id} gemt og afsluttet")
    else:
        return EndResponse(status=f"Ingen aktiv session for {user_id}")


@app.post("/reset/{user_id}", response_model=ResetResponse)
async def reset_session(user_id: str):
    """
    Nulstil en agents session (slet historik, men behold hukommelse).
    
    - **user_id**: Unikt ID for brugeren
    """
    if user_id in agents:
        agents[user_id].history = []
        return ResetResponse(status=f"Session for {user_id} nulstillet")
    else:
        return ResetResponse(status=f"Ingen aktiv session for {user_id}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
