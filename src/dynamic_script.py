import argparse
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

GENERATION_LOG_R2_KEY = "scripts/dynamic_scripts/anapanasati/generation_log.json"
GENERATION_LOG_LOCAL_PATH = os.path.join(os.path.dirname(__file__), 'dynamic_scripts', 'anapanasati', 'generation_log.json')

R2_SCRIPTS_DIR = "scripts/dynamic_scripts/anapanasati"
MEDITATION_NAME = "anapanasati"

# Fixed number of development blocks per section
SECCION_BLOQUES = {
    "cuerpo": 118,
    "sensaciones": 36,
    "mente": 36,
    "dhammas": 30,
}

# Number of variations to generate per section
MAX_VARIATIONS = 3


DYNAMIC_PROMPT_BASE = """Genera instrucciones habladas para una meditación guiada, dentro de una progresión basada en el Anapanasati y el Satipatthana (cuerpo, sensaciones, mente y dhammas, con la respiración como ancla constante).

{TRAMOS}

{NOTA_INICIO_CIERRE}

Guía específica según la sección "{SECCION}" (aplica solo al bloque de desarrollo):

- Si es "cuerpo": la atención puede posarse en la respiración como sensación física en sí misma, y también extenderse a la experiencia del cuerpo entero mientras respira, sin narrar el vínculo causal en cada frase.
- Si es "sensaciones": nota el tono agradable, desagradable o neutro, siempre anclado a un referente concreto y perceptible (una sensación corporal específica, un sonido, un pensamiento, o el contacto con el entorno), nunca de forma aislada o abstracta. El tono no es una propiedad fija del tipo de sensación: no le asignes "desagradable" a sensaciones naturalmente neutras o ambiguas como el calor, el peso, el hormigueo, la vibración o la presión (el calor en los pies, el peso en los párpados o el hormigueo en las manos son ejemplos que no deben etiquetarse como desagradables por defecto). Usa "desagradable" solo cuando la connotación incómoda ya está en la propia palabra del referente (tensión, nudo, tirantez, rigidez, urgencia), y "agradable" cuando ya connota alivio o soltura (relajación, suavidad, apertura, ligereza); en cualquier otro caso, el tono es neutro. Elige referentes cuya presencia sea plausible en una postura de meditación quieta (el contacto con la ropa o el asiento, el peso del cuerpo, la temperatura de la piel, un sonido, la respiración) y evita presuponer sensaciones puntuales o transitorias que podrían no estar ocurriendo, como sequedad en la garganta o cosquilleo en la nariz. No uses metáforas de sabor o temperatura para ilustrar el tono (dulzura, amargura, frialdad); nómbralo de forma directa sobre su referente. La respiración no debe aparecer en todas las instrucciones de esta sección: alterna entre instrucciones que solo señalan el tono sobre su referente y otras que la usan como lugar tranquilo al que volver.

Evita: "Reconoce el tono desagradable del calor en la planta de los pies" (el calor no es inherentemente desagradable).
Evita: "Reconoce el tono desagradable de la sequedad en la garganta" (presupone una sensación que puede no estar presente).
Preferí: "Observa la sensación neutra del calor en la planta de los pies" / "Nota el tono neutro del peso en los párpados".
No uses como referente sensaciones intensas o emocionalmente cargadas que puedan no estar presentes (nudo en la garganta, dificultad para tragar, zumbido en los oídos, opresión aguda). Prioriza referentes leves y probables en una postura sentada y quieta.
No uses palabras que designen la respiración como refugio, hogar, o cualquier lugar de cobijo; usa únicamente "ancla", "punto de referencia" o "descanso" para la vuelta a la respiración, y nunca construyas la sensación como consecuencia temporal de inhalar/exhalar (evita "al inhalar...", "al exhalar...", "al respirar...", además de "con cada inhalación...").

- Si es "mente": observa los estados de la mente tal como se presentan, usando la respiración como ancla ocasional para reunir la atención, no como generadora de cada estado. Cuando el estado que nombres tenga un opuesto o complemento natural, no generes una instrucción por cada polo: formulá los dos polos dentro de una misma instrucción, con "la mente" siempre explícita en la frase. No todos los estados necesitan par: los que no tienen un opuesto claro (la intención que impulsa la atención, la calidad emocional presente, el estado general de la mente ahora) pueden quedar como instrucciones simples, sin forzar una contraparte. Evita vocabulario pali-conceptual como "codiciosa" o "aversiva"; usa equivalentes coloquiales como "atraída" o "rechazando".
- Si es "dhammas": nota el surgir y cesar de lo que aparece, la impermanencia, el soltar, dejando que estos fenómenos se revelen por sí mismos, con la respiración como trasfondo estable.

Principio central — la respiración como ancla de referencia, no como causa de cada evento:

La respiración no es una sección aparte, pero tampoco es el motor que produce cada sensación, pensamiento o estado. Sigue el estilo de las meditaciones guiadas de Bhikkhu Anālayo o Thanissaro Bhikkhu: la respiración es un punto de referencia al que la atención vuelve una y otra vez, mientras se permite que lo que surge en la experiencia se despliegue con naturalidad, sin forzar una relación causal del tipo "con cada inhalación sucede X".
Evita construcciones repetidas como "con cada inhalación..." o "al exhalar, siente...". En su lugar, alterna entre: (a) instrucciones que invitan a notar directamente un aspecto de la experiencia propio de "{SECCION}", dejando que la respiración esté presente de fondo, sin protagonismo forzado; y (b) instrucciones que explícitamente devuelven la atención a la respiración como lugar de descanso o referencia.
La respiración debe aparecer con frecuencia en el conjunto de bloques generados, pero no en cada una de las instrucciones ni como disparador mecánico de lo observado.

Requisito crítico — instrucciones autocontenidas (para generación dinámica):

Cada instrucción debe funcionar de manera completamente independiente y autónoma, ya que se usarán en un sistema de generación dinámica y podrán reordenarse o seleccionarse al azar.
Está prohibido que una instrucción continúe, complete o dé seguimiento literal a otra (nada de "también", "de la misma manera", "ahora nota además", "sigue sintiendo", ni construcciones que presupongan una instrucción previa).
Cada instrucción debe tener sentido completo leída de forma aislada, como si fuera la única instrucción de toda la meditación.
Varía el vocabulario, el ángulo de observación y el énfasis entre instrucciones para evitar repetición, sin construir una progresión narrativa dependiente del orden.

Reglas estrictas de tiempo y formato por bloque:

Cada instrucción verbal debe ser breve y diseñada para ser leída de forma pausada en un tiempo aproximado de 10 segundos (alrededor de 15 palabras por instrucción).
Después de cada instrucción, coloca obligatoriamente la etiqueta [silencio]. Escribe únicamente [silencio], sin añadir tiempo dentro de los corchetes (el silencio fijo es de 20 segundos, pero esto no se escribe).

Reglas de estilo y contenido:

Mantén un lenguaje contemplativo, sereno y llano, en la línea de Thanissaro Bhikkhu y Bhikkhu Anālayo: la profundidad viene de la precisión y el ritmo pausado, no de la imaginería. Nombra la sensación, el estado mental o el fenómeno directamente, sin ilustrarlo con metáforas o escenas para darle profundidad. No compares el cuerpo o la mente con objetos, roles o escenas externas (anfitrión/huésped, acordeón, hamaca, pila de monedas, cielo y tierra, regazo). Una imagen breve que describa la forma física de un movimiento ya presente ("como una ola", "como ondas") es aceptable de forma ocasional; el resto debe ser observación directa. Evita también el vocabulario clínico (intercambio gaseoso) o abstracto-conceptual (reciprocidad, entrega) que nombra una idea en vez de mostrarla.
No expliques ni traduzcas el contexto, ni menciones el budismo directamente. Guía solo desde la experiencia inmediata. Evita términos conceptuales abstractos.
Usa frases cortas e íntimas en segunda persona (tú), seguidas por [silencio].
No uses viñetas, números, títulos adicionales, formato markdown ni símbolos, salvo las etiquetas indicadas en "Formato de salida" y [silencio].

Regla sobre partes del cuerpo pareadas:

Cuando la instrucción involucre partes del cuerpo pareadas (pantorrillas, rodillas, manos, hombros, omóplatos, pies, brazos, muslos, tobillos), inclúyelas ambas en una sola instrucción ("siente ambas pantorrillas, izquierda y luego derecha") en vez de generar una instrucción por lado. Nunca generes una instrucción centrada solo en "el lado derecho" o "el lado izquierdo" sin mencionar el otro en la misma frase, ya que en el sistema dinámico podría seleccionarse de forma aislada y quedar sin sentido.

Regla sobre estados de la mente opuestos:
Nunca generes dos instrucciones separadas para los dos polos de un mismo contraste mental (ej. una para "dispersa" y otra para "quieta"). Uníalos siempre en una sola instrucción autocontenida que presente ambos como posibilidades igualmente válidas a observar en este momento, sin jerarquía entre ellos.

Regla de variedad sintáctica para pares opuestos:
No repitas la misma estructura de frase para presentar los pares de estados opuestos. Alterna las construcciones (pregunta directa, afirmación con verbo al final, orden invertido, pausa media con guión, formulación como rango o continuo). Ningún molde debe repetirse en más de dos o tres instrucciones dentro del mismo bloque de "mente". El verbo inicial (observa, nota, mira, ve, reconoce, siente) no alcanza por sí solo para generar variedad si la estructura de la frase que sigue es idéntica.

Regla de variedad de contenido en pares opuestos:
Cada pareja de estados opuestos debe aparecer pocas veces por bloque generado. Si necesitas más instrucciones de las que hay parejas distintas, generá parejas nuevas (aferrada/suelta, juzgando/observando, dudosa/confiada, rígida/flexible, lúcida/nublada, apresurada/pausada, atraída/rechazando) en vez de repetir demasiado una pareja ya usada con otra estructura.

Regla de referencia explícita en pares opuestos:
Cuando una instrucción presente un par de adjetivos opuestos referidos a la mente, "la mente" debe aparecer de forma explícita en la misma frase, y antes o junto al par de adjetivos — nunca uses un pronombre ("obsérvala", "reconócela") sin haber nombrado "la mente" en esa misma instrucción, y evita que el par de adjetivos abra la frase sin que "la mente" ya haya sido mencionada o esté a punto de mencionarse en la misma cláusula principal. Preferí estructuras como "Observa la mente: A o B" o "Deja que la mente [verbo], A o B" en vez de "A o B, [verbo] que la mente...". No cierres una instrucción con una afirmación en indicativo sobre la mente después del imperativo inicial (ej. "..., la mente muestra su forma") — esto reintroduce la tercera persona indicativa prohibida en el resto del prompt.

Regla de vocabulario corporal accesible:

Usa solo vocabulario corporal de uso común (pecho, vientre, hombros, manos, pies, espalda, mandíbula), nunca terminología anatómica técnica o clínica (sacro, coxis, omóplato, diafragma, linfa, metabolismo) ni clasificaciones conceptuales como los elementos (tierra, agua, fuego, aire) o sus cualidades (ígneo, acuoso, terroso). Si necesitas nombrar una zona menos habitual, usa la palabra que usaría cualquier persona sin formación médica ni contemplativa (p. ej. "la base de la espalda" en vez de "sacro" o "coxis").

Regla de modo verbal — imperativo obligatorio:

Cada instrucción debe estar formulada como una orden directa en modo imperativo (segunda persona informal: nota, observa, permite, deja, siente, reconoce, vuelve, descansa), nunca como una afirmación en presente indicativo ni en tercera persona.

Correcto: "Nota la mente contraída, tensa, aferrada a algo"
Correcto: "Deja que la respiración sostenga la atención"
Incorrecto (presente indicativo, no es una orden): "Notas una agitación ligera"
Incorrecto (tercera persona, sin destinatario): "La mente se muestra inquieta" / "Hay una pesadez que envuelve la claridad"

Formato de salida:

{FORMATO_ETIQUETAS}

{FINAL_CONSTRAINT}

Asegúrate de que el texto esté escrito con corrección gramatical y ortográfica impecable en español."""


NOTA_INICIO_CIERRE = """Estás generando esta sección de forma aislada del resto de la meditación completa (que incluye otras secciones de desarrollo generadas por separado). Si esta generación incluye bloque de inicio o de cierre, deben ser genéricos: no deben dar por sentado contenido específico de "{SECCION}", porque en la meditación completa se usarán junto a secciones distintas generadas por separado."""


def build_prompt(incluir_inicio, cantidad_bloques, incluir_cierre, seccion, incluir_etiqueta):
    """Construye el prompt de forma condicional.

    Los bloques de inicio y cierre solo se mencionan en las instrucciones cuando
    realmente deben incluirse, evitando que el modelo los genere para toda sección.
    """
    # Descripción ordenada de los tramos que componen esta generación
    bloques = []
    if incluir_inicio == 'sí':
        bloques.append(
            '1. Bloque de inicio: una única instrucción de llegada o asentamiento que ya establezca '
            'la respiración como punto de apoyo (ejemplo de tono: "Encuentra una postura cómoda, '
            'cierra los ojos y permite que la respiración encuentre su propio ritmo").'
        )
    bloques.append(
        f'{len(bloques) + 1}. Bloque de desarrollo (siempre presente): {cantidad_bloques} '
        f'instrucciones correspondientes exclusivamente a la sección "{seccion}".'
    )
    if incluir_cierre == 'sí':
        bloques.append(
            f'{len(bloques) + 1}. Bloque de cierre: una única instrucción para regresar al entorno '
            '(ejemplo de tono: "Abre los ojos lentamente, mueve tu cuerpo despacio y lleva esta calma contigo").'
        )

    if len(bloques) == 1:
        tramos = 'La generación se compone de un único tramo:\n\n' + '\n'.join(bloques)
    else:
        tramos = f'La generación se compone de {len(bloques)} tramos, en este orden:\n\n' + '\n'.join(bloques)

    # Instrucciones de etiquetas: solo mencionan bloques realmente incluidos
    if incluir_etiqueta == 'sí':
        etiquetas_desc = []
        if incluir_inicio == 'sí':
            etiquetas_desc.append('"(inicio)" antes del bloque de inicio')
        etiquetas_desc.append(f'"({seccion})" antes del bloque de desarrollo')
        if incluir_cierre == 'sí':
            etiquetas_desc.append('"(cierre)" antes del bloque de cierre')
        formato_etiquetas = (
            'Antepón las etiquetas en su propia línea, cada una antes de su bloque: '
            + ', '.join(etiquetas_desc)
            + '. Cada etiqueta es un marcador de edición que no se lee en voz alta ni consume tiempo.'
        )
    else:
        formato_etiquetas = 'No incluyas ninguna etiqueta, solo las instrucciones y sus [silencio].'

    # Restricción final del contenido: solo menciona bloques realmente incluidos, en orden
    contenido_parts = []
    if incluir_etiqueta == 'sí' and incluir_inicio == 'sí':
        contenido_parts.append('la etiqueta "(inicio)"')
    if incluir_inicio == 'sí':
        contenido_parts.append('el bloque de inicio')
    if incluir_etiqueta == 'sí':
        contenido_parts.append(f'la etiqueta "({seccion})"')
    contenido_parts.append(f'las {cantidad_bloques} líneas de texto del desarrollo de "{seccion}"')
    if incluir_etiqueta == 'sí' and incluir_cierre == 'sí':
        contenido_parts.append('la etiqueta "(cierre)"')
    if incluir_cierre == 'sí':
        contenido_parts.append('el bloque de cierre')

    final_constraint = (
        'No incluyas cálculos, verificaciones, conteos de palabras, explicaciones ni secciones de control en la salida final. '
        'La salida debe contener única y exclusivamente, en este orden: '
        + ', '.join(contenido_parts)
        + ', con su correspondiente etiqueta [silencio] después de cada instrucción.'
    )

    return DYNAMIC_PROMPT_BASE.format(
        TRAMOS=tramos,
        NOTA_INICIO_CIERRE=NOTA_INICIO_CIERRE.format(SECCION=seccion),
        SECCION=seccion,
        FORMATO_ETIQUETAS=formato_etiquetas,
        FINAL_CONSTRAINT=final_constraint,
    )

def get_s3_client():
    """Create and return an S3 client for Cloudflare R2"""
    return boto3.client(
        's3',
        endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
        region_name='auto'
    )


def download_generation_log_from_r2():
    """Download generation_log.json from R2 bucket"""
    s3 = get_s3_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    try:
        obj = s3.get_object(Bucket=bucket, Key=GENERATION_LOG_R2_KEY)
        content = obj['Body'].read().decode('utf-8')
        log_data = json.loads(content)
        if 'sections' not in log_data:
            log_data['sections'] = {}
        return log_data
    except s3.exceptions.NoSuchKey:
        print("  Generation log not found in R2, starting with empty log.")
        return {"sections": {}}
    except Exception as e:
        raise Exception(f"Failed to download generation log from R2: {e}")


def upload_generation_log_to_r2(log_data):
    """Upload generation_log.json to R2 bucket"""
    s3 = get_s3_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    s3.put_object(
        Bucket=bucket,
        Key=GENERATION_LOG_R2_KEY,
        Body=json.dumps(log_data, ensure_ascii=False, indent=2),
        ContentType='application/json'
    )


def load_generation_log():
    """Load the existing generation_log.json from R2 (with local fallback)"""
    # First try to load from R2
    try:
        return download_generation_log_from_r2()
    except Exception:
        pass
    # Fallback: load from local file
    try:
        with open(GENERATION_LOG_LOCAL_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"sections": {}}


def save_generation_log(log_data):
    """Save generation_log.json locally and upload to R2"""
    # Save locally
    os.makedirs(os.path.dirname(GENERATION_LOG_LOCAL_PATH), exist_ok=True)
    with open(GENERATION_LOG_LOCAL_PATH, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    # Upload to R2
    try:
        upload_generation_log_to_r2(log_data)
    except Exception as e:
        print(f"  Warning: could not upload generation log to R2: {e}")


def generate_dynamic_meditation(incluir_inicio, cantidad_bloques, incluir_cierre, seccion, incluir_etiqueta, max_retries=3):
    """Call the LLM to generate meditation instructions with configurable parameters.

    Args:
        incluir_inicio: "sí" or "no" — whether to include the opening block.
        cantidad_bloques: Number of development instructions to generate.
        incluir_cierre: "sí" or "no" — whether to include the closing block.
        seccion: Section name for the development block (cuerpo, sensaciones, mente, dhammas).
        incluir_etiqueta: "sí" or "no" — whether to include section label markers.
        max_retries: Maximum retry attempts on failure.
    """
    # Build the prompt conditionally so inicio/cierre only appear when included
    formatted_prompt = build_prompt(
        incluir_inicio=incluir_inicio,
        cantidad_bloques=cantidad_bloques,
        incluir_cierre=incluir_cierre,
        seccion=seccion,
        incluir_etiqueta=incluir_etiqueta,
    )

    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {
                        "role": "user",
                        "content": formatted_prompt
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


def upload_to_r2(output_data, r2_filename):
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
        Key=r2_filename,
        Body=json.dumps(output_data, ensure_ascii=False, indent=2),
        ContentType='application/json'
    )


def get_incluir_inicio(seccion):
    """Determine if inicio block should be included based on section."""
    return 'sí' if seccion == 'cuerpo' else 'no'


def get_incluir_cierre(seccion):
    """Determine if cierre block should be included based on section."""
    return 'sí' if seccion == 'cuerpo' else 'no'


def parse_args():
    """Parse command-line arguments for meditation generation parameters."""
    parser = argparse.ArgumentParser(
        description="Generate guided meditation instructions for all sections."
    )
    parser.add_argument(
        '--incluir-etiqueta',
        type=str,
        default='sí',
        choices=['sí', 'no'],
        help='Incluir etiquetas de sección (sí/no)'
    )
    return parser.parse_args()


def generate_section(seccion, variation, incluir_etiqueta):
    """Generate meditation instructions for a single section and save to R2.

    Args:
        seccion: Section name (cuerpo, sensaciones, mente, dhammas).
        variation: Variation number to generate (1-3).
        incluir_etiqueta: "sí" or "no" — whether to include section label markers.
    """
    cantidad_bloques = SECCION_BLOQUES[seccion]
    incluir_inicio = get_incluir_inicio(seccion)
    incluir_cierre = get_incluir_cierre(seccion)

    print(f"\n{'='*60}")
    print(f"Section: {seccion.upper()} | Variation: {variation}")
    print(f"  Bloques: {cantidad_bloques} | Inicio: {incluir_inicio} | Cierre: {incluir_cierre}")
    print(f"{'='*60}")

    # Generate the meditation using the LLM
    print(f"\nGenerating {cantidad_bloques} instructions...", end=" ", flush=True)
    response = generate_dynamic_meditation(
        incluir_inicio=incluir_inicio,
        cantidad_bloques=str(cantidad_bloques),
        incluir_cierre=incluir_cierre,
        seccion=seccion,
        incluir_etiqueta=incluir_etiqueta,
    )
    meditation_id = str(uuid.uuid4())
    current_date = datetime.now().strftime("%Y-%m-%d")
    print(f"✓ Done (id: {meditation_id})")

    # Build filename: variation_{variation}/{seccion}.json
    r2_filename = f"{R2_SCRIPTS_DIR}/variation_{variation}/{seccion}.json"

    output_data = {
        "meditation_content": response.content,
        "reasoning_details": getattr(response, 'reasoning_details', None),
        "model": MODEL_NAME,
        "timestamp": datetime.now().isoformat(),
        "id": meditation_id
    }
    print(f"Uploading to R2: {r2_filename}...", end=" ", flush=True)
    try:
        upload_to_r2(output_data, r2_filename)
        print("✓ Done")
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

    # Load the generation log and update it with the generated file info
    generation_log = load_generation_log()
    section_entry = generation_log['sections'].setdefault(seccion, {"variations": {}})
    if "variations" not in section_entry:
        section_entry["variations"] = {}
    section_entry["variations"][str(variation)] = {
        "date": current_date,
        "model": MODEL_NAME
    }
    save_generation_log(generation_log)

    print(f"  ✓ Section '{seccion}' completed (variation {variation})")
    return True


def main():
    args = parse_args()

    print("=== Dynamic Guided Meditation Generator ===")
    print(f"Generating all sections sequentially")
    print(f"  INCLUIR_ETIQUETA = {args.incluir_etiqueta}")
    print()

    # Load the generation log from R2 (GENERATION_LOG_R2_KEY = "scripts/dynamic_scripts/anapanasati/generation_log.json")
    # and only generate variations that don't already have an entry there.
    generation_log = load_generation_log()

    # Collect all (section, variation) pairs that are missing from the log
    pending = []
    for seccion in SECCION_BLOQUES:
        section_entry = generation_log.get('sections', {}).get(seccion, {})
        variations = section_entry.get('variations', {})
        for variation in range(1, MAX_VARIATIONS + 1):
            if str(variation) not in variations:
                pending.append((seccion, variation))

    total = len(pending)
    success_count = 0

    if not pending:
        print("All sections/variations already present in scripts/dynamic_scripts/anapanasati/generation_log.json (R2). Nothing to generate.")
        print("=" * 60)
        return

    print(f"Generations to run: {total} (out of {len(SECCION_BLOQUES) * MAX_VARIATIONS} possible)")
    print()

    for i, (seccion, variation) in enumerate(pending, 1):
        print(f"\n[{i}/{total}] Processing section '{seccion}' (variation {variation})...")
        ok = generate_section(seccion, variation, args.incluir_etiqueta)
        if ok:
            success_count += 1

    print()
    print("=" * 60)
    print("=== FINAL SUMMARY ===")
    print(f"  Generations completed: {success_count}/{total}")
    print(f"  Pending: {', '.join(f'{s}/v{v}' for s, v in pending)}")
    print("=" * 60)


if __name__ == "__main__":
    main()