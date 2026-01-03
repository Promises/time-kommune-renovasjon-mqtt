const mqtt = require('mqtt');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load configuration
let userConfig;
try {
  const configPath = path.join(__dirname, 'config.json');
  userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error('❌ Error loading config.json');
  console.error('   Please copy config.example.json to config.json and update with your settings.');
  console.error('   Error:', error.message);
  process.exit(1);
}

// Merge with defaults
const CONFIG = {
  mqtt: {
    broker: userConfig.mqtt?.broker || 'mqtt://localhost:1883',
    username: userConfig.mqtt?.username || '',
    password: userConfig.mqtt?.password || '',
  },
  renovasjon: {
    baseUrl: 'https://renovasjon.time.kommune.no:8055',
    applikasjonsId: '2de50fc8-4ab7-426b-99cd-a5ddd0de71d1',
    oppdragsgiverId: '100',
    eiendomId: userConfig.renovasjon?.eiendomId,
  },
  updateInterval: userConfig.updateInterval || 3600000,
};

// Validate required config
if (!CONFIG.renovasjon.eiendomId) {
  console.error('❌ Error: eiendomId is required in config.json');
  console.error('   Use renovasjon-find-property.js to find your property ID.');
  process.exit(1);
}

let authToken = null;

const WASTE_TYPES = {
  'Matavfall': { name: 'Matavfall', icon: 'mdi:food-apple' },
  'Papir': { name: 'Papir', icon: 'mdi:newspaper-variant' },
  'Restavfall': { name: 'Restavfall', icon: 'mdi:trash-can' },
};

let mqttClient;

function getAuthToken() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      applikasjonsId: CONFIG.renovasjon.applikasjonsId,
      oppdragsgiverId: CONFIG.renovasjon.oppdragsgiverId,
    });

    const options = {
      hostname: 'renovasjon.time.kommune.no',
      port: 8055,
      path: '/api/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      const token = res.headers['token'];

      if (res.statusCode === 200 && token) {
        authToken = token;
        console.log('Successfully obtained auth token');
        resolve(token);
      } else {
        reject(new Error(`Failed to get token. Status: ${res.statusCode}`));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

function fetchRenovasjonData() {
  return new Promise((resolve, reject) => {
    if (!authToken) {
      reject(new Error('No auth token available'));
      return;
    }

    const now = new Date();
    const future = new Date();
    future.setDate(future.getDate() + 90);

    const datoFra = now.toISOString().split('T')[0];
    const datoTil = future.toISOString().split('T')[0];

    const url = `${CONFIG.renovasjon.baseUrl}/api/tomminger?eiendomId=${CONFIG.renovasjon.eiendomId}&datoFra=${datoFra}&datoTil=${datoTil}`;

    const options = {
      headers: {
        'Token': authToken,
        'Host': 'renovasjon.time.kommune.no:8055',
      },
    };

    https.get(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

function getNextCollectionDate(data, wasteType) {
  const now = new Date();
  const collections = data
    .filter(item => item.fraksjon === wasteType)
    .map(item => new Date(item.dato))
    .filter(date => date >= now)
    .sort((a, b) => a - b);

  return collections.length > 0 ? collections[0] : null;
}

function formatDate(date) {
  if (!date) return 'Ingen planlagt';
  return date.toISOString().split('T')[0];
}

function getDaysUntil(date) {
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function publishDiscoveryConfig() {
  const deviceConfig = {
    identifiers: ['renovasjon_tomming'],
    name: 'Tømming',
    manufacturer: 'Time Kommune',
    model: 'Renovasjon',
  };

  Object.keys(WASTE_TYPES).forEach((wasteType) => {
    const config = WASTE_TYPES[wasteType];
    const sensorId = wasteType.toLowerCase().replace('å', 'a');

    const discoveryTopic = `homeassistant/sensor/tomming/${sensorId}/config`;
    const discoveryPayload = {
      name: config.name,
      unique_id: `renovasjon_${sensorId}`,
      state_topic: `homeassistant/sensor/tomming/${sensorId}/state`,
      json_attributes_topic: `homeassistant/sensor/tomming/${sensorId}/attributes`,
      icon: config.icon,
      device: deviceConfig,
    };

    mqttClient.publish(discoveryTopic, JSON.stringify(discoveryPayload), { retain: true });
    console.log(`Published discovery config for ${config.name}`);
  });
}

async function updateSensors() {
  try {
    // Get fresh token if we don't have one
    if (!authToken) {
      console.log('Getting auth token...');
      await getAuthToken();
    }

    console.log('Fetching renovasjon data...');
    const data = await fetchRenovasjonData();

    Object.keys(WASTE_TYPES).forEach((wasteType) => {
      const nextDate = getNextCollectionDate(data, wasteType);
      const sensorId = wasteType.toLowerCase().replace('å', 'a');
      const formattedDate = formatDate(nextDate);
      const daysUntil = getDaysUntil(nextDate);

      // Publish state (the date)
      const stateTopic = `homeassistant/sensor/tomming/${sensorId}/state`;
      mqttClient.publish(stateTopic, formattedDate);

      // Publish attributes
      const attributesTopic = `homeassistant/sensor/tomming/${sensorId}/attributes`;
      const attributes = {
        next_collection: formattedDate,
        days_until: daysUntil,
        waste_type: wasteType,
      };
      mqttClient.publish(attributesTopic, JSON.stringify(attributes));

      console.log(`Updated ${wasteType}: ${formattedDate} (${daysUntil} days)`);
    });
  } catch (error) {
    console.error('Error updating sensors:', error);
    // Clear token so we get a fresh one on next update
    authToken = null;
  }
}

function main() {
  console.log('Connecting to MQTT broker...');

  const mqttOptions = {};
  if (CONFIG.mqtt.username) {
    mqttOptions.username = CONFIG.mqtt.username;
    mqttOptions.password = CONFIG.mqtt.password;
  }

  mqttClient = mqtt.connect(CONFIG.mqtt.broker, mqttOptions);

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Publish discovery configs
    publishDiscoveryConfig();

    // Update sensors immediately
    updateSensors();

    // Set up periodic updates
    setInterval(updateSensors, CONFIG.updateInterval);
  });

  mqttClient.on('error', (error) => {
    console.error('MQTT error:', error);
  });
}

main();
