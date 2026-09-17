# Firewalla Local Bridge

A lightweight, modular, self-hosted Docker bridge that connects directly to your Firewalla box's local API (port 8833) and translates it into clean REST endpoints compatible with **Tronbyt**, **Tidbyt**, **Home Assistant**, and custom homelab dashboards.

**No paid Firewalla MSP subscription required.** Works with standalone Firewalla boxes (Purple, Gold, Red, Blue) and boxes on MSP Lite.

---

## ✨ Features

* **Zero Cloud Dependency:** Communicates directly with your Firewalla box over your local LAN (ETP on port 8833).
* **MSP REST Compatibility:** Emulates standard Firewalla MSP endpoints (`/v2/boxes`, `/v2/alarms`, `/v2/flows`, `/v2/rules`, etc.).
* **Home Assistant Ready:** Exposes `/v2/rules` and `/v2/speedtest` for easy sensor/switch automation.
* **One-Step QR Pairing:** Built-in pairing wizard (`npm run pair`) handles cryptographic key generation with secure `0600` permissions.
* **Single-Flight Cache Lock:** Prevents cache stampedes and eliminates redundant cryptographic requests to the Firewalla box.
* **Smart Alarm Filtering:** Automatically filters out muted notifications and exception/whitelisted rules to match real security events.
* **Bonded NIC / Multi-MAC Merging:** Aggregates multi-NIC servers (e.g. LACP or `balance-alb` bonds) into a single virtual device.
* **Optional Token Authentication:** Protects sensitive LAN device telemetry with standard `Authorization: Token <token>` headers.
* **Modular Codebase:** Clean Express architecture separated into `client`, `middleware`, `routes`, and `utils`.

---

## 📂 Project Architecture

```
src/
├── client/
│   ├── cache.js         # In-memory cache & helper getters
│   └── firewalla.js     # ETP client init, box services & single-flight refresh
├── middleware/
│   ├── auth.js          # Optional API_TOKEN authentication
│   └── errorHandler.js  # Centralized error handler
├── routes/
│   ├── index.js         # '/' (HTML dashboard) & '/health'
│   ├── boxes.js         # '/v2/boxes' (enriched telemetry)
│   ├── alarms.js        # '/v2/alarms', '/v2/trends/alarms'
│   ├── flows.js         # '/v2/flows', '/v2/trends/flows'
│   ├── devices.js       # '/v2/devices'
│   ├── rules.js         # '/v2/rules' (MSP policy rules)
│   └── speedtest.js     # '/v2/speedtest' (latest & history)
├── utils/
│   ├── alarms.js        # Alarm exception & disturbance filters
│   ├── merge.js         # NIC bonding / multi-MAC parser
│   └── sanitize.js      # HTML escaping & query string guards
├── pair.js              # One-time cryptographic pairing tool
└── server.js            # Express application coordinator
```

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
7. The pairing script generates your cryptographic keys (`etp.private.pem` and `etp.public.pem`) directly in the `./keys/` directory with `0600` permissions.

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
| `API_TOKEN` | *(disabled)* | If set, requires `Authorization: Token <token>` |
| `MERGE_DEVICES` | *(empty)* | Rules to aggregate multi-NIC / bonded servers |

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

## 📡 Available API Endpoints

| Endpoint | Description |
| :--- | :--- |
| `GET /health` | Bridge connection status, device count, and active alarm count |
| `GET /v2/boxes` | Box model, name, mode, WAN IP, firmware version, uptime, client & rule counts |
| `GET /v2/rules` | Firewall policy rules with action, target, category, and status |
| `GET /v2/trends/rules` | Rule activity trend line |
| `GET /v2/speedtest` | Latest WAN speed test results (download, upload, latency, jitter, loss) |
| `GET /v2/alarms` | Active security alerts (auto-filters muted/whitelisted rules) |
| `GET /v2/alarms?filter=security` | Active security threat alarms only |
| `GET /v2/trends/alarms` | 7-day alarm frequency trend |
| `GET /v2/flows?groupBy=device` | Top bandwidth consumers sorted descending (supports `?period=1h`) |
| `GET /v2/devices` | All LAN devices with download/upload stats and online state |

---

## 🔒 Security

* **Never commit your `./keys/` directory.** It contains private RSA keys generated during the pairing step that grant read access to your Firewalla box.
* Private keys are generated with `0600` permissions.
* Web dashboard HTML outputs are sanitized against host-header reflection.
* Optional `API_TOKEN` protects against unauthenticated local network queries.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
