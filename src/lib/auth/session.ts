export const ACCESS_TOKEN_COOKIE_NAME = "cp_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "cp_refresh_token";

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}
