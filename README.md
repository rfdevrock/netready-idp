# netready-idp

This package implements authorization and access to user information from [NetReady](https://netready.co.za/).

The package developed by [RapidFunnel](https://rapidfunnel.com/) company for NetReady.

## Content
1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Usage](#usage)
4. [Errors](#errors)
5. [Eamples](#examples)

## Installation

```shell
npm install netready-idp
```

## Configuration

All these parameters depend on your company, and you should get them from NetReady.

Configuration has to have the next fields:

```text
  baseUrl: string,
  apiKey: string,
  accessCard: string,
  accessPro: string,
  authCookie: string
```
Description:
- **baseUrl**: base URL to your company NetReady IDP, like 'https://XXXX.netready.app/api/v1' where 'XXXX' depends on your company;
- **apiKey**: Encoded API Key for your company;
- **accessCard**: Connector Access Card to use the App that the user must have;
- **accessPro**: Pro Access card to have the Pro version of the App that the user must have;
- **authCookie**: cookie name that returns NetReady IDP API, usually it has name 'gappstack_auth'.

Example:

```typescript
const connectionConfig: NetreadyConfig = {
    baseUrl: 'https://1030.netready.app/api/v1',
    apiKey: 'ZzhRdTMynBiKSCX3O7Akm7hRCgb4sUI7bU-Yuyq6YiFQTZxilYbGYHCeICl6wDIjpA',
    accessCard: '7C64E2F6-0BB0-49B8-830E-B24A44A79B5A',
    accessPro: 'FE574117-C35F-4219-85D3-4CB5E5DF305A',
    authCookie: 'gappstack_auth',
}
```

## Usage

### Email validation

When a user logs into the App, the email is first validated against the Dream Team database
to ensure that the user exists.

```typescript
validateEmail(
    config: NetreadyConfig,
    email: string
);
```

If success returns object ```{isTaken: boolean}```, otherwise error object ```<ErrorResponse>```.

### Login

```typescript
login(
    config: NetreadyConfig,
    user: {username, password}
);
```

If success it returns user object ```UserResponse```. Otherwise, it returns error object ```<ErrorResponse>```

The user object contains additional fields which will be needed for PassportJs session:

- **code**: string (access code);
- **accessCard**: boolean (if true, user must have the Connector Access Card to use the App);
- **proCard**: boolean (if true, user must have the Pro Access card to have the Pro version of the App);

### Get user information

The general representation of the function:

```ts
getNetreadyUser(
    config: NetreadyConfig,
    request: Request,
    user?: {
        username: string;
        password?: string;
    }
)
```

#### Usage in Express session

If you have started express session, the function can be used like:

```ts
getNetreadyUser(
    config: NetreadyConfig,
    request: Request
)
```

#### Usage with user credentials

If username and password are defined, user information can be got by the following:

```ts
getNetreadyUser(
    config: NetreadyConfig,
    request: Request,
    user: {
        username: string;
        password?: string;
    }
)
```

_request here should have type Request imported from Express_

In such a case, **getNetreadyUser** automatically login and get user information.

In case of unsuccessful login or invalid data should be returned error object ```<ErrorResponse>```.

#### Get user information from session

It gets user information from PassportJs session and validates it: 

```ts
userInfo(
    config: NetreadyConfig,
    request: Request
)
```

If information is valid, it returns a user object. Otherwise, it returns error object ```<ErrorResponse>```.

_request here should have type Request imported from Express_

#### HTML form for getting user information

Function **generateHtml** returns HTML page with form for getting user information. It needs next parameters:
- **label**: string  - header and title of HTML page;
- **dataPath**: string - web address where to send username/password;
- **redirectPath**: string - web address where user should be redirected after login/signup.

If **redirectPath** contains _result=error_ query parameter, error with text _'Check login or password'_ above the login form should be shown. 

_Example usage with express:_

```typescript
app.get(
    '/netready',
    async (req: Request, res: Response) => {
        const html = await generateHtml(
            'NetReady', // title
            '/api/auth/netready', // endpoint for user data validation
            '/start' // redirection path
        );
        res.send(html);
    }
);
```

# Errors

Error types in the function responses enumerated in the _NetreadyErrorType_:
```typescript
enum NetreadyErrorType {
  credentials = 'credentials',
  validation = 'validation'
}
```

* In case of positive response from the NetReady IDP functions should return data from this response.
* In case of authorization error (HTTP status 403) should be returned error object: ```{ error: true, errorType: NetreadyErrorType.credentials }```
* In case of authorization error (HTTP status 400) should be returned error object: ```{ error: true, errorType: NetreadyErrorType.validation }```
* In all other cases ```<NetReadyError>``` should be thrown.

#  Examples

## With PassportJs local strategy

```typescript
import passport from 'passport';
import { IStrategyOptionsWithRequest, Strategy } from 'passport-local';
import { getNetreadyUser, NetReadyConfig } from 'netready-idp';

const connectionConfig: NetReadyConfig = {
    baseUrl: 'https://1030.netready.app/api/v1',
    apiKey: 'ZzhRdTMynBiKSCX3O7Akm7hRCgb4sUI7bU-Yuyq6YiFQTZxilYbGYHCeICl6wDIjpA',
    accessCard: '7C64E2F6-0BB0-49B8-830E-B24A44A79B5A',
    accessPro: 'FE574117-C35F-4219-85D3-4CB5E5DF305A',
    authCookie: 'gappstack_auth',
};

const strategySignupOptions: IStrategyOptionsWithRequest = {
  usernameField: 'username',
  passwordField: 'password',
  passReqToCallback: true,
};

passport.use(
  'netready',
  new Strategy(strategySignupOptions, async (req, username, password, done) => {
    try {
      const user = await getNetreadyUser(connectionConfig, req, {
        username,
        password,
      });

      if (user.userId) {
        return done(null, user);
      }

      return done(null, false);
    } catch (err) {
      console.log(err);
    }
  })
);

passport.serializeUser((user, cb) => cb(null, user));

passport.deserializeUser((user, cb) => cb(null, <Express.User>user));

export default passport;
```

# License

netready-idp is distributed under [MIT](https://opensource.org/license/mit/) license.
