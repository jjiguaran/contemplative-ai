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

R2_FILENAME = "scripts/dynamic_scripts/dynamic.json"


DYNAMIC_PROMPT = """Crea una meditación guiada basada en la progresión del Anapanasati y el Satipatthana (respiración, cuerpo, sensaciones, mente y dhammas) que tenga una duración total exacta de 10 minutos (600 segundos).

Para lograr esta duración exacta de 10 minutos, debes seguir de forma estricta la siguiente estructura de 15 bloques (cada bloque dura 40 segundos en total):

1. El primer bloque debe ser una instrucción de llegada o asentamiento (por ejemplo: Encuentra una postura cómoda, cierra los ojos y toma una respiración profunda).
2. Los siguientes 13 bloques deben desarrollar la progresión meditativa (respiración, cuerpo, sensaciones, mente y dhammas).
3. El último bloque debe ser una instrucción de cierre para regresar al entorno (por ejemplo: Abre los ojos lentamente, mueve tu cuerpo despacio y lleva esta calma contigo).

Reglas estrictas de tiempo y formato por bloque:
- Cada una de las 15 instrucciones verbales debe ser breve y diseñada para ser leída de forma pausada en un tiempo aproximado de 10 segundos (alrededor de 15 palabras por instrucción).
- Después de cada instrucción, debes colocar obligatoriamente la etiqueta [silencio].
- Todos los silencios son fijos y duran exactamente 30 segundos cada uno. Escribe únicamente [silencio], sin añadir el tiempo dentro de los corchetes.

Reglas de estilo y contenido:
- Mantén un lenguaje contemplativo y profundo. Elige palabras y recordatorios que apunten sutilmente a la presencia mental.
- No expliques ni traduzcas el contexto, ni menciones el budismo directamente. Guía solo desde la experiencia inmediata. Evita términos conceptuales abstractos.
- Usa frases cortas e íntimas en segunda persona (tú), seguidas por [silencio]. 
- No uses viñetas, números, títulos, formato markdown ni símbolos.

Ejemplo de formato:
Encuentra una postura cómoda, relaja los hombros y toma una respiración profunda.
[silencio]

No incluyas cálculos, verificaciones, conteos de palabras, explicaciones ni secciones de control en la salida final. La salida debe contener única y exclusivamente las 15 líneas de texto de la meditación y las 15 etiquetas de [silencio].

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
    """Call the LLM to generate a dynamic 10-minute meditation script with retry logic"""
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
    print("=== Dynamic 10-Minute Guided Meditation Generator ===")
    print()

    # Generate the meditation using the LLM
    print("Generating 10-minute meditation...", end=" ", flush=True)
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