"use client";
import { useEffect } from "react";
import { ClerkRecorderManager } from "./record";
export default function Recorder() {
  useEffect(() => {
    if (window && !window.hasOwnProperty("ClerkRecorderManager")) {
      // @ts-ignore
      window.ClerkRecorderManager = new ClerkRecorderManager();
    }
  });
  return null;
}
