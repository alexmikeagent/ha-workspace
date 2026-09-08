// Document tools process imported bytes. Give them only the OS utilities and
// UTF-8 locale they need; never inherit the web/worker's Doppler credentials.
// Executable paths themselves come from validated runtime configuration.
export const childEnvironment = {
  PATH: "/usr/bin:/bin",
  LANG: "C.UTF-8",
  PYTHONNOUSERSITE: "1",
}
