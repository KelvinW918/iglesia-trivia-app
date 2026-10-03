import os
import re
import json
import zoneinfo
import logging
from datetime import datetime

import feedparser
from google import genai
from google.genai.errors import ServerError, APIError
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

# --- Configuración de logging ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Variables de entorno ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    logger.warning("⚠️️ ADVERTENCIA: No se encontró la variable GEMINI_API_KEY en el entorno.")

# --- Cliente de Gemini ---
client = genai.Client(api_key=GEMINI_API_KEY)

# --- Constantes ---
CHANNEL_ID = "UCX0waSWisRZm9U7uoQd9IgQ"
ZONA_HORARIA = "America/Caracas"

MESES_ESPANOL = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
    5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
    9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre"
}

# Patrón base: contiene "Tiempo con Dios"
PATRON_DEVOCIONAL_BASE = re.compile(r"tiempo\s+con\s+dios", re.IGNORECASE)


# ============================================================
# UTILIDADES DE FECHA Y VIDEO
# ============================================================
def obtener_fecha_hoy_venezuela():
    """
    Devuelve una tupla (dia, mes_es, anio) con la fecha actual
    en la zona horaria de Venezuela.
    """
    tz = zoneinfo.ZoneInfo(ZONA_HORARIA)
    ahora = datetime.now(tz)
    return ahora.day, MESES_ESPANOL[ahora.month], ahora.year


def es_devocional_de_hoy(titulo: str) -> bool:
    """
    Valida que el título:
    1. Contenga 'Tiempo con Dios' (case-insensitive).
    2. Contenga el día y mes de HOY (zona Venezuela).

    Ejemplos válidos:
    - "Tu Tiempo con Dios 27 Septiembre 2026 (1 Cronicas 15:16-29)"
    - "Tu tiempo con dios 27 de septiembre (Salmos 23)"
    """
    if not PATRON_DEVOCIONAL_BASE.search(titulo):
        return False

    dia, mes, _ = obtener_fecha_hoy_venezuela()
    # Busca "27 septiembre" o "27 de septiembre" (ignorando mayúsculas)
    patron_fecha = rf"\b{dia}\s+(de\s+)?{mes}\b"
    return bool(re.search(patron_fecha, titulo, re.IGNORECASE))


def extraer_youtube_id(entry) -> str:
    """
    Extrae el ID único de 11 caracteres del video de YouTube.
    Prioriza el atributo yt_videoid del feed; si no existe, lo parsea del link.
    """
    if hasattr(entry, "yt_videoid"):
        return entry.yt_videoid

    match = re.search(
        r"(?:v=|\/embed\/|\/1\/|\/v\/|https?:\/\/(?:www\.)?youtu\.be\/|\/e\/|watch\?v=|^)([a-zA-Z0-9_-]{11})",
        entry.link,
    )
    if match:
        return match.group(1)
    return entry.link


# ============================================================
# BÚSQUEDA DEL DEVOCIONAL DE HOY EN YOUTUBE
# ============================================================
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception(
        lambda exc: isinstance(exc, (ConnectionError, TimeoutError)) or '503' in str(exc)
    ),
    reraise=True
)
def obtener_devocional_de_hoy():
    """
    Consulta el RSS del canal y busca el devocional de HOY (Venezuela).

    - Ignora cultos dominicales, transmisiones en vivo u otros videos.
    - Itera sobre las últimas 15 entradas del feed.
    - Devuelve un dict {titulo, link, youtube_id} o None si aún no existe.
    """
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
    logger.info(f"Consultando RSS de YouTube para el canal {CHANNEL_ID}...")

    try:
        feed = feedparser.parse(rss_url)

        if getattr(feed, "bozo", False) and not feed.entries:
            logger.error(f"Error al parsear el feed RSS: {feed.bozo_exception}")
            raise ConnectionError("No se pudo conectar con el feed RSS de YouTube.")

        if not feed.entries:
            logger.warning("El feed RSS no devolvió ninguna entrada.")
            return None

        max_revisar = min(15, len(feed.entries))
        dia, mes, anio = obtener_fecha_hoy_venezuela()
        logger.info(f"Buscando devocional del {dia} de {mes} de {anio} en las últimas {max_revisar} entradas...")

        for idx, entry in enumerate(feed.entries[:max_revisar], start=1):
            titulo = entry.title
            if es_devocional_de_hoy(titulo):
                video_id = extraer_youtube_id(entry)
                logger.info(f"✅ Devocional de hoy encontrado (pos {idx}): {titulo} | ID: {video_id}")
                return {
                    "titulo": titulo,
                    "link": entry.link,
                    "youtube_id": video_id,
                }
            else:
                logger.debug(f"⏭️ Descartada (pos {idx}): {titulo}")

        logger.info(f"Aún no se ha publicado el devocional de hoy ({dia} de {mes}).")
        return None

    except Exception as e:
        logger.error(f"Excepción al consultar YouTube: {str(e)}")
        raise ConnectionError(f"Fallo de conexión con YouTube: {str(e)}")


# ============================================================
# GENERACIÓN DE PREGUNTAS CON GEMINI (con reintentos exponenciales)
# ============================================================
@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=4, max=30),
    retry=retry_if_exception(
        lambda exc: isinstance(exc, (ServerError, APIError, ConnectionError))
        or '503' in str(exc)
        or 'unavailable' in str(exc).lower()
        or 'high demand' in str(exc).lower()
    ),
    reraise=True
)
def generar_preguntas_con_gemini(titulo_video: str):
    """
    Genera 3 preguntas (selección simple, múltiple y desarrollo) basadas en el devocional.
    """
    prompt = f"""
    Eres un asistente teológico experto. Analiza el tema o pasaje bíblico que se desprende del devocional titulado "{titulo_video}" del canal 'Luz a las Naciones México'.

    Genera exactamente 3 preguntas variadas y específicas basadas estrictamente en el texto o versículo analizado en el video (evita preguntas genéricas):
    1. Una pregunta de selección simple (con 4 opciones: A, B, C, D).
    2. Una pregunta de selección múltiple (donde se puedan elegir varias opciones correctas).
    3. Una pregunta de desarrollo o reflexión personal para el miembro de la iglesia.

    Devuelve la respuesta estrictamente en formato JSON plano (un arreglo de objetos), sin texto adicional ni bloques de markdown fuera del JSON, respetando esta estructura exacta:
    [
      {{
        "tipo": "seleccion_simple",
        "enunciado": "¿Pregunta basada en el texto?",
        "opciones": ["A) Opción 1", "B) Opción 2", "C) Opción 3", "D) Opción 4"],
        "respuesta_correcta": "A"
      }},
      {{
        "tipo": "seleccion_multiple",
        "enunciado": "¿Pregunta de múltiples respuestas correctas?",
        "opciones": ["A) Opción 1", "B) Opción 2", "C) Opción 3", "D) Opción 4"],
        "respuesta_correcta": "A, C"
      }},
      {{
        "tipo": "desarrollo",
        "enunciado": "¿Pregunta reflexiva personal basada en el versículo de hoy?",
        "opciones": [],
        "respuesta_correcta": "Evaluación pastoral"
      }}
    ]
    """

    logger.info(f"Enviando petición a Gemini (gemini-3.8-flash) para: {titulo_video}")

    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=prompt,
    )

    if not response.text:
        raise ValueError("La respuesta de Gemini vino vacía.")

    # Limpiar bloques de formato markdown
    texto_respuesta = response.text.strip()
    if texto_respuesta.startswith("```json"):
        texto_respuesta = texto_respuesta[7:]
    if texto_respuesta.startswith("```"):
        texto_respuesta = texto_respuesta[3:]
    if texto_respuesta.endswith("```"):
        texto_respuesta = texto_respuesta[:-3]

    texto_respuesta = texto_respuesta.strip()

    try:
        preguntas_json = json.loads(texto_respuesta)
    except json.JSONDecodeError as e:
        logger.error(f"JSON inválido devuelto por Gemini: {e}")
        logger.error(f"Texto crudo: {texto_respuesta[:500]}")
        raise ValueError("Gemini devolvió un JSON inválido.")

    logger.info("✅ Preguntas estructuradas generadas con éxito por Gemini.")
    return preguntas_json