
import json
import time
import urllib.request
import urllib.error

# Chafon RFID software running on Windows
CHAFON_URL = "http://127.0.0.1:8888/GetTagInfo"

# SmartStore Flask backend running on Raspberry Pi
SMARTSTORE_URL = "http://192.168.1.88:5001/api/scan/batch"
CART_URL = "http://192.168.1.88:5001/api/cart"

POLL_SECONDS = 0.5


def post_json(url, data=None):
    payload = json.dumps(data).encode("utf-8") if data is not None else b""

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=4) as response:
        return json.load(response)


def get_json(url):
    with urllib.request.urlopen(url, timeout=4) as response:
        return json.load(response)


def main():
    print("Chafon RFID → SmartStore bridge started")
    print("Chafon source:", CHAFON_URL)
    print("SmartStore destination:", SMARTSTORE_URL)
    print("Press Ctrl+C to stop\n")

    forwarded = set()
    last_session_id = None

    while True:
        try:
            # Check the current shopping session.
            cart = get_json(CART_URL)
            current_session_id = cart["session_id"]

            # Reset EPC history when a new customer session starts.
            if last_session_id != current_session_id:
                forwarded.clear()
                last_session_id = current_session_id
                print("New shopping session detected - scan history reset")

            # Get detected RFID tags from Chafon.
            response = post_json(CHAFON_URL)
            data = response.get("data") or {}

            if data.get("res_code") == 1000:
                tags = data.get("taginfo") or []

                # Normalize EPCs and remove already-forwarded tags.
                epcs = sorted({
                    "".join(str(tag.get("m_code", "")).split()).upper()
                    for tag in tags
                } - forwarded - {""})

                if epcs:
                    # Forward new EPCs to SmartStore.
                    result = post_json(
                        SMARTSTORE_URL,
                        {"epcs": epcs}
                    )

                    for item in result.get("results", []):
                        epc = item.get("epc")
                        status = item.get("status")

                        print(f"{epc}: {status}")

                        # Avoid repeatedly forwarding these EPCs
                        # during the same shopping session.
                        if status in ("added", "duplicate", "unknown"):
                            forwarded.add(epc)

            else:
                print("Chafon reader:", data.get("msgB", "Not ready"))

        except (
            urllib.error.URLError,
            TimeoutError,
            OSError,
            ValueError,
            KeyError
        ) as error:
            print("Connection issue:", error)

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nBridge stopped")
