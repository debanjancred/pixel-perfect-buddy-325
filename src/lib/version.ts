// Falls back to "dev" where the build-time constant isn't defined (e.g. unit tests).
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
