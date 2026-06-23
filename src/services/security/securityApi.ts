import { invoke } from "@tauri-apps/api/core";

export function getUseOsKeyring(): Promise<boolean> {
  return invoke<boolean>("security_get_use_os_keyring");
}

export function setUseOsKeyring(enabled: boolean): Promise<void> {
  return invoke("security_set_use_os_keyring", { enabled });
}
