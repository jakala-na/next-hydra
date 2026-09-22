export async function setupAuthentication(): Promise<void> {
  const { setupAuthTesting } = await import("@repo/auth/testing");
  await setupAuthTesting();
}
