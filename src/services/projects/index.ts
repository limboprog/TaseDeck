export { pickProjectDirectory } from "./api";
export { folderBaseName } from "./folderName";
export {
  PROJECT_ICON_COLORS,
  pickRandomProjectIconColor,
  resolveProjectIconColor,
  type ProjectIconColor,
} from "./iconColors";
export {
  createProjectRecord,
  deleteProjectRecord,
  listProjectRecords,
  notifyProjectsChanged,
  PROJECTS_CHANGED_EVENT,
} from "./recordsApi";
export {
  getProjectDetail,
  getAgentAssignment,
  updateProjectAssignmentOverrides,
  assignProjectPreset,
  addProjectServer,
  removeProjectServer,
  unassignProjectPreset,
  linkProjectAgent,
  unlinkProjectAgent,
  resetProjectAgent,
  exportProjectProxyConfig,
} from "./detailApi";
export type {
  ProjectAssignmentDetail,
  ProjectAgentAssignment,
  ProjectDetail,
  ProjectPresetServerDetail,
} from "./detailApi";
export {
  mergeServerArgsValues,
  mergeServerEnvValues,
  parseProjectConfigOverrides,
  serializeProjectConfigOverrides,
  type ProjectConfigOverrides,
  type ProjectServerOverridePatch,
} from "./projectOverrides";
export {
  addStoredProject,
  clearStoredProjects,
  getStoredProjects,
  removeStoredProject,
} from "./storage";
export type { Project, ProjectDraft } from "./types";
