import os
import json
import re
import feedparser
import logging
from google import genai
from google.genai.errors import ServerError, APIError
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Configurar logging profesional
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    logger.warning("⚠️ ADVERTENCIA: No se encontró la variable GEMINI_API_KEY en el entorno.")

# Inicializar el cliente de Gemini (usando el SDK moderno)
client = genai.Client(api_key=GEMINI_API_KEY)

CHANNEL_ID = "UCX0waSWisRZm9U7uoQd9IgQ"

# Patrón permisivo para validar títulos de devocionales.
# Coincide si el título contiene "tiempo con dios" (ignorando mayúsculas/espacios)
# y tiene una cita bíblica entre paréntesis en algún lugar del título.
PATRON_DEVOCIONAL = re.compile(r"tiempo\s+con\s+dios.*\(.+\)", re.IGNORECASE)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((ConnectionError, TimeoutError)),
    reraise=True
)
def obtener_ultimo_video_youtube():
    """
    Extrae el video más reciente del canal de YouTube por RSS que corresponda
    a un devocional válido (título con 'Tiempo con Dios' y cita bíblica entre paréntesis).

    Itera sobre las últimas entradas del feed (máx 10) y devuelve la primera que
    cumpla el patrón. Si ninguna cumple, retorna None.
    """
    rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"

    logger.info(f"Conectando al feed RSS de YouTube para el canal {CHANNEL_ID}...")
    try:
        feed = feedparser.parse(rss_url)

        # Verificar si hubo un fallo a nivel de parseo o red
        if getattr(feed, "bozo", False) and not feed.entries:
            logger.error(f"Error al parsear el feed RSS de YouTube: {feed.bozo_exception}")
            raise ConnectionError("No se pudo establecer una conexión estable con el feed RSS de YouTube.")

        if not feed.entries:
            logger.warning("El feed RSS no devolvió ninguna entrada de video.")
            return None

        # Iterar sobre las últimas 10 entradas buscando un devocional válido
        max_revisar = min(10, len(feed.entries))
        logger.info(f"Revisando las últimas {max_revisar} entradas del canal buscando devocionales...")

        for idx, entry in enumerate(feed.entries[:max_revisar], start=1):
            titulo = entry.title
            if PATRON_DEVOCIONAL.search(titulo):
                logger.info(f"✅ Devocional válido encontrado en posición {idx}: {titulo}")
                return {
                    "titulo": titulo,
                    "link": entry.link
                }
            else:
                logger.debug(f"⏭️  Entrada {idx} descartada (no cumple patrón): {titulo}")

        logger.warning(
            "No se encontró ningún video que coincida con el patrón de devocional "
            "en las últimas 10 entradas del canal."
        )
        return None

    except Exception as e:
        logger.error(f"Excepción capturada al obtener video de YouTube: {str(e)}")
        raise ConnectionError(f"Fallo de conexión con YouTube: {str(e)}")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=15),
    retry=retry_if_exception_type((ServerError, APIError)),
    reraise=False # Si fallan los 3 intentos, manejamos el fallback de forma elegante
)
def generar_preguntas_con_gemini(titulo_video: str):
    """
    Usa Gemini para generar un set de preguntas variadas (selección, múltiple y desarrollo)
    profundamente vinculadas al versículo o pasaje del devocional diario en formato JSON.
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

    try:
        logger.info("Enviando petición estructurada a Gemini para el análisis del pasaje bíblico...")
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=prompt,
        )

        if not response.text:
            raise ValueError("La respuesta de Gemini vino vacía.")

        # Limpiar posibles bloques de código markdown de la respuesta de la IA
        texto_respuesta = response.text.strip()
        if texto_respuesta.startswith("```json"):
            texto_respuesta = texto_respuesta[7:-3].strip()
        elif texto_respuesta.startswith("```"):
            texto_respuesta = texto_respuesta[3:-3].strip()

        preguntas_json = json.loads(texto_respuesta)
        logger.info("Preguntas estructuradas y basadas en versículos generadas con éxito por Gemini.")
        return preguntas_json

    except (ServerError, APIError) as api_err:
        logger.error(f"Error temporal en la API de Gemini (se reintentará): {api_err}")
        raise api_err # Forzar el reintento de Tenacity
    except Exception as e:
        logger.error(f"Error crítico inesperado en Gemini (usando fallback): {e}")
        # Fallback estructurado en caso de emergencia técnica
        return [
            {
                "tipo": "desarrollo",
                "enunciado": f"¿Qué enseñanza específica sobre el pasaje principal del devocional '{titulo_video}' impactó más tu vida hoy?",
                "opciones": [],
                "respuesta_correcta": "Evaluación pastoral"
            }
        ]