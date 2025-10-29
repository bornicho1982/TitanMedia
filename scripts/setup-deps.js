const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const OBS_VERSION = '32.0.2';
const DEPS_DIR = path.join(__dirname, '../deps');
const OBS_DIR = path.join(DEPS_DIR, 'libobs');

const platforms = {
  'linux': {
    url: `https://github.com/obsproject/obs-studio/releases/download/${OBS_VERSION}/OBS-Studio-${OBS_VERSION}-Ubuntu-24.04-x86_64.deb`,
    filename: `obs-studio.deb`,
    extract: (filepath) => {
      execSync(`dpkg-deb -x ${filepath} ${OBS_DIR}`);
    }
  },
  'win32': {
    // Placeholder for Windows
    url: `https://github.com/obsproject/obs-studio/releases/download/${OBS_VERSION}/OBS-Studio-${OBS_VERSION}-Windows-x64.zip`,
    filename: `obs-studio.zip`,
    extract: (filepath) => {
      // In a real windows environment, we'd use a tool like 7-zip or a node module to unzip
      console.log('Windows extraction placeholder. Please manually extract', filepath);
    }
  },
  'darwin': {
    // Placeholder for macOS
    url: null, // OBS doesn't provide a simple zip/tar for mac dev files
    filename: 'obs-studio.dmg',
    extract: () => {
      console.log('macOS is not yet supported by this script.');
    }
  }
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  const platform = os.platform();
  const platformConfig = platforms[platform];

  if (!platformConfig || !platformConfig.url) {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  if (fs.existsSync(OBS_DIR)) {
    console.log('libobs dependency already exists. Skipping download.');
    return;
  }

  if (!fs.existsSync(DEPS_DIR)) {
    fs.mkdirSync(DEPS_DIR);
  }

  const downloadPath = path.join(DEPS_DIR, platformConfig.filename);

  console.log(`Downloading libobs for ${platform}...`);
  await download(platformConfig.url, downloadPath);
  console.log('Download complete.');

  console.log('Extracting files...');
  platformConfig.extract(downloadPath);
  console.log('Extraction complete.');

  // Clean up the downloaded archive
  fs.unlinkSync(downloadPath);

  console.log('libobs setup complete!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
