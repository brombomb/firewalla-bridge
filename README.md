# Firewalla Local Bridge

A local bridge that connects directly to your Firewalla box over your LAN and exposes REST endpoints for **Home Assistant**, **Tronbyt**, and custom homelab dashboards.

No paid Firewalla MSP subscription required — works with standalone Firewalla boxes (Purple, Gold, Red, Blue) and MSP Lite.

## Features

- **100% Local & Read-Only:** Connects directly to your Firewalla box over your LAN. Strictly read-only telemetry monitoring; never modifies firewall rules, routes, or box settings.
- **MSP REST API compatibility:** Emulates standard Firewalla MSP endpoints (`/v2/boxes`, `/v2/alarms`, `/v2/flows`, `/v2/devices`, `/v2/rules`, `/v2/speedtest`).
- **Smart alarm filtering:** Automatically filters out muted app notifications and whitelisted rules so you only see active, relevant alerts.
- **Bonded NIC / multi-MAC merging:** Consolidates multi-NIC servers (e.g. LACP or `balance-alb` bonds) into a single virtual device.
- **Optional token authentication:** Protect endpoints with standard `Authorization: Token <token>` headers.

## Quick Start

### 1. Pair with your Firewalla box

The bridge authenticates with your Firewalla locally using cryptographic keys generated during pairing:

> [!NOTE]
> **Network Requirements & Timing:**
> - Ensure your host machine can reach your Firewalla box on **TCP port 8833** (check your inter-VLAN rules if your container is in an isolated subnet).
> - Complete pairing within 2–3 minutes of generating the QR code before the pairing token expires.

1. Open the **Firewalla App** on your phone.
2. Go to **Settings → Advanced → Allow Additional Pairing** and toggle it **ON**.
3. Scan or screenshot the QR code and copy the JSON string (`{"gid":"...","seed":"...","license":"...","ek":"...","ipaddress":"..."}`).
4. Run the pairing wizard:
   ```bash
   docker compose run --rm firewalla-bridge npm run pair
   ```
5. Follow the prompts:
   - **Email label:** Enter a display identifier (e.g. `bridge@home.local`).
   - **QR code JSON:** Paste the JSON string from step 3.
   - **Firewalla IP:** Enter your Firewalla box's local IP (e.g. `192.168.1.1`).

Keys are generated in `./keys/`.

### 2. Start the bridge

A ready-to-go `docker-compose.yml` is included in the repository (using the pre-built multi-arch image):

```yaml
services:
  firewalla-bridge:
    image: ghcr.io/brombomb/firewalla-bridge:latest
    # Or build locally:
    # build: .
    container_name: firewalla-bridge
    restart: unless-stopped
    ports:
      - "${PORT:-7153}:${PORT:-7153}"
    environment:
      - PORT=${PORT:-7153}
      - FIREWALLA_IP=${FIREWALLA_IP:-192.168.1.1}
      - KEY_DIR=/app/keys
      - BOX_NAME=${BOX_NAME:-Firewalla Purple}
      # - CORS_ORIGIN=*
      # - API_TOKEN=your_token_here
      # - MERGE_DEVICES=Server:192.168.1.100:aa:bb:cc:dd:ee:01,aa:bb:cc:dd:ee:02
    volumes:
      - ./keys:/app/keys
```

Start the container:
```bash
docker compose up -d
```

Check health and connectivity:
```bash
curl http://localhost:7153/health
```

## Configuration

Configure options in `docker-compose.yml` or a `.env` file (see [`.env.example`](.env.example)):

| Variable | Default | Description |
| :--- | :--- | :--- |
| `FIREWALLA_IP` | `192.168.1.1` | LAN IP of your Firewalla box |
| `PORT` | `7153` | HTTP server port |
| `KEY_DIR` | `/app/keys` | Path to directory containing pairing keys |
| `BOX_NAME` | *(auto-detected)* | Custom display name for your box |
| `API_TOKEN` | *(disabled)* | Require `Authorization: Token <token>` header |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `MERGE_DEVICES` | *(empty)* | Rules to aggregate multi-NIC / bonded servers (`Name\|IP\|MAC1,MAC2`) |

### Merging Bonded NICs (Optional)

If you have a server or NAS with link aggregation (e.g. Linux `bond0` in `balance-alb` or `802.3ad`), Firewalla sees traffic across multiple physical MACs. You can merge them into a single device:

```env
MERGE_DEVICES="Server:192.168.1.100:mac1,mac2;NAS:192.168.1.200:mac3,mac4"
```

## Integrations

### Tronbyt / Tidbyt Apps

Three community apps are available for Tronbyt and Tidbyt smart pixel displays:

* **[Firewalla Network](https://tronbyt.github.io/apps/details/firewallanetwork.html):** Real-time WAN IP, router uptime, connected device count, and active policy rules.
* **[Firewalla Alarms](https://tronbyt.github.io/apps/details/firewallaalarms.html):** Security threat counts and active security alerts.
* **[Firewalla Top Talkers](https://tronbyt.github.io/apps/details/firewallatalkers.html):** Real-time bandwidth hog monitoring by device name and transfer volume.

**Setup in Tronbyt:** In your app settings, select **Connection** → `Local Bridge (Docker / LAN)` and enter your bridge URL: `http://<HOST_IP>:7153`.

### Home Assistant

Monitor your Firewalla box natively with zero cloud or HACS dependencies using Home Assistant's built-in `rest` platform.

* **[Home Assistant Setup Guide](docs/home-assistant.md):** Complete `configuration.yaml` sensor definitions for WAN metrics, speed test results, security alarms, and top talkers.
* **Ready-to-Paste Dashboard Card:** Paste this into any manual Lovelace card in Home Assistant:

```yaml
type: vertical-stack
cards:
  - type: glance
    title: Firewalla Network
    show_name: true
    show_state: true
    entities:
      - entity: sensor.firewalla_box_name
        name: Box
      - entity: sensor.firewalla_wan_ip
        name: WAN IP
      - entity: sensor.firewalla_uptime
        name: Uptime
      - entity: sensor.firewalla_connected_devices
        name: Devices
      - entity: sensor.firewalla_active_rules
        name: Rules
      - entity: sensor.firewalla_active_alarms
        name: Alarms

  - type: horizontal-stack
    cards:
      - type: gauge
        entity: sensor.firewalla_download_speed
        name: Download
        min: 0
        max: 1000
        needle: true
        severity:
          green: 100
          yellow: 50
          red: 0
      - type: gauge
        entity: sensor.firewalla_upload_speed
        name: Upload
        min: 0
        max: 100
        needle: true
        severity:
          green: 20
          yellow: 10
          red: 0

  - type: entities
    title: Top Bandwidth Talkers
    show_header_toggle: false
    entities:
      - entity: sensor.firewalla_top_talker_1
        secondary_info: last-updated
      - entity: sensor.firewalla_top_talker_2
      - entity: sensor.firewalla_top_talker_3
```

## Documentation & API

- **[API Reference](docs/api.md):** Complete documentation for all REST endpoints, query parameters, and example JSON payloads.
- **Interactive OpenAPI / Swagger:** When the bridge container is running, open `http://<HOST_IP>:7153/docs` for interactive Scalar documentation with live request execution.

## Development

Run with live code reload:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## License

[MIT](LICENSE)
