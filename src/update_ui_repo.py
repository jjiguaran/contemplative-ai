#!/usr/bin/env python3
"""
Script to download the dynamic meditation instruction files from the R2 bucket
and place them in the local web-ui repository.

Workflow:
  1. Connect to R2 using credentials from environment variables.
  2. Download inicio.json, cuerpo.json, sensaciones.json, mente.json,
     dhammas.json and cierre.json from scripts/dynamic_scripts/anapanasati/instructions/.
  3. Save them to web-ui/public/instructions/anapanasati/, replacing any
     existing files with the same name.
"""

import json
import os
import sys
from dotenv import load_dotenv
import boto3

load_dotenv()

# --- Configuration -----------------------------------------------------------
INSTRUCTIONS_R2_DIR = "scripts/dynamic_scripts/anapanasati/instructions"
INSTRUCTION_FILES = ["inicio", "cuerpo", "sensaciones", "mente", "dhammas", "cierre"]

LOCAL_INSTRUCTIONS_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "web-ui",
    "public",
    "instructions",
    "anapanasati",
)


# --- R2 helpers --------------------------------------------------------------
def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def get_bucket_name():
    return os.getenv("R2_BUCKET_NAME")


def download_json_from_r2(s3, bucket, key):
    """Download and parse a JSON file from R2."""
    try:
        obj = s3.get_object(Bucket=bucket, Key=key)
        content = obj["Body"].read().decode("utf-8")
        return json.loads(content)
    except s3.exceptions.NoSuchKey:
        print(f"  File not found in R2: {key}")
        return None
    except Exception as e:
        raise Exception(f"Failed to download {key} from R2: {e}")


# --- Main --------------------------------------------------------------------
def main():
    print("=== Update UI Repo with Dynamic Meditation Instructions ===")
    print("This script will:")
    print("  1. Download the instruction files from R2")
    print("  2. Save them to web-ui/public/instructions/anapanasati/\n")

    # Connect to R2
    s3 = get_s3_client()
    bucket = get_bucket_name()
    if not bucket:
        print("ERROR: R2_BUCKET_NAME environment variable not set.")
        sys.exit(1)

    # Create the local destination directory if it doesn't exist
    os.makedirs(LOCAL_INSTRUCTIONS_DIR, exist_ok=True)

    downloaded = 0
    failed = []

    for file_name in INSTRUCTION_FILES:
        r2_key = f"{INSTRUCTIONS_R2_DIR}/{file_name}.json"
        local_path = os.path.join(LOCAL_INSTRUCTIONS_DIR, f"{file_name}.json")

        print(f"[{downloaded + len(failed) + 1}/{len(INSTRUCTION_FILES)}] Downloading {r2_key}...")
        try:
            data = download_json_from_r2(s3, bucket, r2_key)
            if data is None:
                print(f"  ✗ SKIPPED: {r2_key} not found in R2.")
                failed.append(file_name)
                continue

            with open(local_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"  ✓ Saved to {local_path}")
            downloaded += 1
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            failed.append(file_name)

    print(f"\n  Summary:")
    print(f"    - Files downloaded: {downloaded}/{len(INSTRUCTION_FILES)}")
    if failed:
        print(f"    - Failed: {', '.join(failed)}")

    print("\n=== Done ===")


if __name__ == "__main__":
    main()