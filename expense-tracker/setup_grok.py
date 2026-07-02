#!/usr/bin/env python3
"""One-time Grok API key setup for SpendWise."""

import json
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
CONFIG = ROOT / "config.local.json"

print()
print("=" * 50)
print("  SpendWise — Grok AI Setup")
print("=" * 50)
print()
print("  1. Open: https://console.x.ai/team/default/api-keys")
print("  2. Sign in and click 'Create API Key'")
print("  3. Copy the key (starts with xai-)")
print()

if CONFIG.exists():
    print("  Note: config.local.json already exists.")
    print("  Saving a new key will replace the old one.")
    print()

key = input("  Paste your xAI API key here: ").strip()

if not key:
    print()
    print("  No key entered. Setup cancelled.")
    input("  Press Enter to exit...")
    raise SystemExit(1)

if not key.startswith("xai-"):
    print()
    print("  Warning: xAI keys usually start with 'xai-'.")
    confirm = input("  Use this key anyway? (y/n): ").strip().lower()
    if confirm not in ("y", "yes"):
        print("  Setup cancelled.")
        input("  Press Enter to exit...")
        raise SystemExit(1)

CONFIG.write_text(json.dumps({"api_key": key, "model": "grok-4"}, indent=2), encoding="utf-8")

print()
print("  Saved to config.local.json")
print()
print("  Next steps:")
print("    1. Double-click start.bat")
print("    2. Open http://localhost:8080 in your browser")
print("    3. The terminal should now say: Grok AI: configured")
print()
input("  Press Enter to exit...")