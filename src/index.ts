import { Request } from 'express';
import { readFile } from 'fs/promises';
import {
  AccessCard,
  Cookie,
  ErrorResponse,
  IdpErrorResponse,
  IdpUserResponse,
  LoginRequest,
  NetReadyConfig,
  NetreadyErrorType,
  UserResponse,
  ValidateResponse,
} from './types.js';

// Custom error
const devEnv = ['local', 'staging'].includes(process?.env?.APP_ENV || '');

function logMessage(title: string, context: unknown): void {
  if (devEnv) {
    console.warn(`NetReady IDP: ${title}, ${JSON.stringify(context)}`);
  }
}

class NetReadyError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'NetReadyError';
  }
}

// Connections

/**
 * Validate email by NetReady
 * @param config Connection settings
 * @param email
 * @returns if success {isTaken: boolean}, otherwise <ErrorResponse>
 */
async function validateEmail(
  config: NetReadyConfig,
  email: string,
): Promise<ErrorResponse | { isTaken: boolean; error: false }> {
  try {
    const encodedEmail = encodeURIComponent(email);

    const result = await fetch(`${config.baseUrl}/validate/email?apiKey=${config.apiKey}&email=${encodedEmail}`);
    const data = (await result.json()) as ValidateResponse;
    const isTaken = data?.isTaken;

    logMessage('Email validation result', isTaken);
    return { isTaken, error: false };
  } catch (e) {
    throw new NetReadyError(`NetReady ${email} validation failed`, { cause: e });
  }
}

/**
 * Get user access cards
 * @param config Connection settings
 * @param userId user ID from NetReady
 * @param code authorization code from cookies
 * @returns { accessCard: boolean, proCard: boolean }, otherwise: <ErrorResponse>
 */
async function accessCards(
  config: NetReadyConfig,
  userId: number,
  code?: string,
): Promise<
  | {
      accessCard: boolean;
      proCard: boolean;
      error: false;
    }
  | ErrorResponse
> {
  try {
    const headers = { 'Content-Type': 'application/json', Cookie: code ? `${config.authCookie}=${code}'` : '' };

    const result = await fetch(`${config.baseUrl}/user/users/${userId}/accessCards?apiKey=${config.apiKey}`, {
      headers,
    });

    const response = await result.json();

    const accessCards = response as AccessCard[];

    const accessCard = !!accessCards.find(({ accessCardId }) => accessCardId === config.accessCard);

    const proCard = !!accessCards.find(({ accessCardId }) => accessCardId === config.accessPro);

    logMessage('Access cards validation result', { accessCard, proCard });
    return { accessCard, proCard, error: false };
  } catch (e) {
    throw new NetReadyError('Getting access cards failed', { cause: e });
  }
}

/**
 * Login to NetReady and check access to app
 * @param config Connection settings
 * @param user username and password
 * @returns if success <UserResponse>, otherwise <ErrorResponse>
 */
async function login(config: NetReadyConfig, user: LoginRequest): Promise<ErrorResponse | UserResponse> {
  try {
    const emailCheck = await validateEmail(config, user.username);

    if (emailCheck.error && emailCheck.errorType === NetreadyErrorType.validation) {
      logMessage('Login result', { user: user.username, success: false });
      return { error: true, errorType: NetreadyErrorType.validation };
    }

    if (!emailCheck.error && emailCheck.isTaken) {
      // login and get cookies
      const result = await fetch(`${config.baseUrl}/user/login?apiKey=${config.apiKey}`, {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify(user),
      });

      if (result.status === 403) {
        logMessage('Login result', { user: user.username, success: false });
        return { error: true, errorType: NetreadyErrorType.credentials };
      } else if (result.status !== 200) {
        return { error: true, errorType: NetreadyErrorType.validation };
      }

      const userInfo = (await result.json()) as IdpUserResponse | IdpErrorResponse;

      if ('userId' in userInfo) {
        // get access cookie for future access without credentials
        const cookies =
          result.headers
            .get('Set-Cookie')
            ?.split(';')
            .map((c) => {
              const [key, value] = c.split('=');
              return { key, value };
            }) || ([] as Cookie[]);

        const code = cookies.find((c) => c.key === config.authCookie);
        const cards = await accessCards(config, userInfo.userId, code?.value);

        if (code?.value && !cards.error) {
          logMessage('Login result', { user: user.username, success: true });
          return {
            ...userInfo,
            accessCard: cards.accessCard,
            proCard: cards.proCard,
            code: code.value,
            error: false,
          };
        }
      } else {
        logMessage('Login result', { user: user.username, success: false, userInfo });
        return { error: true, errorType: NetreadyErrorType.validation };
      }
    }
    logMessage('Login result', { user: user.username, success: false });
    return { error: true, errorType: NetreadyErrorType.credentials };
  } catch (e) {
    throw new NetReadyError('NetReady login failed', { cause: e });
  }
}

/**
 * Validate PassportJs session user data
 * @param config Connection settings
 * @param req Express.Request
 * @returns if success <UserResponse>, otherwise <ErrorResponse>
 */
async function userInfo(config: NetReadyConfig, req: Request): Promise<ErrorResponse | UserResponse> {
  try {
    if (req.user) {
      const { userId, code } = req.user as UserResponse;
      const cards = await accessCards(config, userId, code);

      if (!cards.error) {
        const result = await fetch(`${config.baseUrl}/user/users/${userId}/?apiKey=${config.apiKey}`, {
          headers: { Cookie: `${config.authCookie}=${code}` },
        });
        const user = (await result.json()) as IdpUserResponse;

        logMessage('User info result', { userId, success: true });
        return {
          ...user,
          code,
          accessCard: cards.accessCard,
          proCard: cards.proCard,
          error: false,
        };
      }
    }

    logMessage('User info result', { success: false });
    return { error: true, errorType: NetreadyErrorType.validation };
  } catch (e) {
    throw new NetReadyError('Access to NetReady user info failed', { cause: e });
  }
}

/**
 * Returns user object. If user in not undefined, will try to sign in,
 * otherwise will try to get user information from PassportJs session
 * and validate it.
 * @param config Connection settings
 * @param req Express.Request
 * @param user Passport session user
 * @returns if success <UserResponse>, otherwise <ErrorResponse>
 */

async function getNetreadyUser(
  config: NetReadyConfig,
  req: Request,
  user?: LoginRequest,
): Promise<ErrorResponse | UserResponse> {
  try {
    if (user) {
      return login(config, user);
    }
    return userInfo(config, req);
  } catch {
    return { error: true, errorType: NetreadyErrorType.validation };
  }
}

/**
 * Generate HTML page with form for login/signup
 * @param label A title of the page
 * @param dataPath The path where login and password should be validated
 * @param redirectPath Path, where user should be redirected after login/signup process
 */
async function generateHtml(label: string, dataPath: string, redirectPath: string) {
  const template = await readFile(`${__dirname}/template.html`, 'utf-8');
  return template
    .replaceAll('%HEADER%', label)
    .replace('%DATA_PATH%', dataPath)
    .replace('%REDIRECT_PATH%', redirectPath);
}

export { validateEmail, login, userInfo, getNetreadyUser, NetReadyConfig, generateHtml };
