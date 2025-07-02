interface PageProps {
  params: Promise<{ url: string[] }>;
}

const Page = async ({ params }: PageProps) => {
  const { url } = await params;
  return (
    <main style={{ padding: 32 }}>
      <h1>URL Param</h1>
      <pre>{JSON.stringify(url ?? [], null, 2)}</pre>
    </main>
  );
};

export default Page;
