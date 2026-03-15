export const ACCESS_TOKEN_COOKIE_NAME = "cp_access_token";
export const REFRESH_TOKEN_COOKIE_NAME = "cp_refresh_token";
// Cookie que guarda el profile_id seleccionado cuando un usuario tiene varios perfiles (roles)
export const PROFILE_ID_COOKIE_NAME = "cp_profile_id";

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}
