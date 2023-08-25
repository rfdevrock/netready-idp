# netready-idp

## Introduction

This package implements authorization and access to user information from [NetReady](https://netready.co.za/).

The package developed by [RapidFunnel](https://rapidfunnel.com/) company for NetReady.

## Installation

```bash
npm install netready-idp
```

## Configuration

All these parameters depends on you company, and you should get them from NetReady.

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

Returns boolean.

In any error case it throws error with message _NetReady email validation failed_.

### Login

```typescript
login(
    config: NetreadyConfig,
    user: {username, password}
);
```

If success it returns user object. Otherwise, it returns false.

The user object contains additionally fields which will be needed for PassportJs session:

- **code**: string (access code);
- **accessCard**: boolean (if true, user must have the Connector Access Card to use the App);
- **proCard**: boolean (if true, user must have the Pro Access card to have the Pro version of the App);

In any error case it throws error with message _NetReady login failed_.

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

If you have started express session the function can be used like:

```ts
getNetreadyUser(
    config: NetreadyConfig,
    request: Request,
)
```

#### Usage with user credentials

If username and password defined, user information can be got by the following:

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

In such case, **getNetreadyUser** automatically login and get user information. In case of unsuccessful login or invalid data _false_ should be returned.

#### Get user information from session

It gets user information from PassportJs session and validate it: 

```ts
userInfo(
    config: NetreadyConfig,
    request: Request
)
```

If information is valid it returns user object. Otherwise, it returns false.

_request here should have type Request imported from Express_


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

      if (user) {
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
