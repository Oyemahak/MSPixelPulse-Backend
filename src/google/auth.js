import { google } from 'googleapis';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
];

let oauthClient;

function requiredGoogleEnvironment(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    const error = new Error(`${name} is required when a Google provider is enabled`);
    error.code = 'GOOGLE_ENV_MISSING';
    error.status = 503;
    error.envName = name;
    throw error;
  }
  return value;
}

export function googleConfigurationStatus() {
  const names = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
  return Object.fromEntries(names.map((name) => [name, Boolean(String(process.env[name] || '').trim())]));
}

export function getGoogleOAuthClient() {
  if (oauthClient) return oauthClient;

  oauthClient = new google.auth.OAuth2(
    requiredGoogleEnvironment('GOOGLE_CLIENT_ID'),
    requiredGoogleEnvironment('GOOGLE_CLIENT_SECRET'),
  );
  oauthClient.setCredentials({
    refresh_token: requiredGoogleEnvironment('GOOGLE_REFRESH_TOKEN'),
  });
  return oauthClient;
}

/** Obtain a short-lived token from the refresh token without persisting it. */
export async function getGoogleAccessToken() {
  try {
    const auth = getGoogleOAuthClient();
    const response = await auth.getAccessToken();
    if (!response?.token) {
      const error = new Error('Google did not return an access token');
      error.code = 'GOOGLE_TOKEN_UNAVAILABLE';
      error.status = 503;
      throw error;
    }
    return response.token;
  } catch (cause) {
    const error = new Error('Google authentication could not be refreshed');
    error.code = cause?.code === 'GOOGLE_ENV_MISSING' ? cause.code : 'GOOGLE_AUTH_REFRESH_FAILED';
    error.status = cause?.status || 503;
    error.cause = cause;
    throw error;
  }
}

export async function getGoogleApis() {
  const auth = getGoogleOAuthClient();
  await getGoogleAccessToken();
  return {
    auth,
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

// Unit tests can safely change process.env without retaining an OAuth client.
export function resetGoogleAuthForTests() {
  oauthClient = undefined;
}

export { GOOGLE_SCOPES };

