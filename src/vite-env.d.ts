interface ImportMetaEnv {
  /** The commit a CI build was made from; unset in local builds. */
  readonly VITE_BUILD_COMMIT?: string;
}
