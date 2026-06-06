export type PathEntry = {
  id: string;
  name: string;
  path: string;
};

export type Workspace = {
  id: string;
  name: string;
  agents: PathEntry[];
  mcps: PathEntry[];
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceDraft = {
  name: string;
  agents: PathEntry[];
  mcps: PathEntry[];
};
