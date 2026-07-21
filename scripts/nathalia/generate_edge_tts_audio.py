import asyncio
from pathlib import Path

import edge_tts


VOICE = "pt-BR-FranciscaNeural"
RATE = "+4%"
PITCH = "+2Hz"
OUT_DIR = Path("apps/web/public/nathalia/audio") / VOICE

LINES = {
    "hours-period": "Escolha aqui a semana que deseja revisar.",
    "hours-new-entry": "Clique aqui para criar um novo lançamento.",
    "hours-grid": "Revise aqui os lançamentos salvos da semana.",
    "hours-status": "Pronto. Agora acompanhe o status dos apontamentos.",
    "approvals-queue": "Analise aqui os itens enviados para aprovação.",
    "approvals-actions": "Finalize usando aprovar ou reprovar. Tudo fica registrado.",
}


async def generate() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for key, text in LINES.items():
        target = OUT_DIR / f"{key}.mp3"
        communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
        await communicate.save(str(target))
        print(target)


if __name__ == "__main__":
    asyncio.run(generate())
