"use client";
import { record } from "rrweb";
import { compress, strToU8 } from "fflate";

export class ClerkRecorderManager {
  activeRecorder: ClerkRecorder | null = null;
  tabId: string;

  constructor() {
    this.tabId = self.crypto.randomUUID();
    if (document.hasFocus()) {
      this.activeRecorder = new ClerkRecorder(this.tabId);
    }
    this.setupListeners();
  }
  setupListeners() {
    // TODO: Add navigator online listeners
    window.addEventListener("focus", () => {});
    window.addEventListener("blur", () => {});
    document.addEventListener("visibilitychange", () => {
      console.log(
        "visibility change",
        document.hidden ? "hide" : "show",
        this.activeRecorder?.recId
      );
      if (document.hidden) {
        if (this.activeRecorder) {
          this.activeRecorder.close();
          this.activeRecorder = null;
        }
      } else {
        if (!this.activeRecorder) {
          this.activeRecorder = new ClerkRecorder(this.tabId);
        }
      }
    });
  }
}

class ClerkRecorder {
  ws: WebSocket;
  events: any[] = [];
  poller;
  stopRecord: () => void;
  recId: string;

  constructor(tabId: string) {
    this.recId = self.crypto.randomUUID();
    const stopFn = record({
      emit: (event) => {
        this.events.push(event);
      },
    });
    if (!stopFn) {
      throw new Error("Recording failed");
    }
    this.stopRecord = stopFn;
    console.log("open ws.", this.recId);
    this.ws = new WebSocket(`ws://localhost:8787/sr/ws/${tabId}`);
    this.poller = setInterval(() => this.sendEvents(), 5000);
  }

  async close() {
    console.log("close ws start", this.recId);
    this.stopRecord();
    console.log("close ws 2", this.recId);
    clearInterval(this.poller);
    console.log("close ws 3", this.recId);
    await this.sendEvents();
    console.log("close ws 4", this.recId);
    this.ws.close();
    console.log("close ws end", this.recId);
  }

  sendEvents() {
    return new Promise<void>((resolve) => {
      // console.log("send events called;");
      if (this.ws?.readyState === this.ws?.OPEN) {
        if (this.events.length === 0) {
          resolve();
        }
        const toSend = this.events;
        this.events = [];
        compress(strToU8(JSON.stringify(toSend)), {}, (err, data) => {
          this.ws.send(data);
          resolve();
        });
      }
    });
  }
}

// let currentWebSocket: null | WebSocket = null;
// let lastAttemptTime: number | null = null;

// function openWS() {
//   if (lastAttemptTime) {
//     const timeSinceLastAttempt = Date.now() - lastAttemptTime;
//     if (timeSinceLastAttempt < 10000) {
//       setTimeout(() => {
//         openWS();
//       }, 10000 - timeSinceLastAttempt);
//       return;
//     }
//   }
//   lastAttemptTime = Date.now();

//   // If we are running via wrangler dev, use ws:
//   const wss = document.location.protocol === "http:" ? "ws://" : "wss://";
//   let ws = new WebSocket("ws://localhost:8787/sr/ws");

//   ws.addEventListener("open", (event) => {
//     currentWebSocket = ws;
//     console.log("WebSocket open");
//   });

//   ws.addEventListener("close", (event) => {
//     currentWebSocket = null;
//     console.log("WebSocket closed, reconnecting:", event.code, event.reason);
//     openWS();
//   });
//   // ws.addEventListener("error", (event) => {
//   //   console.log("WebSocket error, reconnecting:", event);
//   //   openWS();
//   // });
// }

// function ClerkRecorderOG() {
//   openWS();
//   const load_id = Date.now() + "_" + self.crypto.randomUUID();
//   type EventData = any; // Define a type for the event data

//   let events: any[] = [];
//   let stopRecord;

//   const startRecord = () => {
//     stopRecord = record({
//       emit(event) {
//         events.push(event);
//       },
//     });
//   };
//   window.addEventListener("focus", () => {});
//   // Function to send data using the current writable stream
//   async function sendData(): Promise<void> {
//     if (events.length == 0) {
//       return;
//     }

//     const toSend = events;
//     events = [];
//     compress(strToU8(JSON.stringify(toSend)), {}, (err, data) => {
//       if (currentWebSocket) {
//         currentWebSocket.send(data);
//       }
//     });
//   }

//   // Set up a periodic function to send data every second
//   setInterval(sendData, 2000);

//   return null;
// }
