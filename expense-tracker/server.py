#!/usr/bin/env python3
"""SpendWise local server — static files + Grok vision receipt proxy."""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
CONFIG_FILE = ROOT / "config.local.json"
PORT = int(os.environ.get("PORT", "8080"))
GROK_MODEL = os.environ.get("GROK_MODEL", "grok-4")
GROK_API_URL = "https://api.x.ai/v1/chat/completions"

RECEIPT_PROMPT = """Analyze this receipt or expense document image carefully.

Extract every purchasable line item you can read. Respond with ONLY valid JSON — no markdown, no code fences, no commentary.

Use this exact schema:
{
  "merchant": "store or payee name",
  "date": "YYYY-MM-DD",
  "total": 0.00,
  "currency": "USD",
  "items": [
    {
      "name": "item description",
      "qty": 1,
      "price": 0.00,
      "category": "groceries"
    }
  ],
  "notes": ""
}

Rules:
- "price" on each item is the line total (quantity × unit price).
- "total" is the final amount paid (after tax if shown as one total).
- Do NOT include subtotal, tax, change, or payment method lines as items.
- "category" must be one of: groceries, dining, transport, shopping, utilities, health, entertainment, other.
- Use null for date or total only if truly unreadable.
- Read faded, rotated, or low-quality text as best you can.
- Support any language on the receipt; return names as written."""

VALID_CATEGORIES = {
    "groceries", "dining", "transport", "shopping",
    "utilities", "health", "entertainment", "other",
}


def load_config():
    config = {}
    if CONFIG_FILE.exists():
        try:
            config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    api_key = os.environ.get("XAI_API_KEY") or config.get("api_key")
    return {"api_key": api_key, "model": config.get("model", GROK_MODEL)}


def save_api_key(api_key: str):
    config = {}
    if CONFIG_FILE.exists():
        try:
            config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    config["api_key"] = api_key.strip()
    CONFIG_FILE.write_text(json.dumps(config, indent=2), encoding="utf-8")


def extract_json(text: str):
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            return json.loads(match.group())
        raise


def normalize_parsed(data: dict):
    merchant = str(data.get("merchant") or "").strip()
    date = data.get("date")
    if date:
        date = str(date)[:10]

    total = data.get("total")
    if total is not None:
        try:
            total = float(total)
        except (TypeError, ValueError):
            total = None

    items = []
    for raw in data.get("items") or []:
        if not isinstance(raw, dict):
            continue
        name = str(raw.get("name") or "").strip()
        if not name:
            continue
        try:
            qty = max(1, int(raw.get("qty") or 1))
        except (TypeError, ValueError):
            qty = 1
        try:
            price = float(raw.get("price") or 0)
        except (TypeError, ValueError):
            price = 0
        if price <= 0:
            continue
        category = str(raw.get("category") or "other").lower()
        if category not in VALID_CATEGORIES:
            category = "other"
        items.append({"name": name, "qty": qty, "price": price, "category": category})

    return {
        "merchant": merchant,
        "date": date or None,
        "total": total,
        "items": items,
        "notes": str(data.get("notes") or "").strip(),
        "source": "grok",
    }


def call_grok(image_data_url: str, api_key: str, model: str):
    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": image_data_url, "detail": "high"},
                    },
                    {"type": "text", "text": RECEIPT_PROMPT},
                ],
            }
        ],
    }

    req = urllib.request.Request(
        GROK_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(err_body).get("error", {}).get("message", err_body)
        except json.JSONDecodeError:
            detail = err_body
        raise RuntimeError(f"Grok API error ({e.code}): {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Network error: {e.reason}") from e

    content = body["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        )
    parsed = extract_json(content)
    return normalize_parsed(parsed)


class SpendWiseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[SpendWise] " + (fmt % args) + "\n")

    def _send_json(self, status: int, payload: dict):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            cfg = load_config()
            self._send_json(200, {
                "grok_configured": bool(cfg["api_key"]),
                "model": cfg["model"],
            })
            return
        super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/status":
                cfg = load_config()
                self._send_json(200, {
                    "grok_configured": bool(cfg["api_key"]),
                    "model": cfg["model"],
                })
                return

            if self.path == "/api/config":
                if os.environ.get("XAI_API_KEY"):
                    self._send_json(403, {
                        "error": "API key is set on the server — remove XAI_API_KEY from hosting settings to change it in the app.",
                    })
                    return
                body = self._read_json_body()
                api_key = (body.get("api_key") or "").strip()
                if not api_key:
                    self._send_json(400, {"error": "API key is required"})
                    return
                save_api_key(api_key)
                self._send_json(200, {"ok": True, "grok_configured": True})
                return

            if self.path == "/api/analyze-receipt":
                body = self._read_json_body()
                image = body.get("image")
                if not image or not str(image).startswith("data:image/"):
                    self._send_json(400, {"error": "Valid image data URL required"})
                    return

                cfg = load_config()
                if not cfg["api_key"]:
                    self._send_json(401, {
                        "error": "Grok API key not configured. Open Settings to add your xAI API key.",
                    })
                    return

                result = call_grok(str(image), cfg["api_key"], cfg["model"])
                self._send_json(200, result)
                return

            self._send_json(404, {"error": "Not found"})

        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON body"})
        except RuntimeError as e:
            self._send_json(502, {"error": str(e)})
        except Exception as e:
            self._send_json(500, {"error": f"Server error: {e}"})


def main():
    os.chdir(ROOT)
    host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
    server = HTTPServer((host, PORT), SpendWiseHandler)
    print(f"SpendWise running on {host}:{PORT}")
    print("Press Ctrl+C to stop")
    cfg = load_config()
    if cfg["api_key"]:
        print(f"Grok AI: configured (model: {cfg['model']})")
    else:
        print("Grok AI: not configured — open Settings in the app to add your xAI API key")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()


if __name__ == "__main__":
    main()