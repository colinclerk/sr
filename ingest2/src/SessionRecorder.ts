import { compress, decompressSync, strFromU8 } from "fflate";
import { generate as genKsuid } from "xksuid";

type MetaType = {
  curRecId: string;
  curKey: number;
  curSize: number;
  breakpoints: { k: number; i: number }[]; // key, index
};

async function handleErrors(request, func) {
  try {
    return await func();
  } catch (err) {
    if (request.headers.get("Upgrade") == "websocket") {
      // Annoyingly, if we return an HTTP error in response to a WebSocket request, Chrome devtools
      // won't show us the response body! So... let's send a WebSocket response with an error
      // frame instead.
      let pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({ error: err.stack }));
      pair[1].close(1011, "Uncaught exception during session setup");
      return new Response(null, { status: 101, webSocket: pair[0] });
    } else {
      return new Response(err.stack, { status: 500 });
    }
  }
}

export class SessionRecorder {
  state: DurableObjectState;
  env: Env;
  DB: D1Database;
  storage: DurableObjectStorage;
  connections: Map<WebSocket, { connectionId: string }>;

  // chunkSize = 131072;
  chunkSize = 1024;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;

    // `state.storage` provides access to our durable storage. It provides a simple KV
    // get()/put() interface.
    this.storage = state.storage;

    // `env` is our environment bindings (discussed earlier).
    this.env = env;

    this.DB = this.env.DB;

    // We will track metadata for each client WebSocket object in `sessions`.
    this.connections = new Map();
    this.state.getWebSockets().forEach((webSocket) => {
      // The constructor may have been called when waking up from hibernation,
      // so get previously serialized metadata for any existing WebSockets.
      let meta = webSocket.deserializeAttachment();

      // We don't send any messages to the client until it has sent us the initial user info
      // message. Until then, we will queue messages in `session.blockedMessages`.
      // This could have been arbitrarily large, so we won't put it in the attachment.
      this.connections.set(webSocket, meta);
    });
  }

  async getId() {
    return `sesrec_${await genKsuid()}`;
  }

  async fetch(request: Request) {
    return await handleErrors(request, async () => {
      let url = new URL(request.url);

      switch (url.pathname) {
        case "/read_current": {
          return new Response(JSON.stringify(await this.readCurrent()), {
            status: 200,
          });
        }
        case "/sr/ws": {
          // The request is to `/api/room/<name>/websocket`. A client is trying to establish a new
          // WebSocket session.
          if (request.headers.get("Upgrade") != "websocket") {
            return new Response("expected websocket", { status: 400 });
          }

          // Get the client's IP address for use with the rate limiter.
          let ip = request.headers.get("CF-Connecting-IP");

          // To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
          // i.e. two WebSockets that talk to each other), we return one end of the pair in the
          // response, and we operate on the other end. Note that this API is not part of the
          // Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
          // any way to act as a WebSocket server today.
          let pair = new WebSocketPair();

          // We're going to take pair[1] as our end, and return pair[0] to the client.
          await this.handleConnection(pair[1]);

          // Now we return the other end of the pair to the client.
          return new Response(null, { status: 101, webSocket: pair[0] });
        }

        default:
          return new Response("Not found", { status: 404 });
      }
    });
  }

  async handleConnection(webSocket: WebSocket) {
    // Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
    // WebSocket in JavaScript, not sending it elsewhere.
    this.state.acceptWebSocket(webSocket);

    // attach limiterId to the webSocket so it survives hibernation
    let meta = { connectionId: self.crypto.randomUUID() };
    webSocket.serializeAttachment({
      ...webSocket.deserializeAttachment(),
      ...meta,
    });
    this.connections.set(webSocket, meta);
  }

  async saveEvents(buffer: ArrayBuffer) {
    console.log("Save Called");

    let isNew = false;
    let meta = await this.storage.get<MetaType>("meta");

    if (!meta) {
      isNew = true;
      const newRecId = await this.getId();
      meta = {
        curRecId: newRecId,
        curKey: 0,
        curSize: 0,
        breakpoints: [],
      };
    }

    let curKeyVal =
      meta.curSize === 0
        ? new Uint8Array()
        : ((await this.storage.get(`d${meta.curKey}`)) as Uint8Array);

    const bytesToSave = buffer.byteLength;
    console.log("Need to save", bytesToSave);

    let bytesSaved = 0;
    while (bytesToSave !== bytesSaved) {
      console.log("In loop, so far saved", bytesSaved);
      const availableInCurKey = this.chunkSize - meta.curSize;
      const bytesLeftToSave = bytesToSave - bytesSaved;
      if (availableInCurKey >= bytesLeftToSave) {
        console.log("hitting no more overflow");
        let newVal;
        const dataToSave = new Uint8Array(buffer, bytesSaved);
        if (meta.curSize === 0) {
          newVal = dataToSave;
        } else {
          newVal = new Uint8Array(meta.curSize + bytesToSave);
          newVal.set(curKeyVal);
          newVal.set(dataToSave, meta.curSize);
        }
        await this.storage.put(`d${meta.curKey}`, newVal);
        meta.curSize += bytesToSave - bytesSaved;
        meta.breakpoints.push({
          k: meta.curKey,
          i: meta.curSize,
        });
        break;
      } else {
        console.log("Hitting overflow");
        const newVal = new Uint8Array(this.chunkSize);
        if (meta.curSize === 0) {
          newVal.set(new Uint8Array(buffer, bytesSaved, this.chunkSize));
          bytesSaved += this.chunkSize;
        } else {
          const bytesAvailable = this.chunkSize - meta.curSize;
          newVal.set(curKeyVal);
          newVal.set(new Uint8Array(buffer, 0, bytesAvailable), meta.curSize);
          bytesSaved += bytesAvailable;
        }
        await this.storage.put(`d${meta.curKey}`, newVal);
        curKeyVal = new Uint8Array();
        meta.curKey += 1;
        meta.curSize = 0;
      }
    }
    if (isNew) {
      await this.DB.prepare(
        "INSERT INTO SessionRecordings (ID, Bucketed) VALUES (?1, ?2)"
      )
        .bind(meta.curRecId, 0)
        .run();
    }
    await this.storage.put("meta", meta);
    console.log("Saving meta", meta);
  }

  async readCurrent() {
    const meta = await this.storage.get<MetaType>("meta");
    if (!meta) {
      throw new Error("Nothing current to read.");
    }
    if (meta.breakpoints.length === 0) {
      console.log("no brkpoints");
      return [];
    }

    const chunks = new Array<Uint8Array>(meta.curKey + 1);
    for (let i = 0; i <= meta.curKey; i++) {
      const chunk = await this.storage.get<Uint8Array>(`d${i}`);
      if (!chunk) {
        throw new Error(`Chunk d${i} not found.`);
      }
      chunks[i] = chunk;
    }

    const segments = new Array();
    for (let j = 0; j < meta.breakpoints.length; j++) {
      console.log(j);
      const start = j === 0 ? { k: 0, i: 0 } : meta.breakpoints[j - 1];
      const end = meta.breakpoints[j];
      let compressedSegment: Uint8Array;
      if (start.k === end.k) {
        compressedSegment = chunks[start.k].slice(start.i, end.i);
      } else {
        let size = this.chunkSize - start.i; // start piece size
        size += this.chunkSize * (end.k - start.k - 1); // total size of any in between
        size += end.i; // end piece size
        compressedSegment = new Uint8Array(size);
        let offset = 0;
        compressedSegment.set(
          chunks[start.k].slice(start.i, this.chunkSize),
          offset
        );
        offset += this.chunkSize - start.i;
        for (let i = start.k + 1; i < end.k; i++) {
          compressedSegment.set(chunks[i], offset);
          offset += this.chunkSize;
        }
        compressedSegment.set(chunks[end.k].slice(0, end.i), offset);
      }
      const data = JSON.parse(strFromU8(decompressSync(compressedSegment)));
      if (data[0].type === 4) {
        // Create new segment
        segments.push(data);
      } else {
        // Append to existing segment
        segments[segments.length - 1].push(...data);
      }
    }
    console.log(segments);

    return segments;
  }

  // var mergedArray = new Uint8Array(arrayOne.length + arrayTwo.length);
  // mergedArray.set(arrayOne);
  // mergedArray.set(arrayTwo, arrayOne.length);

  // var part1 = new Uint8Array(arr.buffer, 0, 8);
  // var part2 = new Uint8Array(arr.buffer, 8);

  async webSocketMessage(webSocket, message) {
    try {
      const connection = this.connections.get(webSocket);
      if (!connection) {
        return;
      }
      await this.saveEvents(message);
      // const msg = new Uint8Array(compressedmsg)
      // const { connectionId } = connection;
      // const msg = strFromU8(decompressSync(new Uint8Array(compressedmsg), {}));
      // const
    } catch (err) {
      // Report any exceptions directly back to the client. As with our handleErrors() this
      // probably isn't what you'd want to do in production, but it's convenient when testing.
      webSocket.send(JSON.stringify({ error: err.stack }));
    }
  }

  async webSocketClose(webSocket: WebSocket) {
    this.connections.delete(webSocket);
  }

  async webSocketError(webSocket: WebSocket) {
    this.connections.delete(webSocket);
  }
}
