import { SecureUtil, FWGroupApi, NetworkService } from 'node-firewalla';
import validator from 'validator';
import inquirer from 'inquirer';
import fs from 'fs';

const KEY_DIR = process.env.KEY_DIR || './keys';

if (!fs.existsSync(KEY_DIR)) {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
}

async function run() {
  console.log('==============================================');
  console.log('       Firewalla Local Bridge Pairing         ');
  console.log('==============================================\n');
  console.log('1. Open your Firewalla app on your phone.');
  console.log('2. Go to: Settings -> Advanced -> Allow Additional Pairing');
  console.log('3. Turn on "Additional Pairing" to display the QR code.');
  console.log('4. Scan or screenshot the QR code and copy the JSON content.\n');

  const questions = [
    {
      type: 'input',
      name: 'email',
      message: 'Email label (for identification only):',
      default: 'bridge@home.local',
      validate: (email) => (!validator.isEmail(email) ? 'Invalid email' : true),
    },
    {
      type: 'input',
      name: 'qr',
      message: 'Firewalla QR Code JSON content:',
      validate: validateQrCode,
    },
    {
      type: 'input',
      name: 'localIp',
      default: process.env.FIREWALLA_IP || '192.168.1.1',
      message: 'Firewalla local IP address:',
      validate: (ip) => (!validator.isIP(ip) ? 'Invalid IP' : true),
    },
  ];

  const answers = await inquirer.prompt(questions);

  console.log('\nGenerating cryptographic ETP keypair...');
  SecureUtil.regenerateKeyPair();

  try {
    console.log(`Connecting to Firewalla at ${answers.localIp}...`);
    const fwGroup = await FWGroupApi.joinGroup(JSON.parse(answers.qr.trim()), answers.email, answers.localIp);
    const nwService = new NetworkService(fwGroup);
    await nwService.ping();

    console.log('Ping successful! Authorizing device...');
    await FWGroupApi.login(answers.email);

    const privKeyPath = `${KEY_DIR}/etp.private.pem`;
    const pubKeyPath = `${KEY_DIR}/etp.public.pem`;

    // Security: Restrict private key permissions to owner read/write (0600)
    fs.writeFileSync(privKeyPath, SecureUtil.privateKey, { encoding: 'utf8', mode: 0o600 });
    fs.writeFileSync(pubKeyPath, SecureUtil.publicKey, { encoding: 'utf8', mode: 0o644 });

    console.log('\n==============================================');
    console.log('   Pairing Successful! Keys saved to:        ');
    console.log(`   - ${privKeyPath} (mode: 0600)`);
    console.log(`   - ${pubKeyPath}`);
    console.log('==============================================\n');
    console.log('You can now start the bridge service with:');
    console.log('   docker compose up -d\n');
  } catch (err) {
    console.error('\nError linking to Firewalla box:', err.message || err);
    process.exit(1);
  }
}

function validateQrCode(qr) {
  try {
    const parsed = JSON.parse(qr.trim());
    const required = ['gid', 'seed', 'license', 'ek', 'ipaddress'];
    for (const field of required) {
      if (!(field in parsed)) {
        return `Missing field "${field}" in QR code JSON`;
      }
    }
    return true;
  } catch (err) {
    return 'QR code content must be valid JSON';
  }
}

run();
