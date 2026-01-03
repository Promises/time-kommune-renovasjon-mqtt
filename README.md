# Renovasjon MQTT Setup for Home Assistant

This script fetches waste collection data from Time Kommune and publishes it to Home Assistant via MQTT Discovery.

## Features

- Creates a device called "Tømming" in Home Assistant
- 3 sensors showing days until next collection for each waste type:
  - Matavfall (Food waste)
  - Papir (Paper)
  - Restavfall (Residual waste)
- Sensor state: Number of days until collection (e.g., "6 dager")
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

2. **Find your property ID:**
   ```bash
   node renovasjon-find-property.js "Your Address"
   ```
   Copy the `eiendomId` from the output.

3. **Configure the script:**
   Copy the example config and edit it:
   ```bash
   cp config.example.json config.json
   ```

   Edit `config.json` with your settings:
   ```json
   {
     "mqtt": {
       "broker": "mqtt://localhost:1883",
       "username": "",
       "password": ""
     },
     "renovasjon": {
       "eiendomId": "YOUR_PROPERTY_ID_HERE"
     }
   }
   ```

4. **Test the script:**
   ```bash
   node renovasjon-mqtt.js
   ```

   The script will:
   - Authenticate with the renovasjon API
   - Connect to your MQTT broker
   - Create the device and sensors in Home Assistant
   - Publish data and exit (designed to be run periodically by systemd timer)

## Running as a Service

### Using systemd timer (Linux/Raspberry Pi) - Recommended:

This project includes systemd service and timer files for efficient periodic updates.

1. **Copy the service files** (update paths and user first):
   ```bash
   # Edit the service file to set your user and paths
   sudo cp renovasjon-mqtt.service /etc/systemd/system/
   sudo cp renovasjon-mqtt.timer /etc/systemd/system/

   # Update YOUR_USER in the service file
   sudo nano /etc/systemd/system/renovasjon-mqtt.service
   ```

2. **Enable and start the timer**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable renovasjon-mqtt.timer
   sudo systemctl start renovasjon-mqtt.timer
   ```

3. **Check status**:
   ```bash
   # Check timer status
   sudo systemctl status renovasjon-mqtt.timer

   # See when next run is scheduled
   sudo systemctl list-timers renovasjon-mqtt.timer

   # Manually trigger an update
   sudo systemctl start renovasjon-mqtt.service

   # View logs
   sudo journalctl -u renovasjon-mqtt.service -f
   ```

The timer runs hourly and persists across reboots. It's more efficient than running continuously since it only uses resources when updating.

### Using Docker with cron (alternative):

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json renovasjon-mqtt.js config.json ./
RUN npm install && \
    apk add --no-cache dcron
# Run every hour
RUN echo "0 * * * * cd /app && node renovasjon-mqtt.js >> /var/log/renovasjon.log 2>&1" > /etc/crontabs/root
CMD ["crond", "-f", "-l", "2"]
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
node renovasjon-find-property.js "Arne Garborgs Veg 30"
```

This will find the Time rådhus (municipality building).

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

Or use a markdown card to show both days and dates:

```yaml
type: markdown
content: |
  ## Neste tømming

  **Matavfall:** {{ states('sensor.matavfall') }} dager ({{ state_attr('sensor.matavfall', 'next_collection') }})

  **Papir:** {{ states('sensor.papir') }} dager ({{ state_attr('sensor.papir', 'next_collection') }})

  **Restavfall:** {{ states('sensor.restavfall') }} dager ({{ state_attr('sensor.restavfall', 'next_collection') }})
```

## Troubleshooting

- **"Error loading config.json"**: Copy `config.example.json` to `config.json` and configure it with your settings
- **"eiendomId is required"**: Use `renovasjon-find-property.js` to find your property ID
- **MQTT connection fails**: Check your broker URL and credentials in `config.json`
- **No sensors appear**: Verify MQTT Discovery is enabled in Home Assistant
- **No data**: Check the script logs for API errors
- **Token errors**: The script automatically gets a new token if needed

## Logs

View logs:
```bash
# If running directly
node renovasjon-mqtt.js

# If using systemd timer
sudo journalctl -u renovasjon-mqtt.service -f

# See recent runs
sudo journalctl -u renovasjon-mqtt.service -n 50

# If using Docker
docker logs -f renovasjon-mqtt
```
