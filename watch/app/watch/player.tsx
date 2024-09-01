"use client";
import { useEffect, useRef } from "react";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

export default function Player({ events, loadId }) {
  const playerRef = useRef<null | HTMLElement>(null);

  useEffect(() => {
    let player: rrwebPlayer;
    if (playerRef.current) {
      console.log("calling it once");
      console.log("events", events[0]);
      player = new rrwebPlayer({
        target: playerRef.current, // customizable root element
        props: {
          events: events[parseInt(loadId)],
        },
      });
      return () => {
        if (playerRef.current) {
          player.getReplayer().destroy();
          playerRef.current.replaceChildren();
        }
      };
    }
  }, [playerRef]);

  return (
    <div>
      <div ref={playerRef}></div>
      <ul>
        {events.map((x, i) => {
          return <li key={`e${i}`}>{JSON.stringify(x[0].type)}</li>;
        })}
      </ul>
    </div>
  );
}
