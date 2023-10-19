import {Request} from 'express';
import axios, {AxiosError, AxiosRequestConfig} from 'axios';
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';
import {readFile} from 'fs/promises';

// Interfaces

interface SessionUser extends UserResponse {
  code: string;
  accessCard: boolean;
  proCard: boolean;
}

interface ValidateResponse {
  isTaken: boolean;
}

interface LoginRequest {
  username: string;
  password?: string;
}

interface UserResponse {
  username: string;
  profilePictureMediaSourceId: string;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
}

interface Cookie {
  key: string;
  value: string;
}

interface AccessCard {
  userId: number;
  accessCardId: string;
  accessCardName: string;
}

enum AccessCardName {
  connector = 'Connector',
  pro = 'Pro Connector'
}

interface NetReadyConfig {
  baseUrl: string;
  apiKey: string;
  accessCard: string;
  accessPro: string;
  authCookie: string;
}

// Custom error

class NetReadyError extends Error {
  constructor(message: string, options: ErrorOptions) {
    super(message, options);
    this.name = 'NetReadyError';
  }
}

// Axios instance

const jar = new CookieJar();
const client = wrapper(axios.create({jar}));

// Connections

/**
 * Validate email
 * @param config Connection settings
 * @param email
 */
async function validateEmail(
    config: NetReadyConfig, email: string): Promise<boolean> {
  try {
    const {
      data: {isTaken},
    } = await client.get<ValidateResponse>(
        `${config.baseUrl}/validate/email?apiKey=${config.apiKey}&email=${email}`);

    return isTaken;
  } catch (e) {
    if (e instanceof AxiosError) {
      return false;
    }
    throw new NetReadyError(`NetReady ${email} validation failed`, {cause: e});
  }
}

/**
 * Get user access cards
 * @param config Connection settings
 * @param userId user ID from NetReady
 */
async function accessCards(config: NetReadyConfig, userId: number) {
  try {
    const {data: accessCards} = await client.get<AccessCard[]>(
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

    return {accessCard, proCard};
  } catch (e) {
    if (e instanceof AxiosError) {
      return false;
    }
    throw new NetReadyError('Getting access cards failed', {cause: e});
  }
}

/**
 * Login to NetReady and check access to app
 * @param config Connection settings
 * @param user username and password
 */
async function login(config: NetReadyConfig, user: LoginRequest) {
  try {
    const validEmail = await validateEmail(config, user.username);

    if (validEmail) {
      // login and get cookies
      const {
        data: userInfo,
        config: {jar},
      } = await client.post<
          LoginRequest,
          {
            data: UserResponse;
            config: AxiosRequestConfig;
          }
      >(`${config.baseUrl}/user/login?apiKey=${config.apiKey}`, user);

      if (userInfo) {
        // get access cookie for future access without credentials
        const cookies = <Cookie[]>jar?.toJSON().cookies;
        const code = cookies.find((c) => c.key === config.authCookie);
        const cards = await accessCards(config, userInfo.userId);

        if (code && cards) {
          return {
            ...userInfo,
            accessCard: cards.accessCard,
            proCard: cards.proCard,
            code: code.value,
          };
        }
      }
    }

    return false;
  } catch (e) {
    if (e instanceof AxiosError) {
      return false;
    }
    throw new NetReadyError('NetReady login failed', {cause: e});
  }
}

/**
 * If Passport session has user data, validate it, otherwise returns false
 * @param config Connection settings
 * @param req Express.Request
 */
async function userInfo(config: NetReadyConfig, req: Request) {
  try {
    if (req.user) {
      const {userId, code} = <SessionUser>req.user;
      const cards = await accessCards(config, userId);

      if (cards) {
        const {data: user} = await client.get<UserResponse>(
            `${config.baseUrl}/user/users/${userId}/?apiKey=${config.apiKey}`,
            {
              headers: {Cookie: `${config.authCookie}=${code}`},
            },
        );

        return {
          ...user,
          code,
          accessCard: cards.accessCard,
          proCard: cards.proCard,
        };
      }

    }

    return false;
  } catch (e) {
    if (e instanceof AxiosError) {
      return false;
    }
    throw new NetReadyError('Access to NetReady user info failed', {cause: e});
  }
}

/**
 * Returns user object. If user in not undefined, will try to sign in,
 * otherwise will try to get user information from PassportJs session
 * and validate it. In case of unsuccessful sign-in or invalid data false
 * should be returned.
 * @param config Connection settings
 * @param req Express.Request
 * @param user Passport session user
 */

async function getNetreadyUser(
    config: NetReadyConfig, req: Request, user?: LoginRequest) {
  try {
    if (user) {
      return login(config, user);
    }
    return userInfo(config, req);
  } catch {
    return false;
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
