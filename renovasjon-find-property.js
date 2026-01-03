const https = require('https');
const readline = require('readline');

// Configuration
const CONFIG = {
  baseUrl: 'https://renovasjon.time.kommune.no:8055',
  applikasjonsId: '2de50fc8-4ab7-426b-99cd-a5ddd0de71d1',
  oppdragsgiverId: '100',
};

let rl = null;

function getAuthToken() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      applikasjonsId: CONFIG.applikasjonsId,
      oppdragsgiverId: CONFIG.oppdragsgiverId,
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

function searchProperties(token, address) {
  return new Promise((resolve, reject) => {
    const encodedAddress = encodeURIComponent(address);
    const url = `${CONFIG.baseUrl}/api/eiendommer?adresse=${encodedAddress}`;

    const options = {
      headers: {
        'Token': token,
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

function question(prompt) {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function displayProperties(properties) {
  if (properties.length === 0) {
    console.log('\n❌ No properties found matching that address.\n');
    return false;
  }

  console.log(`\n✅ Found ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}:\n`);

  properties.forEach((prop, index) => {
    console.log(`${index + 1}. ${prop.adresse}`);
    console.log(`   Eier: ${prop.eier}`);
    console.log(`   Gnr/Bnr: ${prop.gNr}/${prop.bNr}`);
    console.log(`   ID: ${prop.id}`);
    console.log('');
  });

  return true;
}

async function main() {
  console.log('🗑️  Renovasjon Property Finder\n');
  console.log('This tool helps you find your property ID (eiendomId) for Time Kommune waste collection.\n');

  try {
    // Get address from command line or prompt
    let address = process.argv[2];

    if (!address) {
      address = await question('Enter your address to search: ');
    }

    if (!address || address.trim() === '') {
      console.log('❌ No address provided. Exiting.');
      if (rl) rl.close();
      process.exit(1);
    }

    console.log(`\n🔍 Searching for properties matching: "${address}"\n`);

    // Get auth token
    console.log('🔐 Getting authentication token...');
    const token = await getAuthToken();
    console.log('✅ Token obtained');

    // Search for properties
    console.log('🔍 Searching for properties...');
    const properties = await searchProperties(token, address);

    // Display results
    const hasResults = displayProperties(properties);

    if (hasResults) {
      console.log('💡 Copy the ID of your property and use it as "eiendomId" in renovasjon-mqtt.js\n');

      if (properties.length === 1) {
        console.log('📋 Your eiendomId:');
        console.log(`   ${properties[0].id}\n`);
      } else if (process.argv[2]) {
        // Non-interactive mode (address provided as argument)
        console.log('💡 Multiple properties found. Run without arguments for interactive selection.\n');
      } else {
        // Interactive mode
        const selection = await question('Select a property number (or press Enter to exit): ');
        const index = parseInt(selection) - 1;

        if (!isNaN(index) && index >= 0 && index < properties.length) {
          console.log('\n📋 Selected property eiendomId:');
          console.log(`   ${properties[index].id}\n`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (rl) rl.close();
    process.exit(1);
  }

  // Clean exit
  if (rl) rl.close();
  process.exit(0);
}

main();
