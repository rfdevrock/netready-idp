# netready-idp

## Introduction

This package implements authorization and access to user information from [NetReady](https://netready.co.za/).

## Installation

```bash
npm install netready-idp
```

## Config

Configuration file should have next fields:

```text
  baseUrl: string,
  apiKey: string,
  accessCard: string,
  accessPro: string,
  authCookie: string
```

Example:

```typescript
const connectionConfig: NetreadyConfig = {
    baseUrl: 'https://XXXXX.netready.app/api/v1',
    apiKey: '0nYk...jVQ',
    accessCard: 'EBT...0E2',
    accessPro: 'DD8...CB8',
    authCookie: 'gappstack_auth',
}
```

## Email validation

When a user logs into the App, the email is first validated against the Dream Team database
to ensure that the user exists.

```typescript
validateEmail(
    config: NetreadyConfig,
    email: string
);
```

Returns boolean.

If error occurs, throw error with message _NetReady email validation failed_.

## Login

```typescript
login(
    config: NetreadyConfig,
    user: {username, password}
);
```

If success, returns user object, otherwise - false.

User object contains additionally fields, needed for PassportJs session:

- code: access cookie;
- accessCard: boolean (if true, user must have the Connector Access Card to use the App);
- proCard: boolean (if true, user must have the Pro Access card to have the Pro version of the App);

If error occurs, throw error with message _NetReady login failed_.

## Get user information

```ts
userInfo(
    config: NetreadyConfig,
    request: Request
)
```

_request here should have type Request imported from Express_

Get user information from PassportJs session and validate it.

If information is valid, returns user object, otherwise - false.

If error occurs, throw error with message _NetReady login failed_.

## Get user information

Function **getNetreadyUser** unite all functions above in one

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

Returns user object. If _user_ in not defined, will try to sign in, otherwise will try to get user information from
PassportJs session and validate it. In case of unsuccessful sign-in or invalid data _false_ should be returned.

#  Examples

## With PassportJs local strategy

```typescript
import passport from 'passport';
import { IStrategyOptionsWithRequest, Strategy } from 'passport-local';
import { getNetreadyUser, NetReadyConfig } from 'netready-idp';

const connectionConfig: NetReadyConfig = {
  baseUrl: 'https://XXX.netready.app/api/v1',
  apiKey: '0nY...jVQ',
  accessCard: 'EB4...0E2',
  accessPro: 'DD8...CB8',
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

[MIT](https://opensource.org/license/mit/)
