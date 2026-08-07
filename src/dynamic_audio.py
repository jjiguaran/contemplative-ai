# cell 1
# Install qwen-tts and soundfile
!pip install -q qwen-tts soundfile
!pip install -q boto3
!pip install -q pydub

# Optional but recommended: FlashAttention 2 for lower VRAM usage
# (takes ~5 min to compile — skip if you're in a hurry)
# !pip install -q flash-attn --no-build-isolation

print('✅ Dependencies installed')

import torch
import soundfile as sf
from IPython.display import Audio, display
from qwen_tts import Qwen3TTSModel
from pydub import AudioSegment

# ── Choose your model ──────────────────────────────────────────────────────
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
# ──────────────────────────────────────────────────────────────────────────

print(f'Loading {MODEL_ID} ...')
model = Qwen3TTSModel.from_pretrained(
    MODEL_ID,
    device_map="cuda:0",
    dtype=torch.bfloat16,
)
print('✅ Model loaded')

# Show available speakers (only relevant for CustomVoice models)
if hasattr(model, 'get_supported_speakers'):
    print('\nAvailable speakers:', model.get_supported_speakers())
    print('Available languages:', model.get_supported_languages())

# ── Configure ──────────────────────────────────────────────────────────────
LANGUAGE     = "Spanish"
VOICE_DESC   = """
Soft, female voice, mid-range, very slow and deliberate pace. Argentinian accent.
Slightly breathy, with a warm resonance. Like a whisper that fills the room.
Each word is spaced with intention. Calm to the point of near-stillness.
"""


# cell 2
import json
import getpass
import re
import uuid
from datetime import datetime
from pathlib import Path
import boto3
from botocore.exceptions import NoCredentialsError, ClientError
import numpy as np

# ── Configuration ───────────────────────────────────────────────────────────
INSTRUCTIONS_R2_DIR = "scripts/dynamic_scripts/anapanasati/instructions"
INSTRUCTION_FILES = ["inicio", "cuerpo", "sensaciones", "mente", "dhammas", "cierre"]

GENERATION_LOG_R2_KEY = "meditations/dynamic_audio/anapanasati/generation_log.json"

VOICE_FILENAME = "tmpteeduw43.mp3"
REF_TEXT = "Siéntate con comodidad, cierra los ojos suavemente. Siente cómo tu cuerpo respira solo."

HUM_LEVEL = 0.00005  # organic background hum level
TARGET_SR = 24000

TARGET_DURATION = 10  # target total duration in seconds for each sentence


def get_r2_credentials():
    """Prompt for R2 credentials securely"""
    print("🔐 Please enter your R2 credentials:")
    access_key = getpass.getpass("Access Key ID: ")
    secret_key = getpass.getpass("Secret Access Key: ")
    account_id = getpass.getpass("Account ID: ")
    bucket_name = getpass.getpass("Bucket Name: ")
    
    return {
        'access_key': access_key,
        'secret_key': secret_key,
        'account_id': account_id,
        'bucket_name': bucket_name
    }


def connect_to_r2(credentials):
    """Create R2 connection"""
    return boto3.client(
        's3',
        endpoint_url=f'https://{credentials["account_id"]}.r2.cloudflarestorage.com',
        aws_access_key_id=credentials['access_key'],
        aws_secret_access_key=credentials['secret_key'],
        region_name='auto'
    )


def read_json_from_r2(r2_client, bucket_name, file_key):
    """Read JSON file from R2"""
    try:
        response = r2_client.get_object(Bucket=bucket_name, Key=file_key)
        json_content = response['Body'].read().decode('utf-8')
        return json.loads(json_content)
    except Exception as e:
        print(f"  ❌ Error reading JSON from R2: {e}")
        return None


def upload_json_to_r2(r2_client, bucket_name, file_key, data):
    """Upload a dictionary as JSON to R2"""
    try:
        json_bytes = json.dumps(data, indent=2, ensure_ascii=False).encode('utf-8')
        r2_client.put_object(Bucket=bucket_name, Key=file_key, Body=json_bytes)
        print(f"  ✅ Updated: {file_key}")
        return True
    except Exception as e:
        print(f"  ❌ Error uploading JSON to R2: {e}")
        return False


def download_from_r2(r2_client, bucket_name, file_key, local_path="/tmp/"):
    """Download any file from R2 to local storage"""
    try:
        filename = file_key.split('/')[-1]
        local_file_path = f"{local_path}{filename}"
        r2_client.download_file(bucket_name, file_key, local_file_path)
        print(f"  ✅ Downloaded: {local_file_path}")
        return local_file_path
    except Exception as e:
        print(f"  ❌ Error downloading file {file_key}: {e}")
        return None


def upload_file_to_r2(r2_client, bucket_name, local_path, key):
    """Upload a local file to R2"""
    try:
        r2_client.upload_file(local_path, bucket_name, key)
        print(f"  ✅ Uploaded: {key}")
        return key
    except Exception as e:
        print(f"  ❌ Error uploading to {key}: {e}")
        return None


def load_audio_as_numpy(audio_path, target_sr=TARGET_SR):
    """Load audio file and convert to mono float32 numpy array at target_sr."""
    audio = AudioSegment.from_file(audio_path)
    audio = audio.set_frame_rate(target_sr)
    if audio.channels > 1:
        audio = audio.set_channels(1)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
    return samples, target_sr


def generate_speech_segment(model, text, language, reference_audio_path, ref_text, instruct):
    """Generate a single speech segment using voice cloning."""
    clean_line = text.strip()
    if not clean_line.endswith(('.', ',', '?', '!', '...')):
        clean_line += "..."

    wavs, sr = model.generate_voice_clone(
        text=clean_line,
        language=language,
        ref_audio=reference_audio_path,
        ref_text=ref_text,
        instruct=instruct,
    )

    signal = wavs[0]
    if sr != TARGET_SR:
        from scipy import signal as scipy_signal
        signal = scipy_signal.resample(signal, int(len(signal) * TARGET_SR / sr))

    # ─── Fade to organic background hum ───
    buffer_duration = 0.50
    buffer_samples = int(buffer_duration * TARGET_SR)
    comfort_tail = np.random.normal(0, HUM_LEVEL, buffer_samples).astype(np.float32)
    extended_signal = np.concatenate([signal, comfort_tail])

    # 400 ms exponential fade-out on voice only
    fade_duration = 0.40
    fade_samples = int(fade_duration * TARGET_SR)
    if len(extended_signal) > fade_samples:
        fade_window = np.logspace(0, -3, num=fade_samples, base=10.0)
        fade_window = (fade_window - fade_window[-1]) / (fade_window[0] - fade_window[-1])
        fade_chunk = extended_signal[-fade_samples:]
        constant_hum = np.random.normal(0, HUM_LEVEL, fade_samples).astype(np.float32)
        extended_signal[-fade_samples:] = (fade_chunk * fade_window) + (constant_hum * (1.0 - fade_window))

    return extended_signal.astype(np.float32)


def generate_silence_audio(duration_seconds):
    """Generate comfort noise for the given duration."""
    num_samples = int(duration_seconds * TARGET_SR)
    return np.random.normal(0, HUM_LEVEL, num_samples).astype(np.float32)


def export_audio_to_opus(audio_data, sr, output_path):
    """Export float32 numpy audio to Opus file."""
    audio_segment = AudioSegment(
        (audio_data * 32768).astype(np.int16).tobytes(),
        frame_rate=sr,
        sample_width=2,
        channels=1
    )
    audio_segment.export(output_path, format="opus")


# cell 3
try:
    # 1. Connect to R2
    print("🔐 Connecting to Cloudflare R2...")
    credentials = get_r2_credentials()
    r2 = connect_to_r2(credentials)
    r2.head_bucket(Bucket=credentials['bucket_name'])
    print("✅ R2 connection successful")

    # 2. Find and download the voice file for cloning
    print(f"\n🎙️ Finding voice file '{VOICE_FILENAME}' in R2...")
    voice_key = None
    try:
        resp = r2.list_objects_v2(Bucket=credentials['bucket_name'], Prefix='voices/')
        for obj in resp.get('Contents', []):
            key = obj['Key']
            if key.endswith(f"/{VOICE_FILENAME}") or key == f"voices/{VOICE_FILENAME}":
                voice_key = key
                break
    except Exception as e:
        print(f"   ⚠️ Error listing voices: {e}")

    if voice_key is None:
        print(f"❌ Voice file '{VOICE_FILENAME}' not found in R2 voices/ directory.")
    else:
        reference_audio_path = download_from_r2(r2, credentials['bucket_name'], voice_key)
        if not reference_audio_path:
            print("❌ Failed to download voice file.")
        else:
            temp_files_to_clean = [reference_audio_path]
            total_updated = 0

            # 3. Process each instruction file
            for file_name in INSTRUCTION_FILES:
                file_key = f"{INSTRUCTIONS_R2_DIR}/{file_name}.json"
                print(f"\n{'='*60}")
                print(f"📖 Processing instruction file: {file_name}")
                print(f"   R2 key: {file_key}")
                print(f"{'='*60}")

                # Load the instruction file from R2
                file_data = read_json_from_r2(r2, credentials['bucket_name'], file_key)
                if file_data is None:
                    print(f"   ❌ Could not read {file_key} from R2. Skipping.")
                    continue

                sentences = file_data.get('sentences', [])
                if not sentences:
                    print(f"   ⚠️ No sentences found in {file_name}. Skipping.")
                    continue

                print(f"   📝 Found {len(sentences)} sentences in {file_name}")

                batch_id = str(uuid.uuid4())
                updated_count = 0
                processed_variations = set()

                for idx, sentence in enumerate(sentences):
                    # Each sentence is a dict like {"1": {"script": "..."}, "2": {"script": "..."}}
                    if not isinstance(sentence, dict) or len(sentence) == 0:
                        print(f"   [{idx+1}/{len(sentences)}] ⚠️ Unexpected sentence structure, skipping: {sentence}")
                        continue

                    position_num = idx + 1

                    for sentence_id, sentence_data in sentence.items():
                        if not isinstance(sentence_data, dict):
                            print(f"   [{idx+1}/{len(sentences)}] ⚠️ Unexpected sentence data for variation {sentence_id}, skipping: {sentence_data}")
                            continue

                        script_text = sentence_data.get('script', '')

                        # Skip if already has audio
                        if sentence_data.get('audioUrl'):
                            print(f"   [{idx+1}/{len(sentences)}] ⏭️  Skipping {file_name}/variation_{sentence_id}/instruction_{position_num}: already has audio")
                            continue

                        if not script_text:
                            print(f"   [{idx+1}/{len(sentences)}] ⏭️  Skipping {file_name}/variation_{sentence_id}/instruction_{position_num}: no script text")
                            continue

                        print(f"\n   [{idx+1}/{len(sentences)}] Generating audio for {file_name}/variation_{sentence_id}/instruction_{position_num}...")
                        print(f"       Script: {script_text[:60]}{'...' if len(script_text) > 60 else ''}")

                        # Generate speech for the sentence text
                        speech_audio = generate_speech_segment(
                            model, script_text, LANGUAGE, reference_audio_path, REF_TEXT, VOICE_DESC
                        )

                        # Pad with comfort noise to reach exactly TARGET_DURATION seconds
                        speech_duration = len(speech_audio) / TARGET_SR
                        silence_needed = TARGET_DURATION - speech_duration
                        if silence_needed > 0:
                            silence_audio = generate_silence_audio(silence_needed)
                            segment_audio = np.concatenate([speech_audio, silence_audio])
                        else:
                            segment_audio = speech_audio

                        # Export to Opus
                        segment_id = f"{batch_id}_{file_name}_{sentence_id}_{position_num}"
                        local_opus = f"/tmp/dynamic_segment_{segment_id}.opus"
                        temp_files_to_clean.append(local_opus)

                        export_audio_to_opus(segment_audio, TARGET_SR, local_opus)

                        # Upload to R2: meditations/dynamic_audio/anapanasati/{section}/variation_{variation}/instruction_{position}.opus
                        variation_num = sentence_id
                        segment_r2_key = f"meditations/dynamic_audio/anapanasati/{file_name}/variation_{variation_num}/instruction_{position_num}.opus"
                        result = upload_file_to_r2(r2, credentials['bucket_name'], local_opus, segment_r2_key)
                        if result:
                            # Update the sentence with audioUrl only (no TTS_model field)
                            sentence_data['audioUrl'] = segment_r2_key
                            duration = len(segment_audio) / TARGET_SR
                            print(f"       ✅ Uploaded ({duration:.1f}s): {segment_r2_key}")
                            updated_count += 1
                            processed_variations.add(sentence_id)

                            # Update the input file in R2 immediately after each generation
                            upload_json_to_r2(r2, credentials['bucket_name'], file_key, file_data)

                            # Also update the local copy if it exists
                            local_file_path = Path.cwd() / 'src' / 'dynamic_scripts' / 'anapanasati' / 'instructions' / f'{file_name}.json'
                            if local_file_path.exists():
                                with open(local_file_path, 'w', encoding='utf-8') as f:
                                    json.dump(file_data, f, ensure_ascii=False, indent=2)
                        else:
                            print(f"       ❌ Failed to upload segment for {file_name}/variation_{sentence_id}/instruction_{position_num}")

                if updated_count > 0:
                    # Update the generation log in R2
                    print(f"\n📋 Updating generation log...")
                    gen_log = read_json_from_r2(r2, credentials['bucket_name'], GENERATION_LOG_R2_KEY)
                    if gen_log is None:
                        gen_log = {"sections": {}}
                    if "sections" not in gen_log:
                        gen_log["sections"] = {}

                    section_entry = gen_log["sections"].setdefault(file_name, {"variations": {}})
                    if "variations" not in section_entry:
                        section_entry["variations"] = {}

                    today = datetime.now().strftime("%Y-%m-%d")
                    for variation in processed_variations:
                        section_entry["variations"][str(variation)] = {
                            "date": today,
                            "model": MODEL_ID
                        }

                    upload_json_to_r2(r2, credentials['bucket_name'], GENERATION_LOG_R2_KEY, gen_log)

                    # Also update the local generation log if it exists
                    local_gen_log_path = Path.cwd() / 'src' / 'dynamic_scripts' / 'anapanasati' / 'generation_log.json'
                    if local_gen_log_path.exists():
                        with open(local_gen_log_path, 'w', encoding='utf-8') as f:
                            json.dump(gen_log, f, ensure_ascii=False, indent=2)
                else:
                    print(f"\n   No new sentences to process in {file_name} — all already have audio.")

                total_updated += updated_count

            # Clean up temp files
            for tmp in temp_files_to_clean:
                try:
                    Path(tmp).unlink(missing_ok=True)
                except Exception:
                    pass

            print()
            print("=== Summary ===")
            print(f"✅ Dynamic audio generation complete.")
            print(f"   Sentences processed : {total_updated}")
            print(f"   Files processed     : {len(INSTRUCTION_FILES)}")
            print(f"   Model               : {MODEL_ID}")

except NoCredentialsError:
    print("❌ Invalid R2 credentials")
except ClientError as e:
    print(f"❌ R2 Client Error: {e}")
except Exception as e:
    print(f"❌ Unexpected error: {e}")