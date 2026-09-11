import { defineBugCase } from "../../framework/types";

// T5712: cameras do not rotate pixels. A phone held sideways writes the picture
// the way the sensor read it and adds a note saying "this is rotated a quarter
// turn"; every viewer honours that note, so the stored width and height are the
// wrong way round compared with what anybody sees. Those stored numbers were
// recorded as they came, so everything that reserves space for the picture -
// the cell, the gallery tile, the thumbnail it is cropped into - worked from a
// landscape shape for a portrait photo.
export default defineBugCase({
  id: "attachment/y889-a-photo-taken-sideways",
  title: "A photo taken sideways is recorded at the size it is shown",
  runner: "sideways-photo-dimensions",
  timeoutMs: 180_000,
  bug: {
    issue: "T5712",
    status: "fixed",
    sourceCommits: ["153ea8cfc"],
  },
  config: {
    fileName: "held-sideways.jpg",
    displayedWidth: 16,
    displayedHeight: 64,
  },
});
