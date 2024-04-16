import { Request } from 'express';
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { readFile } from 'fs/promises';
import {
  AccessCard,
  AccessCardName,
  Cookie,
  ErrorResponse,
  IdpErrorResponse,
  IdpUserResponse,
  LoginRequest,
  NetReadyConfig,
  NetreadyErrorType,
  UserResponse,
  ValidateResponse,
} from './types';

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

// Axios instance

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

// Connections

/**
 * Validate email by NetReady
 * @param config Connection settings
 * @param email
 * @returns if success {isTaken: boolean}, otherwise <ErrorResponse>
 */
async function validateEmail(
  config: NetReadyConfig, email: string,
): Promise<ErrorResponse | { isTaken: boolean }> {
  try {
    const encodedEmail = encodeURIComponent(email);

    const {
      data: { isTaken },
    } = await client.get<ValidateResponse>(
      `${config.baseUrl}/validate/email?apiKey=${config.apiKey}&email=${encodedEmail}`);

    logMessage('Email validation result', isTaken);
    return { isTaken };
  } catch (e) {
    if (e instanceof AxiosError) {
      logMessage('Email validation network error', e?.response?.status);
      return { error: true, errorType: NetreadyErrorType.validation };
    }
    throw new NetReadyError(`NetReady ${email} validation failed`,
      { cause: e });
  }
}

/**
 * Get user access cards
 * @param config Connection settings
 * @param userId user ID from NetReady
 * @returns { accessCard: boolean, proCard: boolean }, otherwise: <ErrorResponse>
 */
async function accessCards(config: NetReadyConfig, userId: number) {
  try {
    const { data: accessCards } = await client.get<AccessCard[]>(
      `${config.baseUrl}/user/users/${userId}/accessCards?apiKey=${config.apiKey}`,
    );

    const accessCard = !!accessCards.find(({
        accessCardId,
        accessCardName,
      }) => accessCardName === AccessCardName.connector &&
        accessCardId === config.accessCard,
    );

    const proCard = !!accessCards.find(
      ({
        accessCardId,
        accessCardName,
      }) => accessCardName === AccessCardName.pro &&
        accessCardId === config.accessPro,
    );

    logMessage('Access cards validation result', { accessCard, proCard });
    return { accessCard, proCard };
  } catch (e) {
    if (e instanceof AxiosError) {
      logMessage('Access cards validation network error', e?.response?.status);
      return { error: true, errorType: NetreadyErrorType.validation };
    }
    throw new NetReadyError('Getting access cards failed', { cause: e });
  }
}

/**
 * Login to NetReady and check access to app
 * @param config Connection settings
 * @param user username and password
 * @returns if success <UserResponse>, otherwise <ErrorResponse>
 */
async function login(
  config: NetReadyConfig,
  user: LoginRequest): Promise<ErrorResponse | UserResponse> {
  try {
    const emailCheck = await validateEmail(config, user.username);

    if ('isTaken' in emailCheck) {
      if (emailCheck.isTaken) {
        // login and get cookies
        const {
          data: userInfo,
          config: { jar },
        } = await client.post<
          LoginRequest,
          {
            data: IdpUserResponse | IdpErrorResponse;
            config: AxiosRequestConfig;
          }
        >(`${config.baseUrl}/user/login?apiKey=${config.apiKey}`, user);

        if ('userId' in userInfo) {
          // get access cookie for future access without credentials
          const cookies = <Cookie[]>jar?.toJSON().cookies;
          const code = cookies.find((c) => c.key === config.authCookie);
          const cards = await accessCards(config, userInfo.userId);

          if (code) {
            logMessage('Login result', { user: user.username, success: true });
            return {
              ...userInfo,
              accessCard: cards?.accessCard || false,
              proCard: cards?.proCard || false,
              code: code.value,
            };
          }
        }
      } else {
        logMessage('Login result', { user: user.username, success: false });
        return { error: true, errorType: NetreadyErrorType.credentials };
      }
    }

    logMessage('Login result', { user: user.username, success: false });
    return { error: true, errorType: NetreadyErrorType.validation };
  } catch (e) {
    if (e instanceof AxiosError) {
      logMessage('Login network error', e?.response?.status);
      if (e?.response?.status === 403) {
        return { error: true, errorType: NetreadyErrorType.credentials };
      }
      return { error: true, errorType: NetreadyErrorType.validation };
    }
    throw new NetReadyError('NetReady login failed', { cause: e });
  }
}

/**
 * Validate PassportJs session user data
 * @param config Connection settings
 * @param req Express.Request
 * @returns if success <UserResponse>, otherwise <ErrorResponse>
 */
async function userInfo(
  config: NetReadyConfig, req: Request): Promise<ErrorResponse | UserResponse> {
  try {
    if (req.user) {
      const { userId, code } = <UserResponse>req.user;
      const cards = await accessCards(config, userId);

      if (cards.accessCard) {
        const { data: user } = await client.get<IdpUserResponse>(
          `${config.baseUrl}/user/users/${userId}/?apiKey=${config.apiKey}`,
          {
            headers: { Cookie: `${config.authCookie}=${code}` },
          },
        );

        logMessage('User info result', { userId, success: true });
        return {
          ...user,
          code,
          accessCard: cards.accessCard,
          proCard: cards.proCard,
        };
      }

    }

    logMessage('User info result', { success: false });
    return { error: true, errorType: NetreadyErrorType.validation };
  } catch (e) {
    if (e instanceof AxiosError) {
      logMessage('User info network error', e?.response?.status);
      return { error: true, errorType: NetreadyErrorType.validation };
    }
    throw new NetReadyError('Access to NetReady user info failed',
      { cause: e });
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
  config: NetReadyConfig, req: Request,
  user?: LoginRequest): Promise<ErrorResponse | UserResponse> {
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
async function generateHtml(
  label: string, dataPath: string, redirectPath: string) {
  const template = await readFile(`${__dirname}/template.html`, 'utf-8');
  return template.replaceAll('%HEADER%', label).
    replace('%DATA_PATH%', dataPath).
    replace('%REDIRECT_PATH%', redirectPath);
}

export {
  validateEmail,
  login,
  userInfo,
  getNetreadyUser,
  NetReadyConfig,
  generateHtml,
};
