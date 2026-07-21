import os
import json
import re
import boto3
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# R2 paths
DYNAMIC_SCRIPTS_R2_DIR = "scripts/dynamic_scripts"
LOCAL_DYNAMIC_SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), 'dynamic_scripts')

R2_SENTENCES_FILENAME = "scripts/dynamic_scripts/sentences_repo.json"
LOCAL_SENTENCES_PATH = os.path.join(LOCAL_DYNAMIC_SCRIPTS_DIR, 'sentences_repo.json')

DYNAMIC_MEDITATION_FILENAME = "anapanasati_1.json"


def get_s3_client():
    """Create and return an S3 client for Cloudflare R2"""
    return boto3.client(
        's3',
        endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
        region_name='auto'
    )


def download_from_r2(r2_key):
    """Download a JSON file from R2 and return its contents as a dict."""
    s3 = get_s3_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    try:
        obj = s3.get_object(Bucket=bucket, Key=r2_key)
        content = obj['Body'].read().decode('utf-8')
        return json.loads(content)
    except Exception as e:
        raise Exception(f"Failed to download {r2_key} from R2: {e}")


def upload_to_r2(r2_key, data):
    """Upload JSON data to R2."""
    s3 = get_s3_client()
    bucket = os.getenv('R2_BUCKET_NAME')
    s3.put_object(
        Bucket=bucket,
        Key=r2_key,
        Body=json.dumps(data, ensure_ascii=False, indent=2),
        ContentType='application/json'
    )


def load_sentences_repo():
    """Load the existing sentences_repo.json from R2 (with local fallback)."""
    # First try from R2
    try:
        return download_from_r2(R2_SENTENCES_FILENAME)
    except Exception:
        pass
    # Fallback: load from local file
    try:
        with open(LOCAL_SENTENCES_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"sentences": []}


def save_sentences_repo(data):
    """Save sentences_repo.json locally and upload to R2."""
    # Save locally
    os.makedirs(LOCAL_DYNAMIC_SCRIPTS_DIR, exist_ok=True)
    with open(LOCAL_SENTENCES_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    # Upload to R2
    try:
        upload_to_r2(R2_SENTENCES_FILENAME, data)
        print(f"  Uploaded to R2: {R2_SENTENCES_FILENAME}")
    except Exception as e:
        print(f"  Warning: could not upload to R2: {e}")


def parse_meditation_content(content):
    """
    Parse the meditation_content string and extract sentences with their sections.

    The format is:
    (section_name)
    sentence text
    [silencio]

    Returns a list of dicts: [{"section": "inicio", "script": "sentence text"}, ...]
    """
    # Normalize line endings and strip leading/trailing whitespace
    content = content.strip()

    # Section markers we look for
    section_pattern = re.compile(r'^\((\w+)\)\s*$', re.MULTILINE)

    # Split content by [silencio] to get blocks
    blocks = content.split('[silencio]')

    sentences = []
    current_section = None

    for block in blocks:
        block = block.strip()
        if not block:
            continue

        # Check for section markers in the block
        # Split block into lines to find section markers and sentence text
        lines = block.split('\n')
        section_found_in_block = False

        for line in lines:
            stripped_line = line.strip()
            if not stripped_line:
                continue

            # Check if this line is a section marker
            section_match = section_pattern.match(stripped_line)
            if section_match:
                current_section = section_match.group(1)
                section_found_in_block = True
                continue

            # Any non-empty, non-section-marker line is a sentence
            # Only add if we have a section context (or use the last known section)
            if current_section is not None:
                sentences.append({
                    "section": current_section,
                    "script": stripped_line
                })

        # If no section marker was found in this block but we have current_section,
        # the sentence was already added when processing the lines

    return sentences


def get_last_sentence_id(sentences):
    """Get the highest existing sentence ID number to generate the next one."""
    max_num = 0
    for s in sentences:
        sid = s.get('id', '')
        match = re.match(r'grd_(\d+)', sid)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return max_num


def generate_sentence_id(index, existing_max=0):
    """Generate a sentence ID in the format grd_XXX."""
    num = existing_max + index + 1
    return f"grd_{num:03d}"


def build_existing_signatures(sentences):
    """
    Build a set of (section, script) tuples from existing sentences
    to detect duplicates.
    """
    return {(s['section'], s['script']) for s in sentences}


def main():
    print("=== Tagging Script: Parse anapanasati_1.json into sentences ===")
    print()

    # 1. Load the meditation file from R2
    r2_key = f"{DYNAMIC_SCRIPTS_R2_DIR}/{DYNAMIC_MEDITATION_FILENAME}"
    print(f"Downloading {r2_key} from R2...", end=" ", flush=True)
    try:
        meditation_data = download_from_r2(r2_key)
        print("✓ Done")
    except Exception as e:
        print(f"✗ Error: {e}")
        return

    meditation_content = meditation_data.get("meditation_content", "")
    if not meditation_content:
        print("✗ Error: 'meditation_content' field is empty or missing.")
        return

    model = meditation_data.get("model", "unknown")
    date_generated = meditation_data.get("timestamp", datetime.now().strftime("%Y-%m-%d"))

    # Convert timestamp to date format YYYY-MM-DD if needed
    if 'T' in date_generated:
        date_generated = date_generated.split('T')[0]

    print(f"  Model: {model}")
    print(f"  Date: {date_generated}")
    print()

    # 2. Parse the content into sentences
    print("Parsing meditation content...", end=" ", flush=True)
    parsed_sentences = parse_meditation_content(meditation_content)
    print(f"✓ Found {len(parsed_sentences)} sentences")

    if not parsed_sentences:
        print("✗ Error: No sentences were parsed from the content.")
        return

    # Print a preview
    print()
    print("  Preview (first 3 sentences):")
    for s in parsed_sentences[:3]:
        print(f"    [{s['section']}] {s['script'][:60]}...")

    # 3. Load existing sentences repo
    print()
    print("Loading existing sentences_repo.json...", end=" ", flush=True)
    repo_data = load_sentences_repo()
    existing_sentences = repo_data.get("sentences", [])
    print(f"✓ {len(existing_sentences)} existing sentences")

    # 4. Build set of existing signatures to detect duplicates
    existing_signatures = build_existing_signatures(existing_sentences)

    # 5. Filter out duplicates
    new_sentences_to_add = []
    for s in parsed_sentences:
        sig = (s['section'], s['script'])
        if sig not in existing_signatures:
            new_sentences_to_add.append(s)

    print(f"  {len(new_sentences_to_add)} new sentences to add "
          f"({len(parsed_sentences) - len(new_sentences_to_add)} duplicates skipped)")

    if not new_sentences_to_add:
        print("  No new sentences to add.")
        return

    # 6. Assign IDs
    existing_max = get_last_sentence_id(existing_sentences)

    new_entries = []
    for i, s in enumerate(new_sentences_to_add):
        entry = {
            "id": generate_sentence_id(i, existing_max),
            "script": s['script'],
            "section": s['section'],
            "date": date_generated,
            "model": model
        }
        new_entries.append(entry)

    # 7. Append to the repo
    repo_data["sentences"].extend(new_entries)

    # 8. Save
    print()
    print("Saving sentences_repo.json...", end=" ", flush=True)
    save_sentences_repo(repo_data)
    print("✓ Done")

    # Summary
    print()
    print("=== Summary ===")
    print(f"Total sentences in repo: {len(repo_data['sentences'])}")
    print(f"New sentences added:     {len(new_entries)}")
    print(f"First ID:                {new_entries[0]['id']}")
    print(f"Last ID:                 {new_entries[-1]['id']}")


if __name__ == "__main__":
    main()