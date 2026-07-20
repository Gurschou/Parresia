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
from pydantic import BaseModel
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


@app.post("/voice/{user_id}", response_model=VoiceResponse)
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
