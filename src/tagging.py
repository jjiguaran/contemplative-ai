import os
import json
import re
from datetime import datetime
import boto3
from dotenv import load_dotenv

load_dotenv()

# R2 paths
DYNAMIC_SCRIPTS_R2_DIR = "scripts/dynamic_scripts"
ANAPANASATI_R2_DIR = f"{DYNAMIC_SCRIPTS_R2_DIR}/anapanasati"
INSTRUCTIONS_R2_DIR = f"{ANAPANASATI_R2_DIR}/instructions"
PROCESSING_LOG_R2_KEY = f"{INSTRUCTIONS_R2_DIR}/processing_log.json"
PROCESSING_LOG_LOCAL_PATH = os.path.join(os.path.dirname(__file__), 'dynamic_scripts', 'anapanasati', 'instructions', 'processing_log.json')

# Sections of the anapanasati meditation. Each section has its own input files
# (anapanasati/variation_{variation}/{section}.json, one per variation) and its
# own output file (anapanasati/instructions/{section}.json).
SECTIONS = ['cuerpo', 'sensaciones', 'mente', 'dhammas']

# Number of variations to process per section
MAX_VARIATIONS = 3

# Special sections that are saved to their own dedicated output files
# (anapanasati/instructions/{special}.json) instead of being mixed into the
# per-section repos. These appear within the content of every section's input.
SPECIAL_SECTIONS = ['inicio', 'cierre']

# Maximum number of sentences allowed per section. If the input for a section
# contains more sentences than its limit, the excess sentences are removed,
# keeping the first (limit - 1) sentences plus the last sentence.
SECTION_SENTENCE_LIMITS = {
    'cuerpo': 118,
    'sensaciones': 36,
    'mente': 36,
    'dhammas': 30,
}


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


def load_processing_log():
    """Load the existing processing_log.json from R2 (with local fallback)."""
    try:
        return download_from_r2(PROCESSING_LOG_R2_KEY)
    except Exception:
        pass
    try:
        with open(PROCESSING_LOG_LOCAL_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"sections": {}}


def save_processing_log(log_data):
    """Save processing_log.json locally and upload to R2."""
    os.makedirs(os.path.dirname(PROCESSING_LOG_LOCAL_PATH), exist_ok=True)
    with open(PROCESSING_LOG_LOCAL_PATH, 'w', encoding='utf-8') as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    upload_to_r2(PROCESSING_LOG_R2_KEY, log_data)
    print(f"  Uploaded to R2: {PROCESSING_LOG_R2_KEY}")


def load_section_repo(section):
    """Load the existing instructions/{section}.json from R2 into memory."""
    r2_key = f"{INSTRUCTIONS_R2_DIR}/{section}.json"
    try:
        return download_from_r2(r2_key)
    except Exception:
        return {"sentences": []}


def save_section_repo(section, data):
    """Upload instructions/{section}.json to R2."""
    r2_key = f"{INSTRUCTIONS_R2_DIR}/{section}.json"
    upload_to_r2(r2_key, data)
    print(f"  Uploaded to R2: {r2_key}")


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

        for line in lines:
            stripped_line = line.strip()
            if not stripped_line:
                continue

            # Check if this line is a section marker
            section_match = section_pattern.match(stripped_line)
            if section_match:
                current_section = section_match.group(1)
                continue

            # Any non-empty, non-section-marker line is a sentence
            # Only add if we have a section context (or use the last known section)
            if current_section is not None:
                sentences.append({
                    "section": current_section,
                    "script": stripped_line
                })

    return sentences


def get_variation_from_filename(filename):
    """Extract the variation number from an input path like 'variation_1/cuerpo.json'."""
    match = re.match(r'variation_(\d+)/', filename)
    if match:
        return int(match.group(1))
    return 1


def build_existing_signatures(sentences):
    """
    Build a set of (position, variation) tuples from existing grouped sentences
    to detect duplicates.

    Each entry in the repo is a dict keyed by variation number, e.g.
    {"1": {"script": "..."}, "2": {"script": "..."}}.
    """
    signatures = set()
    for position, entry in enumerate(sentences):
        for variation, inner in entry.items():
            if isinstance(inner, dict) and 'script' in inner:
                signatures.add((position, variation))
    return signatures


def process_sentences_for_repo(repo_name, variations_sentences):
    """
    Process sentences for a given repo, grouping them by position across variations.

    Args:
        repo_name: The repo name (section or special section).
        variations_sentences: A dict mapping variation number to a list of
            {"section": ..., "script": ...} dicts for that variation.

    Returns a summary dict with 'total', 'new', and 'duplicates' counts.
    """
    # Load the repo from R2 into memory
    repo_data = load_section_repo(repo_name)
    existing_sentences = repo_data.get("sentences", [])
    print(f"\n  Existing sentences in instructions/{repo_name}.json: {len(existing_sentences)}")

    if not variations_sentences:
        print("  No sentences to process for this repo.")
        return {"total": len(existing_sentences), "new": 0, "duplicates": 0, "saved": False}

    # Build set of existing signatures to detect duplicates
    existing_signatures = build_existing_signatures(existing_sentences)

    # Group sentences by position across all variations
    # Each position gets a dict: {"1": {"script": "..."}, "2": {"script": "..."}, ...}
    max_len = max(len(sents) for sents in variations_sentences.values())
    grouped_entries = []
    for position in range(max_len):
        entry = {}
        for variation, sents in sorted(variations_sentences.items()):
            if position < len(sents):
                entry[str(variation)] = {
                    "script": sents[position]['script']
                }
        if entry:
            grouped_entries.append(entry)

    # Filter out positions that already exist in the repo
    new_entries = []
    merged_any = False
    for position, entry in enumerate(grouped_entries):
        # Check if this position already exists in the repo
        if position < len(existing_sentences):
            # Position exists - check which variations are new
            existing_entry = existing_sentences[position]
            new_variations = {}
            for variation, data in entry.items():
                if variation not in existing_entry:
                    new_variations[variation] = data
            if new_variations:
                # Merge new variations into the existing entry
                existing_entry.update(new_variations)
                merged_any = True
        else:
            # New position - add the whole entry
            new_entries.append(entry)

    print(f"  {len(new_entries)} new position(s) to add")

    if not new_entries and not merged_any:
        print("  No new sentences to add.")
        return {"total": len(existing_sentences), "new": 0, "duplicates": len(grouped_entries), "saved": False}

    # Append new entries to the repo
    for entry in new_entries:
        existing_sentences.append(entry)

    # Upload to R2
    print()
    print(f"Saving instructions/{repo_name}.json...", end=" ", flush=True)
    save_section_repo(repo_name, repo_data)
    print("✓ Done")

    return {
        "total": len(repo_data['sentences']),
        "new": len(new_entries),
        "duplicates": len(grouped_entries) - len(new_entries),
        "saved": True,
    }


def main():
    print("=== Tagging Script: Parse anapanasati section files into per-section instruction repos ===")
    print()

    # Load the processing log to determine which (section, variation) pairs
    # have already been processed.
    processing_log = load_processing_log()

    for section in SECTIONS:
        print(f"\n{'='*60}")
        print(f"Section: {section.upper()}")
        print(f"{'='*60}")

        # Collect all variations' sentences for this section
        section_variations = {}  # variation -> list of section sentences
        special_variations = {special: {} for special in SPECIAL_SECTIONS}  # special -> variation -> list

        for variation in range(1, MAX_VARIATIONS + 1):
            # Check if this section/variation has already been processed
            section_entry = processing_log.get('sections', {}).get(section, {})
            variations = section_entry.get('variations', {})
            if str(variation) in variations:
                print(f"\n  ⏭️  Skipping {section}/variation_{variation}: already in processing log.")
                continue

            # 1. Load the meditation file for this section/variation from R2
            input_filename = f"variation_{variation}/{section}.json"
            r2_key = f"{ANAPANASATI_R2_DIR}/{input_filename}"
            print(f"\nDownloading {r2_key} from R2...", end=" ", flush=True)
            try:
                meditation_data = download_from_r2(r2_key)
                print("✓ Done")
            except Exception as e:
                print(f"✗ Error: {e}")
                continue

            meditation_content = meditation_data.get("meditation_content", "")
            if not meditation_content:
                print("✗ Error: 'meditation_content' field is empty or missing.")
                continue

            print(f"  Variation: {variation}")
            print()

            # 2. Parse the content into sentences
            print("Parsing meditation content...", end=" ", flush=True)
            parsed_sentences = parse_meditation_content(meditation_content)
            print(f"✓ Found {len(parsed_sentences)} sentences")

            if not parsed_sentences:
                print("✗ Error: No sentences were parsed from the content.")
                continue

            # 2.5. Split the parsed sentences by their section. The current
            # section's sentences go to the section repo, while the special
            # sections (inicio, cierre) go to their own dedicated repos.
            section_sentences = [s for s in parsed_sentences if s['section'] == section]

            # 3. Enforce the sentence limit for the current section only.
            # If the input contains more sentences than the limit, keep the first
            # (limit - 1) sentences plus the last sentence.
            limit = SECTION_SENTENCE_LIMITS.get(section)
            if limit is not None and len(section_sentences) > limit:
                removed_count = len(section_sentences) - limit
                print(f"\n  Section '{section}' has {len(section_sentences)} sentences, "
                      f"exceeding the limit of {limit}.")
                print(f"  Removing {removed_count} sentence(s), keeping the first "
                      f"{limit - 1} sentence(s) plus the last one...")
                section_sentences = section_sentences[:limit - 1] + section_sentences[-1:]
                print(f"  Now {len(section_sentences)} sentences.")

            # Store the section sentences for this variation
            section_variations[variation] = section_sentences

            # Store special section sentences for this variation
            for special in SPECIAL_SECTIONS:
                special_sentences_list = [s for s in parsed_sentences if s['section'] == special]
                if special_sentences_list:
                    special_variations[special][variation] = special_sentences_list

        # 4. Process the current section's sentences into its repo (grouped by position)
        if section_variations:
            print(f"\n  --- Processing section '{section}' (all variations) ---")
            section_summary = process_sentences_for_repo(section, section_variations)

            # 5. Process the special sections (inicio, cierre) into their own repos
            for special in SPECIAL_SECTIONS:
                if special_variations[special]:
                    print(f"\n  --- Processing special section '{special}' (all variations) ---")
                    process_sentences_for_repo(special, special_variations[special])

            # 6. Update the processing log only if the section repo was actually
            # saved. If it wasn't (e.g. no changes were made), the variations
            # should remain unmarked so they can be re-processed next time.
            if section_summary.get('saved', False):
                current_date = datetime.now().strftime("%Y-%m-%d")
                section_entry = processing_log['sections'].setdefault(section, {"variations": {}})
                if "variations" not in section_entry:
                    section_entry["variations"] = {}
                for variation in section_variations:
                    section_entry["variations"][str(variation)] = {
                        "date": current_date
                    }
                save_processing_log(processing_log)

            # Summary
            print()
            print(f"  Total sentences in {section}.json: {section_summary['total']}")
            print(f"  New positions added:               {section_summary['new']}")

    print("\n=== All sections processed ===")


if __name__ == "__main__":
    main()