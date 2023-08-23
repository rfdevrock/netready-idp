# NetReady authorisation for Express and PassportJs

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

```ts
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

```ts
validateEmail(config, email)
```

Returns boolean.

If error occurs, throw error with message _NetReady email validation failed_.

## Login

```ts
login(config, {username, password})
```

If success, returns user object, otherwise - false.

User object contains additionally fields, needed for PassportJs session:

- code: access cookie;
- accessCard: boolean (if true, user must have the Connector Access Card to use the App);
- proCard: boolean (if true, user must have the Pro Access card to have the Pro version of the App);

If error occurs, throw error with message _NetReady login failed_.

## Get user information

```ts
userInfo(config, request)
```

Get user information from PassportJs session and validate it.

If information is valid, returns user object, otherwise - false.

If error occurs, throw error with message _NetReady login failed_.

## Get user information

Function **getNetreadyUser** unite all functions above in one

```ts
getNetreadyUser(config, request, user)
```

Returns user object. If _user_ in not defined, will try to sign in, otherwise will try to get user information from
PassportJs session and validate it. In case of unsuccessful sign-in or invalid data _false_ should be returned.
