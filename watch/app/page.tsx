import Link from "next/link";

export default async function Home() {
  let url = new URL(
    `https://api.us-east.tinybird.co/v0/pipes/find_loads_by_user.json?user_id=user_12345`
  );
  const result = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.TB_KEY}`,
    },
    cache: "no-cache",
  });
  const load_ids = (await result.json()).data.map((x) => x.load_id);
  return (
    <main className="min-h-screen justify-between p-24">
      <h1>Recordings</h1>
      <ul>
        {load_ids.map((loadId) => (
          <li key={`load-${loadId}`}>
            <Link href={`/watch/${loadId}`}>Watch {loadId}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
