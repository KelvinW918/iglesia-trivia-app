import os
import re
import json
import zoneinfo
import logging
from datetime import datetime, timedelta
from typing import Optional

import feedparser
from google import genai
from google.genai import errors
from dotenv import load_dotenv
from tenacity import (
    retry, stop_after_attempt, wait_exponential,
    retry_if_exception, before_log, after_log,
)

# --- Logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Env ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    logger.warning("⚠️ No se encontró GEMINI_API_KEY en el entorno.")

# --- Cliente Gemini con timeout global de 60s ---
# https://ai.google.dev/gemini-api/docs/troubleshooting
client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={"timeout": 60000},  # 60s en milisegundos
)

# --- Constantes ---
CHANNEL_ID = os.getenv("YOUTUBE_CHANNEL_ID", "UCX0waSWisRZm9U7uoQd9IgQ")
ZONA_HORARIA = "America/Caracas"
MODELO_GEMINI = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

MESES_ESPANOL = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
}

PATRON_DEVOCIONAL_BASE = re.compile(r"tiempo\s+con\s+dios", re.IGNORECASE)


# ════════════════════════════════════════════════════════════
# UTILIDADES DE FECHA
# ════════════════════════════════════════════════════════════
def ahora_ve() -> datetime:
    """Fecha y hora actual en Venezuela."""
    return datetime.now(zoneinfo.ZoneInfo(ZONA_HORARIA))


def obtener_fecha_hoy_venezuela():
    """Retorna (dia, mes_es, anio) de hoy en Venezuela."""
    ahora = ahora_ve()
    return ahora.day, MESES_ESPANOL[ahora.month], ahora.year


def es_devocional_de_hoy(titulo: str) -> bool:
    """
    Valida estrictamente que el título:
    1. Contenga 'Tiempo con Dios'.
    2. Contenga el día y mes de HOY (Venezuela).
    3. NO contenga el día/mes de AYER (evita videos viejos).

    Ejemplos válidos:
    - "Tu Tiempo con Dios 3 Octubre 2026 (Salmos 23)"
    - "Tu tiempo con dios 3 de octubre (Juan 3:16)"
    """
    if not PATRON_DEVOCIONAL_BASE.search(titulo):
        return False

    # Fecha de HOY
    dia_hoy, mes_hoy, _ = obtener_fecha_hoy_venezuela()
    patron_hoy = rf"\b{dia_hoy}\s+(de\s+)?{mes_hoy}\b"
    if not re.search(patron_hoy, titulo, re.IGNORECASE):
        return False

    # Fecha de AYER (para descartar explícitamente)
    ayer = ahora_ve() - timedelta(days=1)
    dia_ayer = ayer.day
    mes_ayer = MESES_ESPANOL[ayer.month]
    patron_ayer = rf"\b{dia_ayer}\s+(de\s+)?{mes_ayer}\b"
    if re.search(patron_ayer, titulo, re.IGNORECASE):
        logger.debug(f"⏭️ Descartado (es de ayer): {titulo}")
        return False

    return True


def extraer_youtube_id(entry) -> str:
    """Extrae el ID de 11 chars del video de YouTube."""
    if hasattr(entry, "yt_videoid"):
        return entry.yt_videoid

    match = re.search(
        r"(?:v=|/embed/|/1/|/v/|youtu\.be/|/e/|watch\?v=)([a-zA-Z0-9_-]{11})",
        entry.link,
    )
    return match.group(1) if match else entry.link


# ════════════════════════════════════════════════════════════
# BÚSQUEDA DEL VIDEO DE HOY EN YOUTUBE
# ════════════════════════════════════════════════════════════
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=4, max=20),
    retry=retry_if_exception(
        lambda exc: isinstance(exc, (ConnectionError, TimeoutError))
        or "503" in str(exc)
    ),
    before=before_log(logger, logging.INFO),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)
def obtener_devocional_de_hoy() -> Optional[dict]:
    """
    Consulta el RSS del canal y busca el devocional de HOY (Venezuela).
    Retorna dict con {titulo, link, youtube_id} o None si aún no existe.
    """
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
    logger.info(f"📡 Consultando RSS del canal {CHANNEL_ID}...")

    try:
        feed = feedparser.parse(rss_url)

        if getattr(feed, "bozo", False) and not feed.entries:
            logger.error(f"Error RSS: {feed.bozo_exception}")
            raise ConnectionError("No se pudo conectar con el RSS de YouTube.")

        if not feed.entries:
            logger.warning("El RSS no devolvió entradas.")
            return None

        max_revisar = min(15, len(feed.entries))
        dia, mes, anio = obtener_fecha_hoy_venezuela()
        logger.info(f"🔎 Buscando devocional del {dia} de {mes} de {anio} en {max_revisar} entradas...")

        for idx, entry in enumerate(feed.entries[:max_revisar], start=1):
            titulo = entry.title
            if es_devocional_de_hoy(titulo):
                video_id = extraer_youtube_id(entry)
                logger.info(f"✅ Devocional de hoy (pos {idx}): {titulo} | ID: {video_id}")
                return {
                    "titulo": titulo,
                    "link": entry.link,
                    "youtube_id": video_id,
                }

        logger.info(f"⏳ Aún no se ha publicado el devocional de hoy ({dia} de {mes}).")
        return None

    except Exception as e:
        logger.error(f"Excepción al consultar YouTube: {e}")
        raise ConnectionError(f"Fallo de conexión con YouTube: {e}")


# ════════════════════════════════════════════════════════════
# GENERACIÓN DE PREGUNTAS CON GEMINI
# ════════════════════════════════════════════════════════════
@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=4, max=30),
    retry=retry_if_exception(
        lambda exc: isinstance(exc, (errors.ServerError, errors.APIError, ConnectionError))
        or "503" in str(exc)
        or "unavailable" in str(exc).lower()
        or "high demand" in str(exc).lower()
    ),
    before=before_log(logger, logging.INFO),
    after=after_log(logger, logging.WARNING),
    reraise=True,
)
def generar_preguntas_con_gemini(titulo_video: str) -> list:
    """
    Genera 3 preguntas (selección simple, múltiple, desarrollo)
    basadas en el pasaje bíblico inferido del título.
    """
    prompt = f"""
    Eres un asistente teológico experto. El devocional de hoy se titula: "{titulo_video}".

    A partir del pasaje bíblico que se menciona o infiere en ese título, genera exactamente 3 preguntas:
    1. Una de selección simple (4 opciones: A, B, C, D).
    2. Una de selección múltiple (varias respuestas correctas).
    3. Una de desarrollo o reflexión personal.

    Devuelve ESTRICTAMENTE un arreglo JSON plano, sin texto adicional ni markdown:
    [
      {{
        "tipo": "seleccion_simple",
        "enunciado": "¿Pregunta basada en el texto?",
        "opciones": ["A) Opción 1", "B) Opción 2", "C) Opción 3", "D) Opción 4"],
        "respuesta_correcta": "A"
      }},
      {{
        "tipo": "seleccion_multiple",
        "enunciado": "¿Pregunta de múltiples respuestas?",
        "opciones": ["A) Opción 1", "B) Opción 2", "C) Opción 3", "D) Opción 4"],
        "respuesta_correcta": "A, C"
      }},
      {{
        "tipo": "desarrollo",
        "enunciado": "¿Pregunta reflexiva personal?",
        "opciones": [],
        "respuesta_correcta": "Evaluación pastoral"
      }}
    ]
    """

    logger.info(f"🤖 Consultando Gemini ({MODELO_GEMINI}) para: {titulo_video}")

    response = client.models.generate_content(
        model=MODELO_GEMINI,
        contents=prompt,
    )

    if not response.text:
        raise ValueError("Gemini devolvió una respuesta vacía.")

    texto = response.text.strip()
    # Limpiar markdown
    for fence in ("```json", "```"):
        if texto.startswith(fence):
            texto = texto[len(fence):]
    if texto.endswith("```"):
        texto = texto[:-3]
    texto = texto.strip()

    try:
        preguntas = json.loads(texto)
    except json.JSONDecodeError as e:
        logger.error(f"JSON inválido de Gemini: {e}")
        logger.error(f"Texto crudo: {texto[:500]}")
        raise ValueError("Gemini devolvió un JSON inválido.")

    logger.info("✅ Preguntas generadas por Gemini.")
    return preguntas


# ════════════════════════════════════════════════════════════
# HASHING DE PINs (bcrypt)
# ════════════════════════════════════════════════════════════
from passlib.context import CryptContext
import random as _random

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    """Genera un hash bcrypt del PIN en texto plano."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """
    Verifica un PIN en texto plano contra un hash bcrypt.
    Retorna False si el hash está malformado o si no coincide.
    """
    try:
        return _pwd_context.verify(plain, hashed)
    except Exception as e:
        logger.warning(f"Error verificando PIN: {e}")
        return False


def generar_pin_aleatorio() -> str:
    """Genera un PIN numérico de 4 dígitos (1000-9999)."""
    return str(_random.randint(1000, 9999))