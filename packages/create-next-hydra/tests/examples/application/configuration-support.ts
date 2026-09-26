export const keys = () => ({ API_KEY: "required" });
export const configure = <A>(value: A) => ({ ...value, instrumented: true });
