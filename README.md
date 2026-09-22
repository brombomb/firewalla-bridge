# Firewalla Local Bridge

A lightweight, modular, self-hosted Docker bridge that connects directly to your Firewalla box's local API and translates it into clean REST endpoints compatible with **Home Assistant**, **Tronbyt**, and custom homelab dashboards.

**No paid Firewalla MSP subscription required.** Works with standalone Firewalla boxes (Purple, Gold, Red, Blue) and boxes on MSP Lite.

---

## ✨ Features

* **Zero Cloud Dependency:** Communicates directly with your Firewalla box over your local LAN.
* **MSP REST Compatibility:** Emulates standard Firewalla MSP endpoints.
* **One-Step QR Pairing:** Built-in pairing wizard handles cryptographic key generation.
* **Smart Alarm Filtering:** Automatically filters out muted notifications and exception/whitelisted rules to match real security events.
* **Bonded NIC / Multi-MAC Merging:** Aggregates multi-NIC servers (e.g. LACP or `balance-alb` bonds) into a single virtual device.
* **Optional Token Authentication:** Protects sensitive LAN device telemetry with standard headers.

---

## 🚀 Quick Setup Guide

### Step 1: Clone the Repository

```bash
git clone https://github.com/brombomb/firewalla-bridge.git
cd firewalla-bridge
```

### Step 2: One-Time Pairing with Your Firewalla Box

The pairing step registers your bridge container as an authorized local client on your Firewalla box:

1. Open the **Firewalla App** on your phone.
2. Select your box and go to: **Settings → Advanced → Allow Additional Pairing**.
3. Toggle **Additional Pairing** to **ON**. A QR code will appear on your screen.
4. Scan or screenshot the QR code and copy the raw JSON text (it looks like `{"gid":"...","seed":"...","license":"...","ek":"...","ipaddress":"..."}`).
5. In your `firewalla-bridge` directory, run:
   ```bash
   docker compose run --rm firewalla-bridge npm run pair
   ```
6. Follow the prompts:
   * **Email label:** Enter an identifier (e.g. `dashboard@home.local` — used only for display in the app).
   * **QR code JSON:** Paste the JSON string from step 4.
   * **Firewalla IP:** Enter your Firewalla box's local LAN IP (e.g. `192.168.1.1`).
7. The pairing script generates your cryptographic keys.

### Step 3: Start the Bridge

Run in the background:
```bash
docker compose up -d
```

Verify that the bridge is running and connected:
```bash
curl http://localhost:7153/health
```

Expected response:
```json
{
  "status": "connected",
  "firewallaIp": "192.168.1.1",
  "boxName": "Firewalla Purple",
  "cachedDevices": 105,
  "cachedAlarms": 34
}
```

---

## ⚙️ Configuration & Environment Variables

You can configure options in `docker-compose.yml` or a `.env` file:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `7153` | Port for the bridge HTTP server |
| `FIREWALLA_IP` | `192.168.1.1` | LAN IP of your Firewalla box |
| `KEY_DIR` | `/app/keys` | Directory inside container storing `etp.*.pem` |
| `BOX_NAME` | *(auto-detected)* | Custom display name override for your box |
| `CORS_ORIGIN` | `*` | Allowed CORS origin (set to specific domain or LAN subnet to harden) |
| `API_TOKEN` | *(disabled)* | If set, requires `Authorization: Token <token>` or `Bearer <token>` |
| `MERGE_DEVICES` | *(empty)* | Rules to aggregate multi-NIC / bonded servers (`Name\|IP\|MAC1,MAC2`) |

### 🔒 Securing with an API Token (Optional)

To prevent unauthorized devices on your LAN from accessing network telemetry:
1. Add `API_TOKEN=your_secret_token` to your environment.
2. Supply the header in your requests:
   ```bash
   curl -H "Authorization: Token your_secret_token" http://localhost:7153/v2/devices
   ```

### 🔗 Merging Bonded Interfaces (Optional)

If you have a home server or NAS using link aggregation (e.g. Linux `bond0` in `balance-alb` or `802.3ad` mode), Firewalla sees traffic across multiple physical MAC addresses. You can merge them into a single virtual device using `MERGE_DEVICES`.

#### Shorthand format:
```env
MERGE_DEVICES="ServerName:192.168.1.15:mac1,mac2;NAS:192.168.1.20:mac3,mac4"
```

#### Example in `docker-compose.yml`:
```yaml
environment:
  - PORT=7153
  - FIREWALLA_IP=192.168.1.1
  - MERGE_DEVICES=Terra:192.168.1.15:a6:86:5a:70:71:53,e8:ff:1e:d8:f5:81
```

---

## 📱 Dashboard & Smart Home Integration

### Tronbyt / Tidbyt Apps
All Tronbyt Firewalla apps (**Firewalla Network**, **Firewalla Top Talkers**, and **Firewalla Security**) support Local Bridge mode:
1. In Tronbyt app settings, set **Connection** to `Local Bridge (Docker / LAN)`.
2. In **Bridge Address**, enter `http://<YOUR_DOCKER_HOST_IP>:7153`.
3. Leave **API Token** blank (or enter your token if `API_TOKEN` is enabled).

### 🏠 Home Assistant
Home Assistant can monitor your Firewalla box natively using its built-in `rest` sensor platform with zero HACS or cloud dependencies.
* **[View the Home Assistant Integration Guide & Ready-to-Copy YAML](docs/home-assistant.md)** for sensors covering WAN telemetry, speed test results, active alarms, and top talkers.

---

## 🛠️ Development & Live Reload

To develop locally with live code reload without rebuilding the Docker image on every change, use the development compose override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

---

## 🔒 Security & Hardening

* **Hardened Container Runtime:** Runs as non-root user (`node`, UID 1000) with direct PID 1 signal forwarding (`SIGTERM`/`SIGINT` graceful shutdown) and container healthchecks.
* **Key Isolation:** Private keys are generated with `0600` permissions. The repository includes `.dockerignore` to prevent key files or `.env` secrets from ever baking into Docker image layers.
* **Timing-Attack Immune:** API tokens are compared in constant time using SHA-256 digests (`crypto.timingSafeEqual`). Tokens are accepted exclusively via the `Authorization` header to prevent URL leakage in access logs.
* **Smart Single-Flight Locking:** Employs single-flight caching with 10s socket timeouts to protect both the router's embedded CPU and the bridge runtime against deadlocks and connection stalls.
* **Unauthenticated Diagnostic Shield:** When `API_TOKEN` is configured, `/health` and root endpoints return stripped status payloads to prevent unauthenticated network reconnaissance.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
