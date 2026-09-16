import React from "react";
import Map from "./Map";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <div style={{ width: "100%", height: "100dvh" }}>
      <Map />
      <Analytics />
    </div>
  );
}
