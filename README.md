# Firewalla Local Bridge

A lightweight, self-hosted Docker bridge that connects directly to your Firewalla box's local API (on port 8833) and translates it into clean REST endpoints compatible with **Tronbyt**, **Tidbyt**, **Home Assistant**, and custom homelab dashboards.

**No paid Firewalla MSP subscription required.** Works with standalone Firewalla boxes (Purple, Gold, Red, Blue) and boxes on MSP Lite.

---

## ✨ Features

* **Zero Cloud Dependency:** Communicates directly with your Firewalla box over your local LAN (ETP on port 8833).
* **MSP REST Compatibility:** Emulates standard Firewalla MSP endpoints (`/v2/boxes`, `/v2/alarms`, `/v2/flows`, `/v2/trends/flows`, etc.).
* **One-Step QR Pairing:** Built-in interactive pairing wizard (`npm run pair`) handles cryptographic key generation and box authorization in seconds.
* **Smart Alarm Filtering:** Automatically filters out muted notifications and exception/whitelisted rules to match real security events.
* **Bonded NIC / Multi-MAC Merging:** Optionally aggregates multi-NIC servers (e.g. LACP or `balance-alb` bonds) into a single virtual device so stats aren't split across ports.
* **Lightweight:** Built on Node 20 Alpine with a minimal memory footprint (~35 MB RAM).

---

## 📦 Architecture & Requirements

* **Base Container:** `node:20-alpine` (< 100 MB image)
* **Default Port:** `7153` (configurable via `PORT` environment variable)
* **Local Access:** Your Docker host must be able to route to your Firewalla's LAN IP address on port `8833`.

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
7. The pairing script generates your cryptographic keys (`etp.private.pem` and `etp.public.pem`) directly in the `./keys/` directory.

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
| `MERGE_DEVICES` | *(empty)* | Rules to aggregate multi-NIC / bonded servers |

### 🔗 Merging Bonded Interfaces (Optional)

If you have a home server or NAS using link aggregation (e.g. Linux `bond0` in `balance-alb` or `802.3ad` mode), Firewalla sees traffic across multiple physical MAC addresses. You can merge them into a single device using `MERGE_DEVICES`.

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

#### JSON format (also supported):
```env
MERGE_DEVICES='[{"name":"Terra","ip":"192.168.1.15","primaryId":"A6:86:5A:70:71:53","macs":["a6:86:5a:70:71:53","e8:ff:1e:d8:f5:81"]}]'
```

---

## 📱 Dashboard Integration

### Tronbyt / Tidbyt Apps
All Tronbyt Firewalla apps (**Firewalla Network**, **Firewalla Top Talkers**, and **Firewalla Security**) support Local Bridge mode:
1. In Tronbyt app settings, set **Connection** to `Local Bridge (Docker / LAN)`.
2. In **Bridge Address**, enter `http://<YOUR_DOCKER_HOST_IP>:7153`.
3. Leave **API Token** blank.

---

## 📡 Available API Endpoints

| Endpoint | Description |
| :--- | :--- |
| `GET /health` | Bridge connection status, device count, and active alarm count |
| `GET /v2/boxes` | Box model, name, mode, connected client count, and alarm summary |
| `GET /v2/alarms` | Active security alerts (auto-filters muted/whitelisted rules) |
| `GET /v2/alarms?filter=security` | Active security threat alarms only |
| `GET /v2/trends/flows` | 24-hour blocked threat volume for sparklines |
| `GET /v2/trends/alarms` | 7-day alarm frequency trend |
| `GET /v2/flows?groupBy=device` | Top bandwidth consumers sorted descending (supports `?period=1h`) |
| `GET /v2/devices` | All LAN devices with download/upload stats and online state |

---

## 🔒 Security

* **Never commit your `./keys/` directory.** It contains private RSA keys generated during the pairing step that grant read access to your Firewalla box.
* The `.gitignore` in this repo is preconfigured to ignore `keys/*.pem` and `.env`.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
