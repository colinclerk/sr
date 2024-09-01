"use client";
import { record } from "rrweb";
import { compress, decompressSync, strFromU8, strToU8 } from "fflate";

let currentWebSocket: null | WebSocket = null;
let lastAttemptTime: number | null = null;

function openWS() {
  if (lastAttemptTime) {
    const timeSinceLastAttempt = Date.now() - lastAttemptTime;
    if (timeSinceLastAttempt < 10000) {
      setTimeout(() => {
        openWS();
      }, 10000 - timeSinceLastAttempt);
      return;
    }
  }
  lastAttemptTime = Date.now();

  // If we are running via wrangler dev, use ws:
  const wss = document.location.protocol === "http:" ? "ws://" : "wss://";
  let ws = new WebSocket("ws://localhost:8787/sr/ws");

  ws.addEventListener("open", (event) => {
    currentWebSocket = ws;
    console.log("WebSocket open");
  });

  ws.addEventListener("close", (event) => {
    currentWebSocket = null;
    console.log("WebSocket closed, reconnecting:", event.code, event.reason);
    openWS();
  });
  // ws.addEventListener("error", (event) => {
  //   console.log("WebSocket error, reconnecting:", event);
  //   openWS();
  // });
}

export default function ClerkRecorder() {
  openWS();
  const load_id = Date.now() + "_" + self.crypto.randomUUID();
  type EventData = any; // Define a type for the event data

  let events: any[] = [];

  record({
    emit(event) {
      console.log(event);
      events.push(event);
    },
  });

  // Function to send data using the current writable stream
  async function sendData(): Promise<void> {
    if (events.length == 0) {
      return;
    }

    const toSend = events;
    events = [];
    compress(strToU8(JSON.stringify(toSend)), {}, (err, data) => {
      if (currentWebSocket) {
        currentWebSocket.send(data);
      }
    });
  }

  // Set up a periodic function to send data every second
  setInterval(sendData, 2000);

  return null;
}
