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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import sys
from typing import Optional
from pathlib import Path

# Tilføj projekt-roden til Python-path (for at importere AwakenX)
sys.path.insert(0, str(Path(__file__).parent))

from awakenx_agent import AwakenX

app = FastAPI(
    title="AwakenX API",
    description="Personlig AI-coach med persistent hukommelse",
    version="1.0.0"
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
    # Hent eller opret agent
    if user_id not in agents:
        try:
            agents[user_id] = AwakenX(user_id=user_id)
        except SystemExit as e:
            raise HTTPException(
                status_code=500,
                detail=f"MISTRAL_API_KEY mangler: {e}"
            )
    
    agent = agents[user_id]
    reply = agent.chat(request.message)
    
    return ChatResponse(
        reply=reply,
        user_id=user_id
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
