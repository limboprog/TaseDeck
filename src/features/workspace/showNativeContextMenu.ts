export type NativeContextMenuItem = {
  id: string;
  label: string;
  onSelect: () => void;
};

export async function showNativeContextMenu(items: NativeContextMenuItem[]) {
  if (items.length === 0) {
    return;
  }

  try {
    const { Menu } = await import("@tauri-apps/api/menu");
    const menu = await Menu.new({
      items: items.map((item) => ({
        id: item.id,
        text: item.label,
        action: () => {
          item.onSelect();
        },
      })),
    });

    await menu.popup();
  } catch (error) {
    console.error("Failed to open native context menu", error);
  }
}

export function openGraphContextMenu(
  event: { preventDefault: () => void; stopPropagation: () => void },
  items: NativeContextMenuItem[],
) {
  event.preventDefault();
  event.stopPropagation();
  void showNativeContextMenu(items);
}
