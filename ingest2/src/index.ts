import { Env, Hono } from "hono";
import { cors } from "hono/cors";

export { SessionRecorder } from "./SessionRecorder";

// Transform function to add 'foo: "bar"' to each JSON object
async function contextualizeEvents(stream: ReadableStream, context: any) {
  const reader = stream.getReader();
  const transformedChunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    try {
      // Parse each chunk (line) as a JSON object
      const jsonObject = { ...JSON.parse(value), ...context };

      const string = JSON.stringify(jsonObject) + "\n";

      const uint8Array = new TextEncoder().encode(string);

      // Convert the modified object back to a JSON string
      transformedChunks.push(uint8Array);
    } catch (error) {
      console.error("Error processing JSON:", error);
    }
  }

  // Create a new ReadableStream from the transformed chunks
  return new ReadableStream<Uint8Array>({
    start(controller) {
      transformedChunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    maxAge: 600,
  })
);

app.get("/recordings", async (c) => {
  const DB = c.env.DB as D1Database;
  const { results } = await DB.prepare("SELECT * FROM SessionRecordings").all();
  return c.json(results);
});

app.get("/recordings/:id", async (c) => {
  const id = c.env.SessionRecorders.idFromName("sess_12345");
  const stub = c.env.SessionRecorders.get(id);
  const dataFetch = await stub.fetch(
    new URL("/read_current", c.req.url),
    c.req
  );
  return c.json(await dataFetch.json());

  // const { id } = c.req.param();
  // const DB = c.env.DB as D1Database;
  // const data = await DB.prepare("SELECT * FROM SessionRecordings WHERE ID=?1")
  //   .bind(id)
  //   .first();
  // return c.json(data);
});

app.post("/record", async (c) => {
  const lines = (await c.req.text()).split("\n");

  // Create a ReadableStream from the array of lines
  const ndjsonStream = new ReadableStream({
    start(controller) {
      // Enqueue each line as a separate chunk in the stream
      lines.forEach((line) => {
        controller.enqueue(line + "\n");
      });

      // Close the stream after all lines have been enqueued
      controller.close();
    },
  });

  try {
    const transformedStream = await contextualizeEvents(ndjsonStream, {
      user_id: "user_12345",
      session_id: "sess_12345",
    });

    const tbres = await fetch(
      "https://api.us-east.tinybird.co/v0/events?name=session_events",
      {
        method: "post",
        body: transformedStream,
        headers: {
          authorization: "Bearer",
        },
      }
    );
    console.log(await tbres.text());
  } catch (e) {
    console.log(e);
  }

  return c.text("Done");
});

app.get("/record", (c) => {
  return c.text("Hello Hono!");
});

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/sr/ws") {
      console.log("in short");
      const id = env.SessionRecorders.idFromName("sess_12345");
      const stub = env.SessionRecorders.get(id);
      return await stub.fetch(request);
    } else {
      return app.fetch(request, env);
    }
  },
};
