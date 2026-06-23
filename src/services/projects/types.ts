import type { ProjectIconColor } from "./iconColors";

export type Project = {
  id: string;
  name: string;
  folderPath: string;
  iconColor: ProjectIconColor;
  createdAt: string;
  updatedAt: string;
};

export type ProjectDraft = {
  name: string;
  folderPath: string;
  iconColor?: ProjectIconColor;
};
