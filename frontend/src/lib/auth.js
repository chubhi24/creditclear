import { AuthenticationDetails, CognitoUser, CognitoUserPool } from "amazon-cognito-identity-js";

const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

export function isCognitoConfigured() {
  return Boolean(poolId && clientId && !poolId.includes("XXXX"));
}

function getPool() {
  if (!isCognitoConfigured()) {
    throw new Error("Cognito is not configured. Add VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID to frontend/.env.");
  }
  return new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
}

export function getCurrentUser() {
  if (!isCognitoConfigured()) return null;
  return getPool().getCurrentUser();
}

export function signIn(email, password) {
  const user = new CognitoUser({ Username: email, Pool: getPool() });
  const details = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve({ user, session }),
      onFailure: (err) => reject(err),
      newPasswordRequired: () =>
        reject(new Error("This account must set a new password in the Cognito console before signing in.")),
    });
  });
}

export function getSession() {
  const user = getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    user.getSession((err, session) => {
      if (err) reject(err);
      else resolve(session?.isValid() ? session : null);
    });
  });
}

export function signOut() {
  getCurrentUser()?.signOut();
}
