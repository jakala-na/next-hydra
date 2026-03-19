import type {
  RegistrationApprovalProcessPort,
  RegistrationIdPort,
  RegistrationStorePort,
} from "../domain/ports";
import { createDecideRegistration } from "./decide-registration";
import { createGetRegistration } from "./get-registration";
import { createListRegistrations } from "./list-registrations";
import { createSubmitRegistration } from "./submit-registration";

const defaultIds: RegistrationIdPort = {
  create: () => crypto.randomUUID(),
};

export { createDecideRegistration } from "./decide-registration";
export { createGetRegistration } from "./get-registration";
export { createListRegistrations } from "./list-registrations";
export { createSubmitRegistration } from "./submit-registration";

export function createRegistrationApplication(
  registrations: RegistrationStorePort,
  approvalProcess: RegistrationApprovalProcessPort,
  ids: RegistrationIdPort = defaultIds
) {
  return {
    submitRegistration: createSubmitRegistration({
      registrations,
      approvalProcess,
      ids,
    }),
    getRegistration: createGetRegistration({
      registrations,
    }),
    listRegistrations: createListRegistrations({
      registrations,
    }),
    decideRegistration: createDecideRegistration({
      registrations,
      approvalProcess,
    }),
  };
}

export type RegistrationApplication = ReturnType<
  typeof createRegistrationApplication
>;
