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

MODEL_NAME = "poolside/laguna-m.1:free"

LOG_R2_KEY = "scripts/dynamic_scripts/dynamic_scripts_repo_log.json"
LOG_LOCAL_PATH = os.path.join(os.path.dirname(__file__), 'dynamic_scripts', 'dynamic_scripts_repo_log.json')

R2_FILENAME = "scripts/dynamic_scripts/anapanasati_1.json"


DYNAMIC_PROMPT = """Crea una meditación guiada basada en la progresión del Anapanasati y el Satipatthana (cuerpo, sensaciones, mente y dhammas, usando la respiración como ancla constante) que tenga una duración total exacta de 60 minutos (3600 segundos).

Para lograr esta duración exacta debes seguir de forma estricta la siguiente estructura de 90 bloques (cada bloque dura 40 segundos en total: instrucción hablada + silencio):

1. El primer bloque pertenece a la sección (inicio): una instrucción de llegada o asentamiento que ya establece la respiración como punto de apoyo (por ejemplo: Encuentra una postura cómoda, cierra los ojos y siente el aire entrar y salir).
2. Los siguientes 88 bloques se distribuyen en 4 secciones de desarrollo, en este orden y con esta cantidad aproximada de bloques cada una:
   - (cuerpo): 22 bloques
   - (sensaciones): 22 bloques
   - (mente): 22 bloques
   - (dhammas): 22 bloques
3. El último bloque pertenece a la sección (cierre): una instrucción para regresar al entorno (por ejemplo: Abre los ojos lentamente, mueve tu cuerpo despacio y lleva esta calma contigo).

Principio central — la respiración como ancla:
- La respiración NO es una sección aparte; es el hilo conductor de toda la práctica, siguiendo las cuatro tétradas del Anapanasati.
- En (cuerpo): la atención va desde notar el aire entrando y saliendo, hacia sentir cómo ese movimiento afecta el cuerpo entero, hasta aquietar el cuerpo a través de la respiración.
- En (sensaciones): la atención usa la respiración para notar el tono agradable o neutro que surge con cada inhalación y exhalación, y cómo la respiración puede suavizar esas sensaciones.
- En (mente): la atención usa la respiración para observar los estados de la mente (dispersa, quieta, clara) y usarla para aquietar y reunir la mente.
- En (dhammas): la atención usa la respiración para notar el surgir y cesar de lo que aparece, el cambio constante, y el soltar que ocurre en cada exhalación.
- Casi todas las instrucciones deben mencionar o apoyarse en la respiración (inhalar, exhalar, aire, aliento) como el medio a través del cual se observa cada aspecto (cuerpo, sensaciones, mente, dhammas), en vez de tratar la respiración como un tema separado.

Etiquetas de sección:
- Antes de la primera instrucción de cada sección, coloca la etiqueta correspondiente entre paréntesis en su propia línea: (inicio), (cuerpo), (sensaciones), (mente), (dhammas), (cierre).
- Estas etiquetas son marcadores de edición, no se leen en voz alta y no consumen tiempo: no les asignes silencio ni las cuentes como bloque.
- Aparecen una sola vez, justo al iniciar cada sección (6 etiquetas en total).

Reglas estrictas de tiempo y formato por bloque:
- Cada una de las 90 instrucciones verbales debe ser breve y diseñada para ser leída de forma pausada en un tiempo aproximado de 10 segundos (alrededor de 15 palabras por instrucción).
- Después de cada instrucción, debes colocar obligatoriamente la etiqueta [silencio].
- Todos los silencios son fijos y duran exactamente 30 segundos cada uno. Escribe únicamente [silencio], sin añadir el tiempo dentro de los corchetes.

Reglas de estilo y contenido:
- Mantén un lenguaje contemplativo y profundo. Elige palabras y recordatorios que apunten sutilmente a la presencia mental.
- Dentro de cada sección, evita repetir la misma instrucción o metáfora; progresa gradualmente en profundidad y matiz, siempre volviendo a la respiración como punto de referencia.
- No expliques ni traduzcas el contexto, ni menciones el budismo directamente. Guía solo desde la experiencia inmediata. Evita términos conceptuales abstractos.
- Usa frases cortas e íntimas en segunda persona (tú), seguidas por [silencio].
- No uses viñetas, números, títulos adicionales, formato markdown ni símbolos (aparte de las etiquetas de sección entre paréntesis y [silencio]).

Ejemplo de formato:
(inicio)
Encuentra una postura cómoda, cierra los ojos y siente el aire entrar y salir.
[silencio]
(cuerpo)
Con cada inhalación, nota cómo tu pecho y vientre se expanden suavemente.
[silencio]

No incluyas cálculos, verificaciones, conteos de palabras, explicaciones ni secciones de control en la salida final. La salida debe contener única y exclusivamente las etiquetas de sección, las 90 líneas de texto de la meditación y las 90 etiquetas de [silencio].

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