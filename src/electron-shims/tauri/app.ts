import { invoke } from "./core";

export async function getVersion(): Promise<string> {
  return invoke<string>("get_version");
}
