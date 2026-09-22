# Home Assistant Integration Guide

Integrate your Firewalla box directly into **Home Assistant** using the native [`rest` integration](https://www.home-assistant.io/integrations/rest/).

**No HACS or paid Firewalla MSP subscription required.** The bridge emulates Firewalla's REST endpoints locally on your LAN.

## Configuration

Add the following to your Home Assistant `configuration.yaml` (or `rest.yaml` if using `rest: !include rest.yaml`).

Replace `http://192.168.1.100:7153` with your bridge's LAN IP and port.

```yaml
rest:
  # 1. Box Telemetry & WAN Metrics
  - resource: http://192.168.1.100:7153/v2/boxes
    scan_interval: 60
    sensor:
      - name: "Firewalla Box Name"
        unique_id: firewalla_box_name
        value_template: "{{ value_json[0].name }}"
        icon: mdi:router-wireless
      - name: "Firewalla WAN IP"
        unique_id: firewalla_wan_ip
        value_template: "{{ value_json[0].publicIp }}"
        icon: mdi:ip-network
      - name: "Firewalla Uptime"
        unique_id: firewalla_uptime
        value_template: "{{ (value_json[0].uptime / 3600) | round(1) }}"
        unit_of_measurement: "h"
        icon: mdi:clock-outline
      - name: "Firewalla Firmware Version"
        unique_id: firewalla_firmware_version
        value_template: "{{ value_json[0].version }}"
        icon: mdi:information-outline
      - name: "Firewalla Connected Devices"
        unique_id: firewalla_connected_devices
        value_template: "{{ value_json[0].deviceCount }}"
        unit_of_measurement: "devices"
        icon: mdi:devices
      - name: "Firewalla Active Rules"
        unique_id: firewalla_active_rules
        value_template: "{{ value_json[0].ruleCount }}"
        unit_of_measurement: "rules"
        icon: mdi:shield-check

  # 2. Internet Speed Test Results
  - resource: http://192.168.1.100:7153/v2/speedtest
    scan_interval: 300
    sensor:
      - name: "Firewalla Download Speed"
        unique_id: firewalla_download_speed
        value_template: "{{ value_json.latest.downloadMbps }}"
        unit_of_measurement: "Mbit/s"
        device_class: data_rate
        state_class: measurement
        icon: mdi:download-network
      - name: "Firewalla Upload Speed"
        unique_id: firewalla_upload_speed
        value_template: "{{ value_json.latest.uploadMbps }}"
        unit_of_measurement: "Mbit/s"
        device_class: data_rate
        state_class: measurement
        icon: mdi:upload-network
      - name: "Firewalla Ping Latency"
        unique_id: firewalla_ping_latency
        value_template: "{{ value_json.latest.latencyMs }}"
        unit_of_measurement: "ms"
        state_class: measurement
        icon: mdi:timer-outline
      - name: "Firewalla ISP"
        unique_id: firewalla_isp
        value_template: "{{ value_json.latest.isp }}"
        icon: mdi:web

  # 3. Security Alarms
  - resource: http://192.168.1.100:7153/v2/alarms
    scan_interval: 60
    sensor:
      - name: "Firewalla Active Alarms"
        unique_id: firewalla_active_alarms
        value_template: "{{ value_json.count }}"
        icon: mdi:alert-circle

  # 4. Top Bandwidth Talkers
  - resource: http://192.168.1.100:7153/v2/flows?groupBy=device&limit=3
    scan_interval: 60
    sensor:
      - name: "Firewalla Top Talker #1"
        unique_id: firewalla_top_talker_1
        value_template: "{{ value_json.results[0].device.name if value_json.results | length > 0 else 'None' }}"
        icon: mdi:chart-bar
      - name: "Firewalla Top Talker #2"
        unique_id: firewalla_top_talker_2
        value_template: "{{ value_json.results[1].device.name if value_json.results | length > 1 else 'None' }}"
        icon: mdi:chart-bar
      - name: "Firewalla Top Talker #3"
        unique_id: firewalla_top_talker_3
        value_template: "{{ value_json.results[2].device.name if value_json.results | length > 2 else 'None' }}"
        icon: mdi:chart-bar
```

## Authentication (Optional)

If `API_TOKEN` is enabled on your bridge, supply the `Authorization` header under each resource:

1. Add your token to `secrets.yaml`:
   ```yaml
   firewalla_bridge_token: "your_token_here"
   ```
2. Add the header to the REST resource:
   ```yaml
   rest:
     - resource: http://192.168.1.100:7153/v2/boxes
       headers:
         Authorization: !secret firewalla_bridge_token
       scan_interval: 60
       sensor:
         ...
   ```

## Sample Lovelace Dashboard Cards

### Option 1: Full Dashboard Stack (Glance + Speed Gauges + Top Talkers)

Paste this into any manual Lovelace card:

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

### Option 2: Compact Entities Card

```yaml
type: entities
title: Firewalla Network
show_header_toggle: false
entities:
  - entity: sensor.firewalla_box_name
  - entity: sensor.firewalla_wan_ip
  - entity: sensor.firewalla_uptime
  - entity: sensor.firewalla_connected_devices
  - entity: sensor.firewalla_active_rules
  - entity: sensor.firewalla_active_alarms
  - type: section
    label: Speed Test
  - entity: sensor.firewalla_download_speed
  - entity: sensor.firewalla_upload_speed
  - entity: sensor.firewalla_ping_latency
  - entity: sensor.firewalla_isp
  - type: section
    label: Top Bandwidth Talkers
  - entity: sensor.firewalla_top_talker_1
    secondary_info: last-updated
  - entity: sensor.firewalla_top_talker_2
  - entity: sensor.firewalla_top_talker_3
```

## Related Documentation

- [API Reference](api.md)
- [Main README](../README.md)
