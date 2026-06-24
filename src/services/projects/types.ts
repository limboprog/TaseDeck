import type { ProjectIconColor } from "./iconColors";

export type Project = {
  id: string;
  name: string;
  folderPath: string;
  iconColor: ProjectIconColor;
  createdAt: string;
  updatedAt: string;
  diskSyncPending: boolean;
};

export type ProjectDraft = {
  name: string;
  folderPath: string;
  iconColor?: ProjectIconColor;
};
