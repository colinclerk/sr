import Link from "next/link";
import Player from "../player";

export default async function Home({ params: { loadId } }) {
  let url = new URL(`http://localhost:8787/recordings/${loadId}`);
  const result = await fetch(url, {
    cache: "no-cache",
  });
  const events = await result.json();
  return (
    <main className="min-h-screen justify-between p-24">
      <Link href="/">Back to all recordings</Link>
      {/* <pre>{JSON.stringify(events, null, 2)}</pre> */}
      <h1>Watch</h1>
      <Player events={events} loadId={1} />
    </main>
  );
}
