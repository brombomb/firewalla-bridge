import { SecureUtil, FWGroupApi, FWGroup, NetworkService } from 'node-firewalla';
import validator from 'validator';
import inquirer from 'inquirer';
import fs from 'fs';
import { validateQrCode, parseQrCode } from './utils/pairing.js';

const KEY_DIR = process.env.KEY_DIR || './keys';

if (!fs.existsSync(KEY_DIR)) {
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
}

async function joinFirewallaGroup(qrcode, email, localIp) {
  // 1. Decrypt rendezvous ID with license prefix, fallback to cybersecuritymadesimple
  let rid = null;
  const prefixes = [
    qrcode.license ? qrcode.license.substring(0, 8) : '',
    'cybersecuritymadesimple',
  ].filter(Boolean);

  let decryptErr = null;
  for (const prefix of prefixes) {
    try {
      const aesKey = prefix + qrcode.seed;
      const dec = SecureUtil.aesDecrypt(qrcode.ek, aesKey);
      if (dec && dec.length > 5) {
        rid = dec;
        break;
      }
    } catch (e) {
      decryptErr = e;
    }
  }

  if (!rid) {
    throw new Error(`Could not decrypt rendezvous token from QR code: ${decryptErr?.message || 'invalid key'}`);
  }

  console.log(`[1/4] Decrypted rendezvous ID (${rid.substring(0, 8)}...).`);
  console.log(`[2/4] Requesting ETP authorization token from Firewalla cloud for ${email}...`);

  const loginRes = await FWGroupApi.login(email);
  if (!loginRes || !loginRes.access_token) {
    throw new Error(`Failed to obtain access token from Firewalla cloud: ${JSON.stringify(loginRes)}`);
  }

  FWGroupApi.setAuth(loginRes.access_token);

  console.log(`[3/4] Registering rendezvous signal with Firewalla cloud...`);
  await FWGroupApi.startRendezVous(rid, qrcode.license);

  console.log(`[4/4] Waiting for Firewalla box to approve pairing...`);
  console.log(`      IMPORTANT: Keep the Firewalla app OPEN on the QR code screen!`);

  const maxTries = 25; // 75 seconds total
  let matchedGroup = null;

  for (let tryCount = 1; tryCount <= maxTries; tryCount++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const pollRes = await FWGroupApi.login(email);
    const groups = pollRes.groups || [];

    const targetGid = (qrcode.gid || '').toLowerCase();
    matchedGroup = groups.find((g) => {
      const gId = (g._id || g.gid || '').toLowerCase();
      return gId === targetGid;
    });

    if (matchedGroup) {
      console.log(`\n✅ Box approved the pairing session!`);
      break;
    }

    process.stdout.write(`\r      Waiting for box approval... (${tryCount}/${maxTries}) [visible boxes: ${groups.length}]`);
  }

  if (!matchedGroup) {
    throw new Error(
      `Handshake timed out after ${maxTries * 3} seconds.\n\n` +
      `Troubleshooting tips:\n` +
      `1. Make sure your Firewalla mobile app remains OPEN and active on the QR code screen.\n` +
      `2. Verify that the email entered (${email}) matches your primary Firewalla account email.\n` +
      `3. If the QR code was on screen for more than a few minutes, toggle "Allow Additional Pairing" OFF and ON for a fresh QR code.`
    );
  }

  return FWGroup.fromJson(matchedGroup, localIp);
}

async function run() {
  console.log('==============================================');
  console.log('       Firewalla Local Bridge Pairing         ');
  console.log('==============================================\n');
  console.log('1. Open your Firewalla app on your phone.');
  console.log('2. Go to: Settings -> Advanced -> Allow Additional Pairing');
  console.log('3. Turn on "Additional Pairing" to display the QR code.');
  console.log('4. Scan or screenshot the QR code and copy the JSON content.\n');
  console.log('⚠️  IMPORTANT: Keep the QR code visible on your phone screen until pairing finishes!\n');

  const questions = [
    {
      type: 'input',
      name: 'email',
      message: 'Email associated with your Firewalla account:',
      validate: (email) => (!validator.isEmail(email) ? 'Please enter a valid email address' : true),
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

  const qrResult = parseQrCode(answers.qr);
  if (!qrResult.ok) {
    console.error(`\n❌ QR code error: ${qrResult.error}`);
    if (qrResult.hint) console.error(`   💡 Tip: ${qrResult.hint}`);
    process.exit(1);
  }

  console.log(`\n✅ Valid Firewalla QR code detected:`);
  console.log(`   - Target Box ID: ${qrResult.data.gid}`);
  if (qrResult.expiresInMinutes) {
    console.log(`   - QR Code Valid For: ~${qrResult.expiresInMinutes} minute(s)`);
  }

  console.log('\nGenerating cryptographic ETP keypair...');
  SecureUtil.regenerateKeyPair();

  try {
    console.log(`Connecting to Firewalla at ${answers.localIp}...`);
    const fwGroup = await joinFirewallaGroup(qrResult.data, answers.email, answers.localIp);
    const nwService = new NetworkService(fwGroup);
    await nwService.ping();

    console.log('Ping successful! Authorizing device...');
    await FWGroupApi.login(answers.email);

    const privKeyPath = `${KEY_DIR}/etp.private.pem`;
    const pubKeyPath = `${KEY_DIR}/etp.public.pem`;

    // Security: Restrict private key permissions to owner read/write (0600)
    fs.writeFileSync(privKeyPath, SecureUtil.privateKey, { encoding: 'utf8', mode: 0o600 });
    try {
      fs.chmodSync(privKeyPath, 0o600);
    } catch (_) {
      // Best-effort on filesystems lacking POSIX permission support
    }
    fs.writeFileSync(pubKeyPath, SecureUtil.publicKey, { encoding: 'utf8', mode: 0o644 });

    console.log('\n==============================================');
    console.log('   Pairing Successful! Keys saved to:        ');
    console.log(`   - ${privKeyPath} (mode: 0600)`);
    console.log(`   - ${pubKeyPath}`);
    console.log('==============================================\n');
    console.log('You can now start the bridge service with:');
    console.log('   docker compose up -d\n');
  } catch (err) {
    console.error('\nError linking to Firewalla box:\n', err.message || err);
    process.exit(1);
  }
}

run();
