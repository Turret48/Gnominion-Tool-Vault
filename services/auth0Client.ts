import { Auth0Client, createAuth0Client } from '@auth0/auth0-spa-js';

let auth0Client: Auth0Client | null = null;

export const getAuth0Client = async (): Promise<Auth0Client | null> => {
  const domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;

  if (!domain || !clientId) return null;
  if (auth0Client) return auth0Client;

  auth0Client = await createAuth0Client({
    domain,
    clientId,
    authorizationParams: {
      redirect_uri: window.location.origin,
      scope: 'openid profile email',
    },
  });

  return auth0Client;
};
