"use client";
import { useEffect } from "react";
import { record } from "rrweb";
import ClerkRecorder from "./record";
export default function Recorder() {
  useEffect(() => {
    // record({
    //   emit(event) {
    //     // push event into the events array
    //     console.log(JSON.stringify(event));
    //   },
    // });
    if (window && !window.hasOwnProperty("ClerkRecorder")) {
      // @ts-ignore
      window.ClerkRecorder = new ClerkRecorder();
    }
  });
  return null;
}
