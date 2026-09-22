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
        value_template: "{{ value_json[0].name }}"
        icon: mdi:router-wireless
      - name: "Firewalla WAN IP"
        value_template: "{{ value_json[0].publicIp }}"
        icon: mdi:ip-network
      - name: "Firewalla Uptime"
        value_template: "{{ (value_json[0].uptime / 3600) | round(1) }}"
        unit_of_measurement: "h"
        icon: mdi:clock-outline
      - name: "Firewalla Firmware Version"
        value_template: "{{ value_json[0].version }}"
        icon: mdi:information-outline
      - name: "Firewalla Connected Devices"
        value_template: "{{ value_json[0].deviceCount }}"
        unit_of_measurement: "devices"
        icon: mdi:devices
      - name: "Firewalla Active Rules"
        value_template: "{{ value_json[0].ruleCount }}"
        unit_of_measurement: "rules"
        icon: mdi:shield-check

  # 2. Internet Speed Test Results
  - resource: http://192.168.1.100:7153/v2/speedtest
    scan_interval: 300
    sensor:
      - name: "Firewalla Download Speed"
        value_template: "{{ value_json.latest.downloadMbps }}"
        unit_of_measurement: "Mbps"
        device_class: data_rate
        state_class: measurement
        icon: mdi:download-network
      - name: "Firewalla Upload Speed"
        value_template: "{{ value_json.latest.uploadMbps }}"
        unit_of_measurement: "Mbps"
        device_class: data_rate
        state_class: measurement
        icon: mdi:upload-network
      - name: "Firewalla Ping Latency"
        value_template: "{{ value_json.latest.latencyMs }}"
        unit_of_measurement: "ms"
        state_class: measurement
        icon: mdi:timer-outline
      - name: "Firewalla ISP"
        value_template: "{{ value_json.latest.isp }}"
        icon: mdi:web

  # 3. Security Alarms
  - resource: http://192.168.1.100:7153/v2/alarms
    scan_interval: 60
    sensor:
      - name: "Firewalla Active Alarms"
        value_template: "{{ value_json.count }}"
        icon: mdi:alert-circle

  # 4. Top Bandwidth Talkers
  - resource: http://192.168.1.100:7153/v2/flows?groupBy=device&limit=3
    scan_interval: 60
    sensor:
      - name: "Firewalla Top Talker #1"
        value_template: "{{ value_json.results[0].device.name }}"
        attributes:
          ip: "{{ value_json.results[0].device.ip }}"
          download_gb: "{{ (value_json.results[0].download / 1073741824) | round(2) }}"
          upload_gb: "{{ (value_json.results[0].upload / 1073741824) | round(2) }}"
          total_gb: "{{ (value_json.results[0].total / 1073741824) | round(2) }}"
        icon: mdi:chart-bar
      - name: "Firewalla Top Talker #2"
        value_template: "{{ value_json.results[1].device.name }}"
        attributes:
          ip: "{{ value_json.results[1].device.ip }}"
          total_gb: "{{ (value_json.results[1].total / 1073741824) | round(2) }}"
        icon: mdi:chart-bar
      - name: "Firewalla Top Talker #3"
        value_template: "{{ value_json.results[2].device.name }}"
        attributes:
          ip: "{{ value_json.results[2].device.ip }}"
          total_gb: "{{ (value_json.results[2].total / 1073741824) | round(2) }}"
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

## Sample Lovelace Card

Once loaded, you can display these sensors in an Entities card:

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
