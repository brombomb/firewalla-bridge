# API Reference

The Firewalla Local Bridge translates local Firewalla ETP messages into clean, standard REST endpoints compatible with **Home Assistant**, **Tronbyt**, **Tidbyt**, and custom dashboards.

## Interactive Documentation

When the bridge container is running, an interactive documentation interface with live "Try It Out" capability is available directly in your browser:

* **Interactive Docs (Scalar):** `http://<bridge-ip>:7153/docs`
* **OpenAPI 3.0 Specification:** `http://<bridge-ip>:7153/openapi.json`
* **Swagger JSON Alias:** `http://<bridge-ip>:7153/swagger.json`

## Authentication

By default, the bridge operates without authentication for open LAN access.

If you have configured `API_TOKEN` in your environment, pass the token in the `Authorization` header:

```bash
# Using Token scheme (Firewalla MSP compatible)
curl -H "Authorization: Token your_secret_token" http://localhost:7153/v2/boxes

# Using Bearer scheme (Standard REST)
curl -H "Authorization: Bearer your_secret_token" http://localhost:7153/v2/boxes
```

> [!NOTE]
> When `API_TOKEN` is enabled:
> * `/health` and `/` return a sanitized status payload without internal network metrics.
> * `/docs`, `/openapi.json`, and `/favicon.ico` remain open.
> * All `/v2/*` endpoints return `401 Unauthorized` if the token is missing or invalid.
> * Query parameter tokens (`?token=...`) are explicitly rejected to prevent token leakage in access logs.

## Available Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| [`/health`](#get-health) | `GET` | Bridge connection status, device count, and active alarm count |
| [`/v2/boxes`](#get-v2boxes) | `GET` | Box model, name, mode, WAN IP, firmware version, uptime, client & rule counts |
| [`/v2/devices`](#get-v2devices) | `GET` | All LAN devices with download/upload bandwidth stats and online state |
| [`/v2/rules`](#get-v2rules) | `GET` | Firewall policy rules with action, target, category, and status |
| [`/v2/trends/rules`](#get-v2trendsrules) | `GET` | Hourly rule activation count over the last 24 hours |
| [`/v2/alarms`](#get-v2alarms) | `GET` | Active security alerts (auto-filters muted/whitelisted rules) |
| [`/v2/trends/alarms`](#get-v2trendsalarms) | `GET` | 7-day daily alarm frequency trend |
| [`/v2/flows`](#get-v2flows) | `GET` | Top bandwidth consumers sorted descending (supports 1h and 24h windows) |
| [`/v2/trends/flows`](#get-v2trendsflows) | `GET` | Hourly alarm/flow activity over the last 24 hours |
| [`/v2/speedtest`](#get-v2speedtest) | `GET` | Latest WAN speed test results (download, upload, latency, jitter, loss) |

## Endpoint Details

### `GET /health`

Returns bridge health, connectivity to the local Firewalla box, and cached metric totals.

#### Sample Response:
```json
{
  "status": "connected",
  "firewallaIp": "192.168.1.1",
  "boxName": "Firewalla Purple",
  "cachedDevices": 42,
  "cachedAlarms": 3,
  "securityAlarms": 1,
  "ignoredAlarms": 8
}
```

---

### `GET /v2/boxes`

Emulates the Firewalla MSP box telemetry endpoint. Returns box specifications, network mode, WAN IP, and active counts.

#### Sample Response:
```json
[
  {
    "gid": "xxxx-xxxx-xxxx",
    "name": "Firewalla Purple",
    "model": "purple",
    "mode": "router",
    "online": true,
    "publicIp": "198.51.100.1",
    "version": "1.9750",
    "uptime": 259200,
    "deviceCount": 42,
    "ruleCount": 15,
    "alarmCount": 3
  }
]
```

---

### `GET /v2/devices`

Returns all discovered LAN devices with upload/download bandwidth counters and online status. If `MERGE_DEVICES` is configured, multi-NIC bonded servers are merged into a single consolidated virtual device.

#### Sample Response:
```json
[
  {
    "id": "AA:BB:CC:DD:EE:01",
    "name": "Home Server",
    "ip": "192.168.1.100",
    "online": true,
    "totalDownload": 104857600,
    "totalUpload": 52428800
  },
  {
    "id": "B4:FB:E4:11:22:33",
    "name": "Living Room TV",
    "ip": "192.168.1.50",
    "online": true,
    "totalDownload": 31457280,
    "totalUpload": 2097152
  }
]
```

---

### `GET /v2/rules`

Returns active and paused firewall policy rules configured on the box.

#### Query Parameters:
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `action` | string | *(none)* | Filter by rule action (`block` or `allow`) |
| `type` | string | *(none)* | Filter by rule type (e.g. `traffic`, `dns`, `ip`) |
| `limit` | integer | *(none)* | Maximum number of rules to return |

#### Sample Response:
```json
{
  "count": 2,
  "results": [
    {
      "id": "1001",
      "name": "Ad Block Default",
      "target": "Ad Block",
      "action": "block",
      "status": "active",
      "type": "dns",
      "category": "system",
      "ts": 1710000000
    },
    {
      "id": "1002",
      "name": "Block Gaming on Work Laptop",
      "target": "Gaming",
      "action": "block",
      "status": "active",
      "type": "traffic",
      "category": "custom",
      "ts": 1710000500
    }
  ]
}
```

---

### `GET /v2/trends/rules`

Returns a 24-hour timeline of rule activations grouped into 1-hour intervals.

#### Sample Response:
```json
[
  { "ts": 1710000000, "value": 0 },
  { "ts": 1710003600, "value": 2 },
  { "ts": 1710007200, "value": 5 }
]
```

---

### `GET /v2/alarms`

Returns active security alarms and alerts. Automatically applies smart filtering:
* Excludes alarms muted in user notification settings (`features.disturb = true`).
* Excludes alarms matching configured exception/whitelisted rules (DNS, IP, MAC, or device tags).

#### Query Parameters:
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `securityOnly` | boolean | `false` | When `true`, filters to high-severity threats only (e.g. malware, port scans) |
| `filter` | string | *(none)* | Alternative filter: set to `security` |

#### Sample Response:
```json
{
  "count": 1,
  "results": [
    {
      "aid": "alarm-12345",
      "type": "ALARM_INTEL_MALWARE",
      "message": "Potential malware domain contacted: example-malware.com",
      "ts": 1710003600
    }
  ]
}
```

---

### `GET /v2/trends/alarms`

Returns a 7-day daily trend of alarm frequency.

#### Sample Response:
```json
[
  { "ts": 1709481600, "value": 3 },
  { "ts": 1709568000, "value": 1 },
  { "ts": 1709654400, "value": 0 },
  { "ts": 1709740800, "value": 4 },
  { "ts": 1709827200, "value": 2 },
  { "ts": 1709913600, "value": 1 },
  { "ts": 1710000000, "value": 0 }
]
```

---

### `GET /v2/flows`

Returns top bandwidth consumers sorted in descending order by byte volume. Respects bonded NIC merging configurations.

#### Query Parameters:
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `groupBy` | string | `device` | Aggregation level (currently supports `device`) |
| `period` | string | `24h` | Time window: `24h` (default summary) or `1h` (live query) |
| `limit` | integer | `5` | Maximum number of top talkers to return (1–100) |

#### Sample Response:
```json
{
  "results": [
    {
      "device": {
        "id": "AA:BB:CC:DD:EE:01",
        "name": "Home Server",
        "ip": "192.168.1.100"
      },
      "download": 5368709120,
      "upload": 1073741824,
      "total": 6442450944
    },
    {
      "device": {
        "id": "B4:FB:E4:11:22:33",
        "name": "Living Room Apple TV",
        "ip": "192.168.1.50"
      },
      "download": 2147483648,
      "upload": 104857600,
      "total": 2252341248
    }
  ]
}
```

---

### `GET /v2/trends/flows`

Returns hourly alarm and flow event distributions across a 24-hour window.

#### Sample Response:
```json
[
  { "ts": 1710000000, "value": 0 },
  { "ts": 1710003600, "value": 4 }
]
```

---

### `GET /v2/speedtest`

Returns the most recent WAN internet speed test performed by the Firewalla box, along with optional historical runs.

#### Query Parameters:
| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `history` | boolean | `false` | When `true`, includes array of previous speed test runs |
| `limit` | integer | `10` | Number of historical runs to return (max `50`) |

#### Sample Response:
```json
{
  "available": true,
  "latest": {
    "timestamp": 1710003600,
    "downloadMbps": 942.5,
    "uploadMbps": 880.2,
    "latencyMs": 8.4,
    "jitterMs": 1.2,
    "packetLoss": 0,
    "isp": "Local Fiber ISP",
    "publicIp": "198.51.100.1",
    "server": "Speedtest Host (Denver, CO)"
  }
}
```

## Related Documentation

- [Home Assistant Integration Guide](home-assistant.md)
- [Main README](../README.md)
