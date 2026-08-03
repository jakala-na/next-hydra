import type { serverKeys } from "../keys";

export type CommerceCliEnvironment = ReturnType<typeof serverKeys>;
export type CommerceCliEnvironmentProvider = () => CommerceCliEnvironment;
