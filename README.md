# Firewalla Local Bridge for Tronbyt

A lightweight, self-hosted Docker bridge that connects directly to your Firewalla box's local API (on port 8833) and translates it into clean REST endpoints for Tronbyt apps.

**No paid MSP subscription required.** Works with **MSP Lite** and standalone Firewalla boxes.

---

## 📦 Container & Package Architecture

The bridge is designed to be self-contained and run on your home server (Docker / Unraid / Synology / Raspberry Pi):

### 1. Base Container
* **Image:** `node:20-alpine`
* **Size:** < 100 MB
* **Memory footprint:** ~35 MB RAM
* **Default Port:** `7153` (mapped `7153:7153` in `docker-compose.yml`)

### 2. JavaScript / NPM Dependencies
* **[`node-firewalla`](https://www.npmjs.com/package/node-firewalla) (`^1.0.5`):** The core client library that handles the local cryptographic ETP (Extended Token Pairing) handshake with your Firewalla box on port 8833, signs requests with your generated RSA `.pem` keys, and queries devices, alarms, and network flows.
* **[`express`](https://www.npmjs.com/package/express) (`^4.19.2`):** Minimalist web framework that listens on port `7153` and serves the standardized `/v2/boxes`, `/v2/alarms`, `/v2/trends/flows`, and `/v2/flows` endpoints expected by Tronbyt.
* **[`inquirer`](https://www.npmjs.com/package/inquirer) (`^9.2.14`):** Interactive CLI prompt used solely during the one-time pairing process (`npm run pair`) to guide you through pasting your QR code JSON and setting your box IP.
* **[`validator`](https://www.npmjs.com/package/validator) (`^13.11.0`):** Validates IP addresses and email syntax during the pairing step.

---

## ⚙️ Port Configuration

By default, the bridge listens on **port `7153`**.

If you ever need to change the port, update `docker-compose.yml`:
```yaml
services:
  firewalla-bridge:
    ports:
      - "YOUR_PORT:YOUR_PORT" # e.g. 7153:7153
    environment:
      - PORT=YOUR_PORT        # e.g. 7153
```

---

## 🚀 Quick Setup Guide

### Step 1: One-Time Pairing with Your Firewalla Box

The pairing step registers your bridge container as an authorized local client on your Firewalla box:

1. Open the **Firewalla App** on your phone.
2. Select your box and go to: **Settings → Advanced → Allow Additional Pairing**.
3. Toggle **Additional Pairing** to **ON**. A QR code will appear on your screen.
4. Scan or screenshot the QR code and copy the raw JSON text (it looks like `{"gid":"...","seed":"...","license":"...","ek":"...","ipaddress":"..."}`).
5. In your `firewalla-tronbyt-bridge` directory, run:
   ```bash
   docker compose run --rm firewalla-bridge npm run pair
   ```
6. Follow the prompts:
   * **Email label:** Enter an email (e.g. `tronbyt@home.local` — used only for display in the app).
   * **QR code JSON:** Paste the JSON string from step 4.
   * **Firewalla IP:** Enter your Firewalla box's local LAN IP (e.g. `192.168.1.1`).
7. The script will generate `etp.private.pem` and `etp.public.pem` directly in your `./keys/` directory.

### Step 2: Start the Bridge Container

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
{"status":"connected","firewallaIp":"192.168.1.1","boxName":"Firewalla Purple","cachedDevices":107,"cachedAlarms":50}
```

---

## 📱 Configuring Your Tronbyt Apps

All 3 Tronbyt apps (**Firewalla Network**, **Firewalla Top Talkers**, and **Firewalla Security**) now support both **Local Bridge** and **Cloud MSP** modes:

1. In the Tronbyt app settings, set **Connection** to:
   `Local Bridge (Docker / LAN)` *(Default)*
2. In **Bridge Address**, enter your Docker server's IP and port `7153`:
   ```
   http://192.168.1.15:7153
   ```
   *(Replace `192.168.1.15` with the actual LAN IP of the machine running Docker)*
3. Leave **API Token** blank.

---

## 📡 Endpoints Provided to Tronbyt

The bridge maps the local Firewalla API to the following endpoints:

| Endpoint | Purpose | Consumed By |
| :--- | :--- | :--- |
| `GET /health` | Bridge health & device count | Monitoring / Setup |
| `GET /v2/boxes` | Box name, model, connected client count, alarm count | **Firewalla Network** |
| `GET /v2/trends/flows` | 24-hour blocked threat volume for the sparkline | **Firewalla Network** |
| `GET /v2/flows?groupBy=device` | Top bandwidth consumers (sorted descending) | **Firewalla Top Talkers** |
| `GET /v2/alarms` | Active security alerts and threat descriptions | **Firewalla Security** |
| `GET /v2/trends/alarms` | 7-day alarm frequency trend | **Firewalla Security** |
| `GET /v2/devices` | All LAN devices with download/upload stats | Diagnostic fallback |
