from openai import OpenAI
import os
import json
import time
from dotenv import load_dotenv
import boto3
from datetime import datetime
import uuid

# Load environment variables from .env file
load_dotenv()

client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=os.getenv("OPENROUTER_KEY"),
  timeout=300.0,
)

MODEL_NAME = "nvidia/nemotron-3-ultra-550b-a55b:free"

LOG_R2_KEY = "scripts/dynamic_scripts/dynamic_scripts_repo_log.json"
LOG_LOCAL_PATH = os.path.join(os.path.dirname(__file__), 'dynamic_scripts', 'dynamic_scripts_repo_log.json')

R2_FILENAME = "scripts/dynamic_scripts/anapanasati_1.json"


DYNAMIC_PROMPT = """Crea una meditación guiada basada en la progresión del Anapanasati y el Satipatthana (cuerpo, sensaciones, mente y dhammas, usando la respiración como ancla constante) que tenga una duración total exacta de 60 minutos (3600 segundos).

Para lograr esta duración exacta debes seguir de forma estricta la siguiente estructura de 120 bloques (cada bloque dura 30 segundos en total: instrucción hablada + silencio):

El primer bloque pertenece a la sección (inicio): una instrucción de llegada o asentamiento que ya establece la respiración como punto de apoyo (por ejemplo: Encuentra una postura cómoda, cierra los ojos y permite que la respiración encuentre su propio ritmo).
Los siguientes 118 bloques se distribuyen en 4 secciones de desarrollo, en este orden y con esta cantidad de bloques cada una:
(cuerpo): 30 bloques
(sensaciones): 29 bloques
(mente): 30 bloques
(dhammas): 29 bloques
El último bloque pertenece a la sección (cierre): una instrucción para regresar al entorno (por ejemplo: Abre los ojos lentamente, mueve tu cuerpo despacio y lleva esta calma contigo).

Principio central — la respiración como ancla de referencia, no como causa de cada evento:

La respiración NO es una sección aparte, pero tampoco es el motor que produce cada sensación, pensamiento o estado. Sigue el estilo de las meditaciones guiadas de Bhikkhu Anālayo o Thanissaro Bhikkhu: la respiración es un punto de referencia al que la atención vuelve una y otra vez, mientras se permite que lo que surge en la experiencia (en el cuerpo, en el tono de las sensaciones, en la mente, en los fenómenos) se despliegue con naturalidad, sin forzar una relación causal del tipo "con cada inhalación sucede X".
Evita construcciones como "con cada inhalación..." o "al exhalar, siente..." como fórmula repetida en cada instrucción. En su lugar, alterna entre: (a) instrucciones que invitan a notar directamente un aspecto de la experiencia (cuerpo, sensación, mente o fenómeno), dejando que la respiración esté presente de fondo, sostenida, sin protagonismo forzado; y (b) instrucciones que explícitamente devuelven la atención a la respiración como lugar de descanso o referencia, después de haber explorado algo.
En (cuerpo): la atención puede posarse en la respiración como sensación física en sí misma, y también extenderse a la experiencia del cuerpo entero mientras respira, sin necesidad de narrar el vínculo en cada frase.
En (sensaciones): se nota el tono agradable, desagradable o neutro que aparece, con la respiración como lugar tranquilo al que volver entre una observación y otra.
En (mente): se observan los estados de la mente (dispersa, quieta, clara, agitada) tal como se presentan, usando la respiración como ancla ocasional para reunir la atención, no como generadora de cada estado.
En (dhammas): se nota el surgir y cesar de lo que aparece, la impermanencia, el soltar, dejando que estos fenómenos se revelen por sí mismos, con la respiración como trasfondo estable.
La respiración debe aparecer con frecuencia en el conjunto de la sección, pero no en cada una de las instrucciones ni como disparador mecánico de lo observado.

Requisito crítico — instrucciones autocontenidas (para generación dinámica):

Cada una de las 120 instrucciones debe funcionar de manera completamente independiente y autónoma. No pueden usarse en la generación de meditaciones dinámicas si dependen del sentido de la instrucción anterior.
Está prohibido que una instrucción continúe, complete o dé seguimiento literal a la instrucción previa (nada de "también", "de la misma manera", "ahora nota además", "sigue sintiendo", ni construcciones que presupongan lo que se dijo antes).
Cada instrucción debe tener sentido completo leída de forma aislada, como si fuera la única instrucción de toda la meditación, sin perder claridad ni coherencia.
Dentro de cada sección, varía el vocabulario, el ángulo de observación y el énfasis para evitar repetición, pero sin construir una progresión narrativa dependiente del orden; cada bloque debe poder reordenarse o seleccionarse aleatoriamente sin que se note una ruptura de continuidad.

Etiquetas de sección:

Antes de la primera instrucción de cada sección, coloca la etiqueta correspondiente entre paréntesis en su propia línea: (inicio), (cuerpo), (sensaciones), (mente), (dhammas), (cierre).
Estas etiquetas son marcadores de edición, no se leen en voz alta y no consumen tiempo: no les asignes silencio ni las cuentes como bloque.
Aparecen una sola vez, justo al iniciar cada sección (6 etiquetas en total).

Reglas estrictas de tiempo y formato por bloque:

Cada una de las 120 instrucciones verbales debe ser breve y diseñada para ser leída de forma pausada en un tiempo aproximado de 10 segundos (alrededor de 15 palabras por instrucción).
Después de cada instrucción, debes colocar obligatoriamente la etiqueta [silencio].
Todos los silencios son fijos y duran exactamente 20 segundos cada uno. Escribe únicamente [silencio], sin añadir el tiempo dentro de los corchetes.

Reglas de estilo y contenido:

Mantén un lenguaje contemplativo y profundo, en la línea de las guías de Anālayo y Thanissaro Bhikkhu: preciso, sereno, que confía en la experiencia directa antes que en la narración de causas y efectos.
Dentro de cada sección, evita repetir la misma instrucción, metáfora o estructura sintáctica.
No expliques ni traduzcas el contexto, ni menciones el budismo directamente. Guía solo desde la experiencia inmediata. Evita términos conceptuales abstractos.
Usa frases cortas e íntimas en segunda persona (tú), seguidas por [silencio].
No uses viñetas, números, títulos adicionales, formato markdown ni símbolos (aparte de las etiquetas de sección entre paréntesis y [silencio]).

Ejemplo de formato: (inicio) Encuentra una postura cómoda, cierra los ojos y permite que la respiración encuentre su propio ritmo. [silencio] (cuerpo) Nota el peso del cuerpo apoyado en la superficie que lo sostiene. [silencio] Deja que la respiración esté presente, de fondo, mientras el cuerpo permanece quieto. [silencio]

No incluyas cálculos, verificaciones, conteos de palabras, explicaciones ni secciones de control en la salida final. La salida debe contener única y exclusivamente las etiquetas de sección, las 120 líneas de texto de la meditación y las 120 etiquetas de [silencio].

Asegúrate de que el texto esté escrito con corrección gramatical y ortográfica impecable en español."""

def get_s3_client():
    """Create and return an S3 client for Cloudflare R2"""
    return boto3.client(
        's3',
        endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
        region_name='auto'
    )


def download_log_from_r2():
    """Download dynamic meditations log from R2 bucket"""
    s3 = get_s3_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    try:
        obj = s3.get_object(Bucket=bucket, Key=LOG_R2_KEY)
        content = obj['Body'].read().decode('utf-8')
        log_data = json.loads(content)
        if 'meditations' not in log_data:
            log_data['meditations'] = []
        return log_data
    except s3.exceptions.NoSuchKey:
        print("  Log file not found in R2, starting with empty log.")
        return {"meditations": []}
    except Exception as e:
        raise Exception(f"Failed to download log from R2: {e}")


def upload_log_to_r2(log_data):
    """Upload dynamic meditations log to R2 bucket"""
    s3 = get_s3_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    s3.put_object(
        Bucket=bucket,
        Key=LOG_R2_KEY,
        Body=json.dumps(log_data, ensure_ascii=False, indent=2),
        ContentType='application/json'
    )


def load_log():
    """Load the existing dynamic meditations log from R2 (with local fallback)"""
    # First try to load from R2
    try:
        return download_log_from_r2()
    except Exception:
        pass
    # Fallback: load from local file
    try:
        with open(LOG_LOCAL_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"meditations": []}


def save_log(log_data):
    """Save the dynamic meditations log locally and upload to R2"""
    # Save locally
    with open(LOG_LOCAL_PATH, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    # Upload to R2
    try:
        upload_log_to_r2(log_data)
    except Exception as e:
        print(f"  Warning: could not upload log to R2: {e}")


def generate_dynamic_meditation(max_retries=3):
    """Call the LLM to generate a dynamic 60-minute meditation script with retry logic"""
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "user",
                        "content": DYNAMIC_PROMPT
                    }
                ],
                extra_body={"reasoning": {"enabled": True}}
            )

            # Extract the assistant message (with reasoning_details)
            result = response.choices[0].message
            return result

        except Exception as e:
            last_error = e
            if attempt < max_retries:
                wait_time = 2 ** attempt  # exponential backoff: 2, 4, 8 seconds
                print(f"\n  [RETRY {attempt}/{max_retries}] Error: {e}. Retrying in {wait_time}s...", end=" ", flush=True)
                time.sleep(wait_time)

    # All retries exhausted
    raise last_error


def upload_to_r2(output_data):
    """Upload meditation JSON to Cloudflare R2"""
    s3_client = boto3.client(
        's3',
        endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
        region_name='auto'
    )

    s3_client.put_object(
        Bucket=os.getenv('R2_BUCKET_NAME'),
        Key=R2_FILENAME,
        Body=json.dumps(output_data, ensure_ascii=False, indent=2),
        ContentType='application/json'
    )


def main():
    print("=== Dynamic 60-Minute Guided Meditation Generator ===")
    print()

    # Generate the meditation using the LLM
    print("Generating 60-minute meditation...", end=" ", flush=True)
    response = generate_dynamic_meditation()
    meditation_id = str(uuid.uuid4())
    current_date = datetime.now().strftime("%Y-%m-%d")
    print(f"✓ Done (id: {meditation_id})")

    # Save to R2
    output_data = {
        "meditation_content": response.content,
        "reasoning_details": getattr(response, 'reasoning_details', None),
        "model": MODEL_NAME,
        "timestamp": datetime.now().isoformat(),
        "id": meditation_id
    }
    print(f"Uploading to R2: {R2_FILENAME}...", end=" ", flush=True)
    try:
        upload_to_r2(output_data)
        print("✓ Done")
    except Exception as e:
        print(f"✗ Error: {e}")
        return

    # Update the log
    log_data = load_log()
    new_entry = {
        "id": meditation_id,
        "model": MODEL_NAME,
        "date_generated": current_date
    }
    log_data['meditations'].append(new_entry)
    save_log(log_data)

    print()
    print("=== Summary ===")
    print("Meditation generated and saved successfully.")


if __name__ == "__main__":
    main()