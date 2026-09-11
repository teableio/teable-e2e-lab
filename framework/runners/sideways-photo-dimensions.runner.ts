import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSignature as apiGetSignature,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  UploadType,
} from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SidewaysPhotoDimensionsCaseConfig } from "../types";

// A photo taken with the phone held sideways -> upload it -> checkpoint: the
// size it is recorded at is the size it is displayed at.
//
// Cameras do not rotate pixels. A phone held sideways writes the picture the
// way the sensor read it and adds a note saying "this is rotated a quarter
// turn"; every viewer honours that note, which is why the photo looks upright
// everywhere. The stored width and height belong to the unrotated pixels, so
// they are the wrong way round compared with what anybody sees.
//
// Those stored numbers were recorded as they came. Everything downstream that
// reserves space for the picture - the cell, the gallery tile, the thumbnail it
// is cropped into - then works from a landscape shape for a portrait photo, and
// the picture arrives stretched, cropped down the middle, or sideways.
//
// This case uploads such a photo and asks the product what size it is. The
// fixture is a fixed 64x16 image carrying the rotation note, so the right
// answer is 16 wide by 64 high, and a build that ignored the note answers with
// exactly the numbers it was given.

// A 64x16 JPEG whose EXIF orientation is 6 (a quarter turn clockwise), written
// byte for byte so every run uploads the same photo.
const SIDEWAYS_JPEG_BASE64 =
  "/9j/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAAAAD/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAQAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwB1FFFe2eQFFFFABRRRQAUUUUAf/9k=";

export const runSidewaysPhotoDimensionsCase = async (
  bugCase: BugCaseFor<"sideways-photo-dimensions">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SidewaysPhotoDimensionsCaseConfig = bugCase.config;
  const photoPath = join(
    tmpdir(),
    `e2e-lab-sideways-${context.runId}-${config.fileName}`,
  );

  try {
    const bytes = Buffer.from(SIDEWAYS_JPEG_BASE64, "base64");
    // Fixture verification, outside the checkpoint: it is a JPEG and it really
    // carries the rotation note. Without the note the stored size is the
    // displayed size and the case would be asserting nothing.
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error("the fixture photo is not a JPEG");
    }
    const marker = bytes.indexOf(Buffer.from("Exif\0\0", "binary"));
    if (marker < 0) {
      throw new Error("the fixture photo carries no EXIF block to rotate it");
    }
    await writeFile(photoPath, bytes);

    // Getting somewhere to put the bytes and putting them there is fixture, so
    // it stays outside the checkpoint: a rejected signature request is the case
    // failing to run, not the product answering wrongly. The first attempt did
    // this inside the checkpoint and reported "The baseId is required when type
    // is Table" as a reproduction on both columns (run 34568213403).
    const signature = await apiGetSignature(
      {
        type: UploadType.Table,
        baseId: globalThis.testConfig.baseId,
        contentLength: bytes.byteLength,
        contentType: "image/jpeg",
      },
      undefined,
    );
    await apiUploadFile(
      signature.data.token,
      createReadStream(photoPath),
      signature.data.requestHeaders,
    );

    const probe = await bugCheckpoint(
      "a-sideways-photo-is-recorded-at-the-size-it-is-shown",
      async () => {
        // Telling the product the bytes arrived is what makes it look at them,
        // and its answer carries the size everything downstream reserves space
        // from.
        const notified = await apiNotify(
          signature.data.token,
          undefined,
          config.fileName,
        );

        const width = notified.data.width ?? null;
        const height = notified.data.height ?? null;
        if (width === null || height === null) {
          throw new Error(
            `the upload came back with no size at all (${JSON.stringify({ width, height })}) - whatever reserves ` +
              "space for the picture has nothing to work from",
          );
        }
        if (
          width !== config.displayedWidth ||
          height !== config.displayedHeight
        ) {
          throw new Error(
            `the photo is recorded as ${width}x${height}, and it is displayed as ` +
              `${config.displayedWidth}x${config.displayedHeight} - the rotation the camera noted was ignored, so ` +
              "everything that reserves space for it reserves the wrong shape",
          );
        }
        return { width, height, token: notified.data.token };
      },
    );

    return {
      details: {
        storedWidth: probe.width,
        storedHeight: probe.height,
        expected: `${config.displayedWidth}x${config.displayedHeight}`,
        token: probe.token,
      },
    };
  } finally {
    try {
      await unlink(photoPath);
    } catch {
      // The temporary copy is the case's own housekeeping.
    }
  }
};
