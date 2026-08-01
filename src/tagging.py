import os
import json
import re
import boto3
from dotenv import load_dotenv

load_dotenv()

# R2 paths
DYNAMIC_SCRIPTS_R2_DIR = "scripts/dynamic_scripts"
ANAPANASATI_R2_DIR = f"{DYNAMIC_SCRIPTS_R2_DIR}/anapanasati"
INSTRUCTIONS_R2_DIR = f"{ANAPANASATI_R2_DIR}/instructions"

# Sections of the anapanasati meditation. Each section has its own input file
# (anapanasati/{section}_1.json) and its own output file
# (anapanasati/instructions/{section}.json).
SECTIONS = ['cuerpo', 'sensaciones', 'mente', 'dhammas']

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


def get_variation_from_filename(filename):
    """Extract the variation number from an input filename like 'cuerpo_1.json'."""
    match = re.match(r'\w+_(\d+)\.json$', filename)
    if match:
        return int(match.group(1))
    return 1


def build_existing_signatures(sentences):
    """
    Build a set of (section, script) tuples from existing sentences
    to detect duplicates.
    """
    return {(s['section'], s['script']) for s in sentences}


def main():
    print("=== Tagging Script: Parse anapanasati section files into per-section instruction repos ===")
    print()

    for section in SECTIONS:
        print(f"\n{'='*60}")
        print(f"Section: {section.upper()}")
        print(f"{'='*60}")

        # 1. Load the meditation file for this section from R2
        input_filename = f"{section}_1.json"
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

        variation = get_variation_from_filename(input_filename)
        print(f"  Variation: {variation}")
        print()

        # 2. Parse the content into sentences
        print("Parsing meditation content...", end=" ", flush=True)
        parsed_sentences = parse_meditation_content(meditation_content)
        print(f"✓ Found {len(parsed_sentences)} sentences")

        if not parsed_sentences:
            print("✗ Error: No sentences were parsed from the content.")
            continue

        # 2.5. Enforce the sentence limit for this section.
        # If the input contains more sentences than the limit, keep the first
        # (limit - 1) sentences plus the last sentence.
        limit = SECTION_SENTENCE_LIMITS.get(section)
        if limit is not None and len(parsed_sentences) > limit:
            removed_count = len(parsed_sentences) - limit
            print(f"\n  Section '{section}' has {len(parsed_sentences)} sentences, "
                  f"exceeding the limit of {limit}.")
            print(f"  Removing {removed_count} sentence(s), keeping the first "
                  f"{limit - 1} sentence(s) plus the last one...")
            parsed_sentences = parsed_sentences[:limit - 1] + parsed_sentences[-1:]
            print(f"  Now {len(parsed_sentences)} sentences.")

        # Print a preview
        print()
        print("  Preview (first 3 sentences):")
        for s in parsed_sentences[:3]:
            print(f"    [{s['section']}] {s['script'][:60]}...")

        # 3. Load the section repo from R2 into memory
        repo_data = load_section_repo(section)
        existing_sentences = repo_data.get("sentences", [])
        print(f"\n  Existing sentences in instructions/{section}.json: {len(existing_sentences)}")

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
            continue

        # 6. Build new entries with the variation from the input filename
        new_entries = []
        for s in new_sentences_to_add:
            entry = {
                "variation": variation,
                "script": s['script'],
                "section": s['section'],
            }
            new_entries.append(entry)

        # 7. Append to the section repo
        repo_data["sentences"].extend(new_entries)

        # 8. Upload to R2
        print()
        print(f"Saving instructions/{section}.json...", end=" ", flush=True)
        save_section_repo(section, repo_data)
        print("✓ Done")

        # Summary
        print()
        print(f"  Total sentences in {section}.json: {len(repo_data['sentences'])}")
        print(f"  New sentences added:               {len(new_entries)}")
        print(f"  Variation:                         {variation}")

    print("\n=== All sections processed ===")


if __name__ == "__main__":
    main()