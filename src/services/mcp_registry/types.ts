export type McpSourceId = "all" | "local" | "remote";

export type McpRepository = {
  url: string;
  source?: string;
  id?: string;
  subfolder?: string;
};

export type McpArgument = {
  name?: string;
  value?: string;
  valueHint?: string;
  description?: string;
  type?: "positional" | "named";
  format?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  isRepeated?: boolean;
  default?: string;
  placeholder?: string;
  choices?: string[];
  variables?: Record<string, McpInputVariable>;
};

export type McpInputVariable = {
  description?: string;
  format?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
  placeholder?: string;
};

export type McpEnvVariable = {
  name: string;
  description?: string;
  value?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
  format?: string;
};

export type McpPackage = {
  registryType: string;
  identifier: string;
  version?: string;
  registryBaseUrl?: string;
  runtimeHint?: string;
  runtimeArguments?: McpArgument[];
  packageArguments?: McpArgument[];
  transport?: { type: string; url?: string };
  environmentVariables?: McpEnvVariable[];
};

export type McpRemoteHeader = {
  name: string;
  description?: string;
  value?: string;
  isRequired?: boolean;
  isSecret?: boolean;
};

export type McpRemote = {
  type: string;
  url: string;
  headers?: McpRemoteHeader[];
  variables?: Record<string, McpInputVariable>;
};

export type McpServer = {
  name: string;
  title?: string;
  description?: string;
  version: string;
  websiteUrl?: string;
  repository?: McpRepository;
  remotes?: McpRemote[];
  packages?: McpPackage[];
};

export type McpServerMeta = {
  status?: string;
  publishedAt?: string;
  updatedAt?: string;
  isLatest?: boolean;
};

export type McpServerEntry = {
  server: McpServer;
  meta: McpServerMeta;
};

export type McpListParams = {
  search?: string;
  cursor?: string;
  limit?: number;
};

export type McpListResult = {
  servers: McpServerEntry[];
  nextCursor?: string;
  count: number;
};

export type McpListProvider = {
  id: McpSourceId;
  label: string;
  supportsRemoteSearch: boolean;
  list: (params: McpListParams) => Promise<McpListResult>;
};
