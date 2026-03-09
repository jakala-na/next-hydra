export type CreateOptions = {
  targetDir?: string;
  yes: boolean;
  skipGit: boolean;
  commit: boolean;
  ref?: string;
  repoUrl: string;
  verbose: boolean;
};

export type ResolvedCreateOptions = CreateOptions & {
  targetDir: string;
  targetPath: string;
  targetName: string;
};

export type StarterDefinition = {
  id: string;
  repoUrl: string;
  defaultRef?: string;
};

export type ScaffoldResult = {
  projectPath: string;
  packageName: string;
  gitInitialized: boolean;
  committed: boolean;
};

export type GitInitResult = {
  gitInitialized: boolean;
  committed: boolean;
  commitError?: string;
};

export type RunCommandResult = {
  stdout: string;
  stderr: string;
};
