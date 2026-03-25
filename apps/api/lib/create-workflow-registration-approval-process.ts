import { RegistrationApprovalProcessError } from "@repo/registration/domain/errors";
import type { RegistrationApprovalProcessPort } from "@repo/registration/domain/ports";
import type {
  RegistrationApprovalDecision,
  RegistrationWorkflowInput,
  StartRegistrationResult,
} from "@repo/registration/domain/types";
import { Result } from "better-result";
import { resumeHook, start } from "workflow/api";
import { registerCompanyWorkflow } from "@/workflows/register-company";

type WorkflowRegistrationApprovalProcessDependencies = {
  startWorkflow(
    input: RegistrationWorkflowInput
  ): Promise<Pick<StartRegistrationResult, "runId">>;
  resumeApproval(
    hookToken: string,
    approval: RegistrationApprovalDecision
  ): Promise<void>;
};

const defaultDependencies: WorkflowRegistrationApprovalProcessDependencies = {
  async startWorkflow(input) {
    const run = await start(registerCompanyWorkflow, [input]);

    return {
      runId: run.runId,
    };
  },
  async resumeApproval(hookToken, approval) {
    await resumeHook(hookToken, approval);
  },
};

export function createWorkflowRegistrationApprovalProcess(
  dependencies: WorkflowRegistrationApprovalProcessDependencies = defaultDependencies
): RegistrationApprovalProcessPort {
  return {
    startWorkflow(input) {
      return Result.tryPromise({
        try: () => dependencies.startWorkflow(input),
        catch: (cause: unknown): RegistrationApprovalProcessError =>
          new RegistrationApprovalProcessError({
            operation: "start_workflow",
            cause,
          }),
      });
    },
    async resumeApproval(hookToken, approval) {
      const resumeResult = await Result.tryPromise({
        try: () => dependencies.resumeApproval(hookToken, approval),
        catch: (cause: unknown): RegistrationApprovalProcessError =>
          new RegistrationApprovalProcessError({
            operation: "resume_approval",
            cause,
          }),
      });

      if (resumeResult.isErr()) {
        return resumeResult;
      }

      return Result.ok(undefined);
    },
  };
}
