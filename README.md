# Renovasjon MQTT Setup for Home Assistant

This script fetches waste collection data from Time Kommune and publishes it to Home Assistant via MQTT Discovery.

## Features

- Creates a device called "Tømming" in Home Assistant
- 3 sensors showing next collection date for each waste type:
  - Matavfall (Food waste)
  - Papir (Paper)
  - Restavfall (Residual waste)
- Each sensor includes attributes:
  - `next_collection`: Date in YYYY-MM-DD format
  - `days_until`: Number of days until collection
  - `waste_type`: Type of waste

## Requirements

- Node.js installed
- MQTT broker (e.g., Mosquitto)
- Home Assistant with MQTT integration enabled

## Installation

1. **Install dependencies:**
   ```bash
   cd time-kommune-renovasjon-mqtt
   npm install
   ```

2. **Configure the script:**
   Edit `renovasjon-mqtt.js` and update the configuration:
   ```javascript
   const CONFIG = {
     mqtt: {
       broker: 'mqtt://localhost:1883', // Your MQTT broker URL
       username: '', // Optional: MQTT username
       password: '', // Optional: MQTT password
     },
     renovasjon: {
       // These settings work for Time Kommune
       eiendomId: '0320890b-878f-4956-84d7-be6064061dfd', // Your property ID (example: Arne Garborgs Veg 30)
     },
   };
   ```

3. **Run the script:**
   ```bash
   node renovasjon-mqtt.js
   ```

   The script will:
   - Authenticate with the renovasjon API
   - Connect to your MQTT broker
   - Create the device and sensors in Home Assistant
   - Update data every hour

## Running as a Service

### Using systemd (Linux/Raspberry Pi):

Create `/etc/systemd/system/renovasjon-mqtt.service`:

```ini
[Unit]
Description=Renovasjon MQTT Bridge
After=network.target mosquitto.service

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/time-kommune-renovasjon-mqtt
ExecStart=/usr/bin/node /path/to/time-kommune-renovasjon-mqtt/renovasjon-mqtt.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable renovasjon-mqtt
sudo systemctl start renovasjon-mqtt
sudo systemctl status renovasjon-mqtt
```

### Using Docker (alternative):

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json renovasjon-mqtt.js ./
RUN npm install
CMD ["node", "renovasjon-mqtt.js"]
```

Build and run:
```bash
docker build -t renovasjon-mqtt .
docker run -d --name renovasjon-mqtt --restart unless-stopped renovasjon-mqtt
```

## Finding Your Property ID (eiendomId)

### Using the Helper Script (Recommended)

Use the included helper script to find your property ID:

```bash
# Interactive mode (prompts for address)
node renovasjon-find-property.js

# Direct search
node renovasjon-find-property.js "Your Street Name"
```

Example:
```bash
node renovasjon-find-property.js "Ola Barkveds Veg 47 B"
```

The script will display:
- All matching properties
- Property owner
- The eiendomId you need

### Manual Method

Alternatively, use the API directly:

```bash
# Get a token first
TOKEN=$(curl -s -X POST "https://renovasjon.time.kommune.no:8055/api/login" \
  -H "Content-Type: application/json" \
  -d '{"applikasjonsId":"2de50fc8-4ab7-426b-99cd-a5ddd0de71d1","oppdragsgiverId":"100"}' \
  -D - | grep -i "^token:" | cut -d' ' -f2 | tr -d '\r')

# Search for your address
curl -X GET "https://renovasjon.time.kommune.no:8055/api/eiendommer?adresse=YOUR+ADDRESS" \
  -H "Token: $TOKEN"
```

## Home Assistant Dashboard

Once set up, you can add cards to your dashboard:

```yaml
type: entities
title: Avfallshenting
entities:
  - entity: sensor.matavfall
    name: Matavfall
  - entity: sensor.papir
    name: Papir
  - entity: sensor.restavfall
    name: Restavfall
```

Or use a custom card to show days until collection:

```yaml
type: markdown
content: |
  ## Neste tømming

  **Matavfall:** {{ states('sensor.matavfall') }} ({{ state_attr('sensor.matavfall', 'days_until') }} dager)

  **Papir:** {{ states('sensor.papir') }} ({{ state_attr('sensor.papir', 'days_until') }} dager)

  **Restavfall:** {{ states('sensor.restavfall') }} ({{ state_attr('sensor.restavfall', 'days_until') }} dager)
```

## Troubleshooting

- **MQTT connection fails**: Check your broker URL and credentials
- **No sensors appear**: Verify MQTT Discovery is enabled in Home Assistant
- **No data**: Check the script logs for API errors
- **Token errors**: The script automatically gets a new token if needed

## Logs

View logs:
```bash
# If running directly
node renovasjon-mqtt.js

# If using systemd
sudo journalctl -u renovasjon-mqtt -f

# If using Docker
docker logs -f renovasjon-mqtt
```
