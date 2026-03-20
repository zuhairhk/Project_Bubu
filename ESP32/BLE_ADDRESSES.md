# BLE UUIDs — Commubu Project

All characteristics belong to a single NUS (Nordic UART Service) service.

## Service

| UUID | Name | Purpose |
|---|---|---|
| `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | `SERVICE_UUID` | Primary BLE service (NUS) — used for device scanning/connection |

## Characteristics — active (ESP32 + App)

| UUID | Name | Direction | Use |
|---|---|---|---|
| `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_RX` / `RX_CHAR_UUID` | Phone → ESP32 (write) | Send mood string (e.g. `"happy\n"`) to the device |
| `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_TX` / `TX_CHAR_UUID` | ESP32 → Phone (notify) | Stream JSON sensor data: `{hr, steps, cal, dist}` |
| `6E400004-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_NAME` / `NAME_CHAR_UUID` | ESP32 → Phone (read) | Read the device's custom display name |

## Characteristics — ESP32 only (not yet wired in app)

| UUID | Name | Direction | Use |
|---|---|---|---|
| `6E400005-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_SONG` | Phone → ESP32 (write) | Currently playing song title |
| `6E400006-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_ARTIST` | Phone → ESP32 (write) | Currently playing artist |
| `6E400007-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_TIME` | Phone → ESP32 (write) | Current time as `HH:MM` |
| `6E400008-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_HR` | ESP32 → Phone (read/notify) | Dedicated heart rate characteristic |
| `6E400009-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_TRACKS` | Phone → ESP32 (write) | Top tracks as newline-separated `"Song - Artist"` list |
| `6E40000A-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_TRANSIT_LINE` | Phone → ESP32 (write) | GO Transit line name |
| `6E40000B-B5A3-F393-E0A9-E50E24DCCA9E` | `CHAR_UUID_TRANSIT_TIME` | Phone → ESP32 (write) | Departure time as `HH:MM` |
