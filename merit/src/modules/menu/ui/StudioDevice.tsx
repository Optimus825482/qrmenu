"use client";

import type { ReactNode } from "react";
import { DeviceFrameset } from "react-device-frameset";
import "react-device-frameset/styles/marvel-devices.min.css";

export const STUDIO_DEVICES = [
  { id: "iphone-promax", label: "iPhone 19 Pro Max" },
  { id: "iphone-x", label: "iPhone X" },
  { id: "iphone-8", label: "iPhone 8" },
  { id: "note-8", label: "Galaxy Note 8" },
  { id: "ipad", label: "iPad Mini" },
] as const;

export type StudioDeviceId = (typeof STUDIO_DEVICES)[number]["id"];

/** Outer size of the Marvel frame or modern Pro Max frame, including its content-box padding. */
export const DEVICE_BOX: Record<StudioDeviceId, { w: number; h: number }> = {
  "iphone-promax": { w: 458, h: 960 },
  "iphone-x": { w: 427, h: 864 },
  "iphone-8": { w: 423, h: 877 },
  "note-8": { w: 420, h: 912 },
  "ipad": { w: 626, h: 948 },
};

/** Marvel Devices ve modern iPhone 19 Pro Max çerçevesi. */
export function StudioDevice({ device, children }: { device: StudioDeviceId; children: ReactNode }) {
  if (device === "iphone-promax") {
    return (
      <div className="xp-device-promax">
        <div className="xp-device-promax-island" aria-hidden="true">
          <span className="xp-device-promax-cam" />
        </div>
        <div className="screen xp-device-promax-screen">{children}</div>
        <div className="xp-device-promax-bar" aria-hidden="true" />
      </div>
    );
  }
  if (device === "iphone-8") return <DeviceFrameset device="iPhone 8" color="black">{children}</DeviceFrameset>;
  if (device === "note-8") return <DeviceFrameset device="Galaxy Note 8">{children}</DeviceFrameset>;
  if (device === "ipad") return <DeviceFrameset device="iPad Mini" color="black">{children}</DeviceFrameset>;
  return <DeviceFrameset device="iPhone X">{children}</DeviceFrameset>;
}
