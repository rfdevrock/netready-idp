import {Request} from 'express'
import axios, {AxiosRequestConfig} from 'axios';
import {wrapper} from 'axios-cookiejar-support';
import {CookieJar} from 'tough-cookie';

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
}

interface NetReadyConfig {
  baseUrl: string;
  apiKey: string;
  accessCard: string;
  accessPro: string;
  authCookie: string;
}

// Axios instance

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

// Connections

/**
 * Validate email
 * @param config Connection settings
 * @param email
 */
async function validateEmail(config: NetReadyConfig, email: string): Promise<boolean> {
  try {
    const {
      data: { isTaken },
    } = await client.get<ValidateResponse>(`${config.baseUrl}/validate/email?apiKey=${config.apiKey}&email=${email}`);

    return isTaken;
  } catch (e) {
    throw new Error(`NetReady ${email} validation failed`, {cause: e});
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
        config: { jar },
      } = await client.post<
        LoginRequest,
        {
          data: UserResponse;
          config: AxiosRequestConfig;
        }
      >(`${config.baseUrl}/user/login?apiKey=${config.apiKey}`, user);

      // get access cards
      const { data: accessCards } = await client.get<AccessCard[]>(
        `${config.baseUrl}/user/users/${userInfo.userId}/accessCards?apiKey=${config.apiKey}`,
      );
      // get access cookie for future access without credentials
      const cookies = <Cookie[]>jar?.toJSON().cookies;
      const code = cookies.find((c) => c.key === config.authCookie);

      if (code) {
        return {
          ...userInfo,
          accessCard: !!accessCards.find((card) => card.accessCardId === config.accessCard),
          proCard: !!accessCards.find((card) => card.accessCardId === config.accessPro),
          code: code.value,
        };
      }
    }

    return false;
  } catch (e) {
    throw new Error('NetReady login failed', {cause: e});
  }
}

/**
 * If Passport session has user data, validate it, otherwise returns false
 * @param config Connection settings
 * @param req Express.Request
 */
async function userInfo(config: NetReadyConfig, req: Request) {
  try {
    if (req.user && Object.keys(req.user).length) {
      const { userId, code, accessCard, proCard } = <SessionUser>req.user;
      const { data: user } = await client.get<UserResponse>(
        `${config.baseUrl}/user/users/${userId}/?apiKey=${config.apiKey}`,
        {
          headers: { Cookie: `${config.authCookie}=${code}` },
        },
      );
      return { ...user, code, accessCard, proCard };
    } else {
      return false;
    }
  } catch (e) {
    throw new Error('Access to NetReady user info failed', {cause: e});
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
    config: NetReadyConfig,
    req: Request,
    user?: LoginRequest,
) {
  if (user) {
    return login(config, user);
  }
  return userInfo(config, req);
}

export { validateEmail, login, userInfo, getNetreadyUser, NetReadyConfig };
