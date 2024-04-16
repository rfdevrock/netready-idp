export type ValidateResponse = {
  isTaken: boolean;
}

export type LoginRequest = {
  username: string;
  password?: string;
}

export interface IdpUserResponse {
  username: string;
  profilePictureMediaSourceId: string;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
}

export interface UserResponse extends IdpUserResponse {
  accessCard: boolean;
  proCard: boolean;
  code: string;
}

type Idp403Response = {
  status: 'failure';
  error: string; //"Wrong email or password"
}

type Idp400Response = {
  errors: Record<string, string[]>;
  title: string; // One or more validation errors occurred.
}

export type IdpErrorResponse = Idp400Response | Idp403Response;

export enum NetreadyErrorType {
  credentials = 'credentials',
  validation = 'validation'
}

export type ErrorResponse = {
  error: boolean;
  errorType: NetreadyErrorType;
};

export type AccessCard = {
  userId: number;
  accessCardId: string;
  accessCardName: string;
}

export enum AccessCardName {
  connector = 'Connector',
  pro = 'Pro Connector'
}

export interface NetReadyConfig {
  baseUrl: string;
  apiKey: string;
  accessCard: string;
  accessPro: string;
  authCookie: string;
}

export type Cookie = {
  key: string;
  value: string;
}
