import { open } from "@tauri-apps/plugin-dialog";

export async function pickProjectDirectory(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select project folder",
  });

  if (selected === null || Array.isArray(selected)) {
    return null;
  }
  return selected;
}
