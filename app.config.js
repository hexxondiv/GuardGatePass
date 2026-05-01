const fs = require('fs');
const path = require('path');

function loadEnvFile(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

/** Merges env-driven `extra.appConfig` onto the static `app.json` Expo passes as `config`. */
module.exports = ({ config }) => {
  const devMode = String(process.env.DEV_MODE || '').toLowerCase() === 'true';

  const prodApiBaseUrl = process.env.PROD_API_BASE_URL || 'https://api.gpera.org';
  const prodPaystackCallbackBaseUrl =
    process.env.PROD_PAYSTACK_CALLBACK_BASE_URL || 'https://api.gpera.org';
  const devApiBaseUrl =
    process.env.EXPO_PUBLIC_DEV_API_BASE_URL || process.env.DEV_API_BASE_URL;
  const devPaystackCallbackBaseUrl =
    process.env.DEV_PAYSTACK_CALLBACK_BASE_URL || process.env.EXPO_PUBLIC_DEV_API_BASE_URL;

  return {
    ...config,
    extra: {
      ...config.extra,
      appConfig: {
        devMode,
        apiBaseUrl: devMode ? devApiBaseUrl || undefined : prodApiBaseUrl,
        paystackCallbackBaseUrl: devMode
          ? devPaystackCallbackBaseUrl
          : prodPaystackCallbackBaseUrl,
      },
    },
  };
};
